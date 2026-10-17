import {
  ANDROID_FILE_SOURCE,
  buildAudioSource,
  buildStartOptions,
  evaluateSupport,
  normalizeSystemLocale,
  permissionDeniedMessage,
  mapSpeechError,
  pickLocale,
  type SpeechSupportApi,
} from './transcribeSupport';

describe('pickLocale', () => {
  it('uses the device tag when it is available', () => {
    expect(pickLocale('de-DE', ['en-US', 'de-DE'])).toBe('de-DE');
  });
  it('falls to another region of the same language', () => {
    expect(pickLocale('en-GB', ['fr-FR', 'en-AU', 'en-US'])).toBe('en-AU');
  });
  it('falls back to en-US when the device language is not available', () => {
    expect(pickLocale('ko-KR', ['fr-FR', 'en-US'])).toBe('en-US');
  });
  it('returns null when neither the device language nor en-US is available', () => {
    expect(pickLocale('ko-KR', ['fr-FR', 'de-DE'])).toBeNull();
    expect(pickLocale('en-US', [])).toBeNull();
  });
  it('treats a bad or empty device tag as en-US', () => {
    expect(pickLocale('', ['fr-FR', 'en-US'])).toBe('en-US');
    expect(pickLocale(null, ['en-US'])).toBe('en-US');
    expect(pickLocale(undefined, ['fr-FR'])).toBeNull();
    expect(pickLocale('???', ['en-US'])).toBe('en-US');
  });
  it('compares case-insensitively and with underscores, returning the available spelling', () => {
    expect(pickLocale('de_de', ['en-US', 'de-DE'])).toBe('de-DE');
  });
});

const api = (over: Partial<Record<keyof SpeechSupportApi, unknown>> = {}): SpeechSupportApi => ({
  isRecognitionAvailable: () => true,
  supportsOnDeviceRecognition: () => true,
  getSupportedLocales: async () => ({ locales: ['en-US', 'de-DE'], installedLocales: ['en-US'] }),
  ...(over as Partial<SpeechSupportApi>),
});

describe('evaluateSupport', () => {
  const run = (
    os: string,
    version: string | number,
    a: SpeechSupportApi,
    tag = 'en-US',
    system: string | null = 'en_US',
  ) => evaluateSupport({ os, version, api: a, deviceTag: tag, systemLocale: system });

  it('Android 13 with an installed model is supported', async () => {
    const r = await run('android', 33, api());
    expect(r.supported).toBe(true);
    expect(r.locale?.lang).toBe('en-US');
  });
  it('Android 12 (API 32) is not', async () => {
    expect((await run('android', 32, api())).supported).toBe(false);
  });
  it('Android reads installedLocales, not the listed ones', async () => {
    const r = await run('android', 34, api(), 'de-DE');
    expect(r.locale?.lang).toBe('en-US');
  });
  it('Android without the locale installed is not supported', async () => {
    const a = api({
      getSupportedLocales: async () => ({ locales: ['en-US'], installedLocales: [] }),
    });
    expect((await run('android', 34, a)).supported).toBe(false);
  });
  it('not supported when recognition is unavailable or not on-device', async () => {
    expect((await run('android', 34, api({ isRecognitionAvailable: () => false }))).supported).toBe(
      false,
    );
    expect(
      (await run('android', 34, api({ supportsOnDeviceRecognition: () => false }))).supported,
    ).toBe(false);
    expect(
      (await run('ios', 17, api({ supportsOnDeviceRecognition: () => false }))).supported,
    ).toBe(false);
  });
  it('iOS uses the system locale only (not Intl), has no API floor', async () => {
    const r = await run('ios', '17.0', api(), 'en-GB', 'de_DE');
    expect(r.supported).toBe(true);
    expect(r.locale?.lang).toBe('de-DE');
  });
  it('iOS never falls back: system locale not listed, region override, missing', async () => {
    expect((await run('ios', '17.0', api(), 'en-US', 'ko_KR')).supported).toBe(false);
    expect((await run('ios', '17.0', api(), 'en-US', 'en_US@rg=gbzzzz')).supported).toBe(false);
    expect((await run('ios', '17.0', api(), 'en-US', null)).supported).toBe(false);
  });
  it('iOS without a usable locale is not supported', async () => {
    const a = api({
      getSupportedLocales: async () => ({ locales: ['fr-FR'], installedLocales: [] }),
    });
    expect((await run('ios', '17.0', a)).supported).toBe(false);
  });
  it('any call that throws means not supported', async () => {
    const boom = () => {
      throw new Error('x');
    };
    expect((await run('ios', 17, api({ isRecognitionAvailable: boom }))).supported).toBe(false);
    expect((await run('ios', 17, api({ supportsOnDeviceRecognition: boom }))).supported).toBe(
      false,
    );
    expect((await run('ios', 17, api({ getSupportedLocales: async () => boom() }))).supported).toBe(
      false,
    );
  });
  it('other platforms are not supported', async () => {
    expect((await run('web', 1, api())).supported).toBe(false);
  });
});

