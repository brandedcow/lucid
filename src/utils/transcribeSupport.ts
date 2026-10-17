import { I18nManager } from 'react-native';
import { AudioEncodingAndroid } from 'expo-speech-recognition';
import type { AudioSourceOptions, ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

// Pure helpers for on-device file transcription: the capability check, the locale choice, the
// audio source and the error mapping. Nothing here starts a recognition or asks for a permission.

/** The fallback locale and the one the device spike (S0) verified. */
export const FALLBACK_LOCALE = 'en-US';

/**
 * Android only: how the recognizer reads an m4a file. These are the values the S0 spike used for
 * m4a (stereo, 44.1 kHz = the HIGH_QUALITY recording preset, PCM 16 bit = the spike's first
 * option). UNVERIFIED on device whether Android needs the encoding for m4a at all, and which
 * encoding the S0 run used; confirm with one device run.
 */
export const ANDROID_FILE_SOURCE = {
  audioChannels: 2,
  sampleRate: 44100,
  audioEncoding: AudioEncodingAndroid.ENCODING_PCM_16BIT,
} as const;

/** Android 13 (API 33) is the first version that accepts a file as the audio source. */
export const MIN_ANDROID_API = 33;

export type SpeechOs = 'ios' | 'android';

/** The part of ExpoSpeechRecognitionModule the capability check reads (none of it prompts). */
export type SpeechSupportApi = {
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
  getSupportedLocales(options: {
    androidRecognitionServicePackage?: string;
  }): Promise<{ locales: string[]; installedLocales: string[] }>;
};

declare const checkedBrand: unique symbol;

/**
 * A recognition locale that `evaluateSupport` has just proven usable on-device. Only that function
 * can make one, and `buildStartOptions` is the only thing that turns it into start options, so no
 * other locale can reach the recognizer.
 */
export type CheckedLocale = { readonly lang: string; readonly [checkedBrand]: true };

const mint = (lang: string): CheckedLocale => ({ lang }) as CheckedLocale;

export type SupportResult =
  { supported: true; locale: CheckedLocale } | { supported: false; locale: null };

const norm = (tag: string) => tag.replace(/_/g, '-').toLowerCase();
const language = (tag: string) => norm(tag).split('-')[0];

/**
 * The locale to transcribe in: the device language tag if available, else another available
 * region of the same language, else en-US if available, else null. A bad or empty device tag falls
 * back to en-US. Returns the entry of `available` as the module spelled it.
 */
export function pickLocale(
  deviceTag: string | null | undefined,
  available: string[],
): string | null {
  const tag = typeof deviceTag === 'string' && deviceTag.trim() !== '' ? deviceTag.trim() : null;
  if (tag) {
    const exact = available.find((l) => norm(l) === norm(tag));
    if (exact) return exact;
    const sameLanguage = available.find((l) => language(l) === language(tag));
    if (sameLanguage) return sameLanguage;
  }
  return available.find((l) => norm(l) === norm(FALLBACK_LOCALE)) ?? null;
}

/** The device language tag from Intl (Hermes behavior UNVERIFIED); null if it throws or is empty. */
export function deviceLocaleTag(): string | null {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale;
    return typeof tag === 'string' && tag !== '' ? tag : null;
  } catch {
    return null;
  }
}

/** The platform's current system locale identifier (iOS: the NSLocale the default recognizer uses). */
export function systemLocaleTag(): string | null {
  try {
    const id = I18nManager.getConstants().localeIdentifier;
    return typeof id === 'string' && id !== '' ? id : null;
  } catch {
    return null;
  }
}

/**
 * The iOS recognition locale: the system locale only, underscores to dashes. Null (ineligible) for a
 * missing identifier or one with a region override (`@...`) or a `-u-` extension.
 */
export function normalizeSystemLocale(id: string | null | undefined): string | null {
  if (typeof id !== 'string' || id.trim() === '' || id.includes('@')) return null;
  const tag = id.trim().replace(/_/g, '-');
  if (/-u-/i.test(tag)) return null;
  return tag;
}

/**
 * Whether on-device transcription can run now, and in which (checked) locale. Any call that throws
 * means not supported. Never asks for a permission.
 * - Android: API 33+, available, on-device, and a locale among the installed ones (`pickLocale`).
 * - iOS: the library applies the on-device flag only when the recognizer of the chosen locale
 *   supports it, and can only check the SYSTEM locale's recognizer. So the only iOS locale is the
 *   system locale, and it must be among the supported ones; no other-region or en-US fallback.
 */