describe('mapSpeechError', () => {
  it.each(['no-speech', 'speech-timeout', 'nomatch'])('%s delivers nothing heard', (error) => {
    expect(mapSpeechError({ error })).toEqual({ kind: 'empty' });
  });
  it('aborted is cancelled', () => {
    expect(mapSpeechError({ error: 'aborted' })).toEqual({ kind: 'cancelled' });
  });
  it.each([
    ['not-allowed', 'permission'],
    ['language-not-supported', 'no-model'],
    ['service-not-allowed', 'unsupported'],
    ['audio-capture', 'unsupported'],
    ['busy', 'busy'],
    ['network', 'failed'],
    ['interrupted', 'failed'],
    ['client', 'failed'],
    ['unknown', 'failed'],
    ['something-new', 'failed'],
  ])('%s maps to %s', (error, code) => {
    const out = mapSpeechError({ error });
    expect(out.kind).toBe('failed');
    if (out.kind === 'failed') {
      expect(out.code).toBe(code);
      expect(out.message).not.toBe('');
    }
  });
});

describe('buildAudioSource', () => {
  const cache = 'file:///data/user/0/app/cache/Audio/new.m4a';
  const stored = 'file:///data/user/0/app/files/dreams/g1.m4a';
  it('iOS passes the uri only, untouched', () => {
    expect(buildAudioSource('ios', cache)).toEqual({ uri: cache });
    expect(buildAudioSource('ios', stored)).toEqual({ uri: stored });
  });
  it('Android adds the m4a encoding constants and leaves the uri untouched', () => {
    expect(buildAudioSource('android', cache)).toEqual({ uri: cache, ...ANDROID_FILE_SOURCE });
    expect(buildAudioSource('android', stored)).toEqual({ uri: stored, ...ANDROID_FILE_SOURCE });
  });
  it('the Android constants equal the S0 spike defaults', () => {
    expect(ANDROID_FILE_SOURCE).toEqual({
      audioChannels: 2,
      sampleRate: 44100,
      audioEncoding: 2, // AudioEncodingAndroid.ENCODING_PCM_16BIT
    });
  });
});

describe('normalizeSystemLocale', () => {
  it('turns underscores into dashes', () => {
    expect(normalizeSystemLocale('en_US')).toBe('en-US');
    expect(normalizeSystemLocale('zh_Hans_CN')).toBe('zh-Hans-CN');
  });
  it('is ineligible with @, a -u- extension, or nothing', () => {
    expect(normalizeSystemLocale('fr_FR@rg=dezzzz')).toBeNull();
    expect(normalizeSystemLocale('en-US-u-ca-gregory')).toBeNull();
    expect(normalizeSystemLocale('')).toBeNull();
    expect(normalizeSystemLocale(null)).toBeNull();
    expect(normalizeSystemLocale(undefined)).toBeNull();
  });
});

describe('buildStartOptions', () => {
  it('always has the on-device flag true and the checked locale, on both platforms', async () => {
    for (const os of ['ios', 'android'] as const) {
      const r = await evaluateSupport({
        os,
        version: 34,
        api: api(),
        deviceTag: 'en-US',
        systemLocale: 'en_US',
      });
      if (!r.supported) throw new Error('expected supported');
      const o = buildStartOptions(os, r.locale, 'file:///x/a.m4a');
      expect(o.requiresOnDeviceRecognition).toBe(true);
      expect(o.lang).toBe(r.locale.lang);
      expect(o.continuous).toBe(true);
      expect(o.audioSource).toEqual(buildAudioSource(os, 'file:///x/a.m4a'));
    }
  });
});

describe('permissionDeniedMessage', () => {
  it('names the right settings per platform', () => {
    expect(permissionDeniedMessage('ios')).toMatch(/under Lucid/);
    expect(permissionDeniedMessage('android')).toMatch(/Apps, Lucid, Permissions/);
  });
});