export async function evaluateSupport(opts: {
  os: string;
  version: string | number;
  api: SpeechSupportApi;
  /** Android: the device language tag (Intl). */
  deviceTag?: string | null;
  /** iOS: the system locale identifier (I18nManager). */
  systemLocale?: string | null;
}): Promise<SupportResult> {
  const none: SupportResult = { supported: false, locale: null };
  try {
    const { os, api } = opts;
    if (os !== 'ios' && os !== 'android') return none;
    if (os === 'android' && !(Number(opts.version) >= MIN_ANDROID_API)) return none;
    if (!api.isRecognitionAvailable()) return none;
    if (!api.supportsOnDeviceRecognition()) return none;
    const { locales, installedLocales } = await api.getSupportedLocales({});
    if (os === 'android') {
      const locale = pickLocale(opts.deviceTag, installedLocales ?? []);
      return locale ? { supported: true, locale: mint(locale) } : none;
    }
    const system = normalizeSystemLocale(opts.systemLocale);
    if (!system || !(locales ?? []).includes(system)) return none;
    return { supported: true, locale: mint(system) };
  } catch {
    return none;
  }
}

/**
 * The recognizer's audio source for a recording file. The URI is passed through exactly as the app
 * holds it (a `file://` string); iOS takes the uri only, Android also the encoding values.
 */
export function buildAudioSource(os: string, uri: string): AudioSourceOptions {
  if (os === 'android') return { uri, ...ANDROID_FILE_SOURCE };
  return { uri };
}

/**
 * The ONLY builder of the recognizer's start options. `requiresOnDeviceRecognition` is the literal
 * `true`; the locale can only be a `CheckedLocale`.
 */
export function buildStartOptions(
  os: string,
  checked: CheckedLocale,
  uri: string,
): ExpoSpeechRecognitionOptions {
  return {
    lang: checked.lang,
    interimResults: true,
    continuous: true,
    requiresOnDeviceRecognition: true,
    audioSource: buildAudioSource(os, uri),
  };
}

/** Inactivity limit when the clip length is unknown. */
export const UNKNOWN_DURATION_WATCHDOG_MS = 60_000;
const WATCHDOG_MIN_MS = 30_000;
const WATCHDOG_MAX_MS = 600_000;

/** No-event limit for a run: clamp(30 s + 1.5 x clip length, 30 s, 10 min); 60 s when unknown. */
export function watchdogMs(durationMs?: number): number {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return UNKNOWN_DURATION_WATCHDOG_MS;
  }
  return Math.min(WATCHDOG_MAX_MS, Math.max(WATCHDOG_MIN_MS, WATCHDOG_MIN_MS + 1.5 * durationMs));
}

/** The message for a refused speech permission, per platform. */
export function permissionDeniedMessage(os: string): string {
  return os === 'ios'
    ? 'Speech recognition is off for Lucid. Turn it on in Settings, under Lucid, then try again.'
    : 'Lucid needs permission to use speech recognition. Turn it on in Settings, under Apps, Lucid, Permissions (microphone), then try again.';
}

export type SpeechErrorOutcome =
  | { kind: 'empty' } // nothing heard: delivered as '' (not a failure)
  | { kind: 'cancelled' }
  | {
      kind: 'failed';
      code: 'unsupported' | 'busy' | 'permission' | 'no-model' | 'failed';
      message: string;
    };

/** Maps a recognizer error event to what the hook does. `network` is never retried. */
export function mapSpeechError(e: { error?: string }): SpeechErrorOutcome {
  switch (e.error) {
    case 'no-speech':
    case 'speech-timeout':
    case 'nomatch':
      return { kind: 'empty' };
    case 'aborted':
      return { kind: 'cancelled' };
    case 'not-allowed':
      return {
        kind: 'failed',
        code: 'permission',
        message: 'Speech recognition is not allowed.',
      };
    case 'language-not-supported':
      return {
        kind: 'failed',
        code: 'no-model',
        message: 'The speech model for this language is not installed on this device.',
      };
    case 'service-not-allowed':
    case 'audio-capture':
      return {
        kind: 'failed',
        code: 'unsupported',
        message: 'This device cannot transcribe voice notes.',
      };
    case 'busy':
      return { kind: 'failed', code: 'busy', message: 'The speech recognizer is busy.' };
    default:
      return { kind: 'failed', code: 'failed', message: 'Could not transcribe this voice note.' };
  }
}
