import { useEffect } from 'react';
import { AppState, I18nManager, Platform, Settings } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { UNKNOWN_DURATION_WATCHDOG_MS, watchdogMs } from '../utils/transcribeSupport';
import { fakeSpeech } from '../test/fakeSpeechRecognition';
import { stopAllPlayback } from './useRecordingPlayback';
import {
  RecordingTranscriptionHook,
  END_WAIT_MS,
  useRecordingTranscription,
} from './useRecordingTranscription';

jest.mock('./useRecordingPlayback', () => ({ stopAllPlayback: jest.fn() }));

const NEW_URI = 'file:///cache/Audio/new.m4a';
const STORED_URI = 'file:///document/dreams/g1.m4a';

// The latest value the probe component rendered.
const latest = { hook: null as unknown as RecordingTranscriptionHook };
let results: [string, string][] = [];
let recording = false;
let onlineSetting = false;
// iOS: what Settings.get('AppleLocale') returns (the only iOS locale source). Any type, to test bad values.
let systemLocale: unknown = 'en_US';
let appleLanguages: unknown = undefined;
// Android: I18nManager.getConstants().localeIdentifier (undefined on iOS in reality).
let i18nLocale: string | undefined = 'en_US';
let settingsGets: string[] = [];
let appStateHandlers: ((s: string) => void)[] = [];
let mountedHook: Awaited<ReturnType<typeof render>>;

function Probe() {
  const value = useRecordingTranscription({
    onResult: (id, text) => results.push([id, text]),
    isRecording: () => recording,
    onlineAllowed: onlineSetting,
  });
  useEffect(() => {
    latest.hook = value;
  });
  return null;
}

// Everything faked per test is restored explicitly (not with restoreAllMocks, which would also
// reset the mocks the Jest setup installs).
const restorers: (() => void)[] = [];
const spy = <T extends { mockRestore(): void }>(s: T): T => {
  restorers.push(() => s.mockRestore());
  return s;
};
const setOs = (os: 'ios' | 'android') => {
  const r = jest.replaceProperty(Platform, 'OS', os);
  restorers.push(() => r.restore());
};
const setVersion = (v: number) => spy(jest.spyOn(Platform, 'Version', 'get')).mockReturnValue(v);
const setLocale = (locale: string) =>
  spy(jest.spyOn(Intl, 'DateTimeFormat')).mockImplementation(
    () => ({ resolvedOptions: () => ({ locale }) }) as unknown as Intl.DateTimeFormat,
  );
const fakeLocaleSources = () => {
  spy(jest.spyOn(I18nManager, 'getConstants')).mockImplementation(
    () =>
      ({
        isRTL: false,
        doLeftAndRightSwapInRTL: true,
        localeIdentifier: i18nLocale,
      }) as ReturnType<typeof I18nManager.getConstants>,
  );
  spy(jest.spyOn(Settings, 'get')).mockImplementation((key: string) => {
    settingsGets.push(key);
    if (key === 'AppleLocale') return systemLocale;
    if (key === 'AppleLanguages') return appleLanguages;
    return undefined;
  });
};
// A real macrotask (captured before any fake timers), so every pending promise chain settles.
const realSetTimeout = setTimeout;
const flush = () => new Promise<void>((resolve) => realSetTimeout(resolve, 0));
const mount = async () => {
  mountedHook = await render(<Probe />);
  await act(flush);
};
const begin = async (id = 'a', uri = NEW_URI, durationMs?: number) => {
  let done: Promise<void> = Promise.resolve();
  await act(async () => {
    done = latest.hook.start(id, uri, durationMs);
    await flush();
  });
  return { done };
};
const emit = (fn: () => void) =>
  act(async () => {
    fn();
    await flush();
  });
const foreground = (state: string) =>
  act(async () => {
    appStateHandlers.forEach((h) => h(state));
    await flush();
  });

beforeEach(() => {
  jest.clearAllMocks();
  fakeSpeech.reset();
  fakeSpeech.enable();
  results = [];
  recording = false;
  onlineSetting = false;
  appStateHandlers = [];
  setOs('android');
  setVersion(34);
  setLocale('en-US');
  systemLocale = 'en_US';
  appleLanguages = undefined;
  i18nLocale = 'en_US';
  settingsGets = [];
  fakeLocaleSources();
  spy(jest.spyOn(AppState, 'addEventListener')).mockImplementation((_e, h) => {
    appStateHandlers.push(h as (s: string) => void);
    return {
      remove: () => {
        appStateHandlers = appStateHandlers.filter((x) => x !== h);
      },
    };
  });
});
afterEach(() => {
  jest.useRealTimers();
  while (restorers.length) restorers.pop()?.();
});

describe('supported', () => {
  it('is false until the check resolves, then true', async () => {
    const release = fakeSpeech.holdLocales();
    await render(<Probe />);
    expect(latest.hook.supported).toBe(false);
    await act(async () => {
      release();
      await flush();
    });
    expect(latest.hook.supported).toBe(true);
    expect(latest.hook.busyId).toBeNull();
  });

  it('shows no permission prompt at check time', async () => {
    await mount();
    expect(fakeSpeech.permissionRequests).toEqual([]);
  });

  it('stays false without an installed model', async () => {
    fakeSpeech.set({ installedLocales: [] });
    await mount();
    expect(latest.hook.supported).toBe(false);
  });

  it('stays false on Android 12 (API 32)', async () => {
    setVersion(32);
    await mount();
    expect(latest.hook.supported).toBe(false);
  });

  it('stays false when a capability call throws', async () => {
    fakeSpeech.throwOn('supportsOnDeviceRecognition');
    await mount();
    expect(latest.hook.supported).toBe(false);
  });

  it('is re-checked on returning to the foreground only while false', async () => {
    fakeSpeech.set({ installedLocales: [] });
    await mount();
    expect(latest.hook.supported).toBe(false);
    const calls = fakeSpeech.getSupportedLocalesCalls;
    fakeSpeech.enable(); // the model got installed
    await foreground('active');
    expect(latest.hook.supported).toBe(true);
    expect(fakeSpeech.getSupportedLocalesCalls).toBe(calls + 1);
    await foreground('active');
    expect(fakeSpeech.getSupportedLocalesCalls).toBe(calls + 1); // not again once true
  });

  it('is not re-checked when backgrounding', async () => {
    fakeSpeech.set({ installedLocales: [] });
    await mount();
    const calls = fakeSpeech.getSupportedLocalesCalls;
    await foreground('background');
    expect(fakeSpeech.getSupportedLocalesCalls).toBe(calls);
  });
});

describe('start', () => {
  it('runs the steps in order and sets busyId and running', async () => {
    await mount();
    const order: string[] = [];
    (stopAllPlayback as jest.Mock).mockImplementation(() => order.push('stopAllPlayback'));
    const release = fakeSpeech.holdPermissionRequest();
    let done: Promise<void> = Promise.resolve();
    await act(async () => {
      done = latest.hook.start('a', NEW_URI);
      await flush();
    });
    // Waiting on the permission prompt: nothing started, nothing stopped yet.
    expect(fakeSpeech.permissionRequests).toEqual(['requestPermissionsAsync']);
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(stopAllPlayback).not.toHaveBeenCalled();
    expect(latest.hook.busyId).toBe('a');
    expect(latest.hook.stateOf('a').status).toBe('running');
    await act(async () => {
      release();
      await flush();
    });
    expect(order).toEqual(['stopAllPlayback']);
    expect(fakeSpeech.starts).toHaveLength(1);
    await emit(() => fakeSpeech.end());
    await done;
  });

  it('the promise resolves when the run ends', async () => {
    await mount();
    let resolved = false;
    let done: Promise<void> = Promise.resolve();
    await act(async () => {
      done = latest.hook.start('a', NEW_URI).then(() => {
        resolved = true;
      });
      await flush();
    });
    expect(resolved).toBe(false);
    await emit(() => fakeSpeech.end());
    await done;
    expect(resolved).toBe(true);
  });

  it('ignores a second start while a run is active and touches nothing of the first', async () => {
    await mount();
    await begin('a');
    await begin('b', STORED_URI);
    expect(fakeSpeech.starts).toHaveLength(1);
    expect(fakeSpeech.aborts).toBe(0);
    expect(latest.hook.busyId).toBe('a');
    expect(latest.hook.stateOf('b')).toEqual({ status: 'none' });
    expect(latest.hook.stateOf('a').status).toBe('running');
  });

  it('refuses while a recording is open: failed busy, no module call', async () => {
    await mount();
    recording = true;
    await begin('a');
    expect(latest.hook.stateOf('a')).toEqual({
      status: 'failed',
      error: { code: 'busy', message: expect.any(String) },
    });
    expect(latest.hook.busyId).toBeNull();
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(fakeSpeech.permissionRequests).toEqual([]);
    expect(stopAllPlayback).not.toHaveBeenCalled();
  });

  it('refuses if a recording opens while the permission prompt is up', async () => {
    await mount();
    const release = fakeSpeech.holdPermissionRequest();
    await begin('a');
    recording = true;
    await act(async () => {
      release();
      await flush();
    });
    expect(latest.hook.stateOf('a').error?.code).toBe('busy');
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(latest.hook.busyId).toBeNull();
  });

  it('re-checks support at start: no start call when on-device support is gone', async () => {
    await mount();
    expect(latest.hook.supported).toBe(true);
    fakeSpeech.set({ onDevice: false });
    await begin('a');
    expect(latest.hook.stateOf('a').error?.code).toBe('unsupported');
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(fakeSpeech.permissionRequests).toEqual([]);
    expect(latest.hook.busyId).toBeNull();
  });

  it('a locale that vanished fails as unsupported', async () => {
    await mount();
    fakeSpeech.set({ installedLocales: [] });
    await begin('a');
    expect(latest.hook.stateOf('a').error?.code).toBe('unsupported');
    expect(fakeSpeech.starts).toHaveLength(0);
  });

  it('a denied permission fails as permission and starts nothing', async () => {
    await mount();
    fakeSpeech.set({ permission: { granted: false, canAskAgain: false } });
    await begin('a');
    expect(latest.hook.stateOf('a').error?.code).toBe('permission');
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(stopAllPlayback).not.toHaveBeenCalled();
    expect(latest.hook.busyId).toBeNull();
  });

  it('asks the iOS speech permission on iOS and the combined one on Android', async () => {
    setOs('ios');
    await mount();
    await begin('a');
    expect(fakeSpeech.permissionRequests).toEqual(['requestSpeechRecognizerPermissionsAsync']);
  });

  it('a start that throws is caught: failed, slot freed, promise resolves', async () => {
    await mount();
    fakeSpeech.set({ startThrows: true });
    const { done } = await begin('a');
    await done;
    expect(latest.hook.stateOf('a').error?.code).toBe('failed');
    expect(latest.hook.busyId).toBeNull();
  });

  it('a throwing permission request is caught', async () => {
    await mount();
    fakeSpeech.set({ permission: undefined as never });
    await begin('a');
    expect(latest.hook.stateOf('a').status).toBe('failed');
    expect(latest.hook.busyId).toBeNull();
  });

  it('can start again after a run ended', async () => {
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.end());
    await begin('b');
    expect(fakeSpeech.starts).toHaveLength(2);
    expect(latest.hook.busyId).toBe('b');
  });
});

describe('every start call', () => {
  it.each([
    ['android', 'new note cache file', NEW_URI],
    ['android', 'stored dreams/ file', STORED_URI],
    ['ios', 'new note cache file', NEW_URI],
    ['ios', 'stored dreams/ file', STORED_URI],
  ])('%s, %s: on-device true, continuous, locale, uri untouched', async (os, _label, uri) => {
    setOs(os as 'ios' | 'android');
    await mount();
    await begin('a', uri);
    expect(fakeSpeech.starts).toHaveLength(1);
    const call = fakeSpeech.starts[0] as {
      requiresOnDeviceRecognition: unknown;
      continuous: unknown;
      lang: unknown;
      audioSource: { uri: string };
    };
    expect(call.requiresOnDeviceRecognition).toBe(true);
    expect(call.continuous).toBe(true);
    expect(call.lang).toBe('en-US');
    expect(call.audioSource.uri).toBe(uri);
    expect(call.audioSource.uri.startsWith('file://')).toBe(true);
    if (os === 'ios') {
      expect(call.audioSource).toEqual({ uri });
    } else {
      expect(call.audioSource).toEqual({
        uri,
        audioChannels: 2,
        sampleRate: 44100,
        audioEncoding: 2,
      });
    }
  });

  it('keeps requiresOnDeviceRecognition true on every start across several runs, with no retry after an error', async () => {
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.error('network', 'x'));
    await emit(() => fakeSpeech.end());
    expect(fakeSpeech.starts).toHaveLength(1); // a network error is never retried
    await begin('a');
    await emit(() => fakeSpeech.end());
    await begin('b');
    expect(fakeSpeech.starts).toHaveLength(3);
    for (const call of fakeSpeech.starts) {
      expect(call.requiresOnDeviceRecognition).toBe(true);
    }
  });

  it('uses the device language when its model is installed', async () => {
    setLocale('de-DE');
    fakeSpeech.enable(['en-US', 'de-DE']);
    await mount();
    await begin('a');
    expect(fakeSpeech.starts[0].lang).toBe('de-DE');
  });
});

describe('results', () => {
  it('joins the finals with one space, ignores partials, and calls onResult once', async () => {
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.result('hel', false));
    await emit(() => fakeSpeech.result('  hello there ', true));
    await emit(() => fakeSpeech.result('and', false));
    await emit(() => fakeSpeech.result('good night', true));
    expect(results).toEqual([]);
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([['a', 'hello there good night']]);
    expect(latest.hook.stateOf('a').status).toBe('ready');
    expect(latest.hook.busyId).toBeNull();
    await emit(() => fakeSpeech.end());
    expect(results).toHaveLength(1);
  });

  it('uses the last partial when the run ends with no final', async () => {
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.result('one', false));
    await emit(() => fakeSpeech.result('one two', false));
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([['a', 'one two']]);
  });

  it('delivers an empty string when the run ends with nothing', async () => {
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([['a', '']]);
  });

  it.each(['no-speech', 'speech-timeout', 'nomatch'])(
    '%s delivers an empty string, not a failure, once',
    async (code) => {
      await mount();
      await begin('a');
      await emit(() => fakeSpeech.error(code));
      await emit(() => fakeSpeech.end());
      expect(results).toEqual([['a', '']]);
      expect(latest.hook.stateOf('a').status).toBe('ready');
      expect(latest.hook.busyId).toBeNull();
    },
  );

  it('delivers to the id that was started (a note removed meanwhile still lands)', async () => {
    await mount();
    await begin('gone');
    await emit(() => fakeSpeech.result('still arrives', true));
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([['gone', 'still arrives']]);
  });

  it('never logs the transcript text', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    );
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.result('secret dream words', true));
    await emit(() => fakeSpeech.end());
    for (const s of consoleSpies) {
      expect(JSON.stringify(s.mock.calls)).not.toContain('secret dream words');
      s.mockRestore();
    }
  });
});

describe('errors', () => {
  it.each([
    ['not-allowed', 'permission'],
    ['language-not-supported', 'no-model'],
    ['service-not-allowed', 'unsupported'],
    ['audio-capture', 'unsupported'],
    ['busy', 'busy'],
    ['network', 'failed'],
    ['client', 'failed'],
  ])('%s becomes failed %s, no result delivered', async (error, code) => {
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.error(error, 'msg'));
    expect(latest.hook.stateOf('a')).toEqual({
      status: 'failed',
      error: { code, message: expect.any(String) },
    });
    expect(latest.hook.busyId).toBeNull();
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([]);
  });

  it('an unrequested aborted error becomes cancelled', async () => {
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.error('aborted'));
    expect(latest.hook.stateOf('a').error?.code).toBe('cancelled');
    expect(results).toEqual([]);
  });

  it('a new run waits for the old native run to end; its end does not end the new run', async () => {
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.error('network'));
    jest.useFakeTimers();
    let done: Promise<void> = Promise.resolve();
    await act(async () => {
      done = latest.hook.start('b', NEW_URI);
      await flush();
    });
    expect(fakeSpeech.starts).toHaveLength(1); // waiting for the old run's end
    await emit(() => fakeSpeech.end()); // old run's end
    expect(fakeSpeech.starts).toHaveLength(2);
    expect(latest.hook.busyId).toBe('b');
    expect(results).toEqual([]);
    await emit(() => fakeSpeech.end()); // new run's end
    await done;
    expect(results).toEqual([['b', '']]);
  });

  it('if the old end never comes: start is refused as busy after 3 s and stays refused (wedged) until any end', async () => {
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.error('network'));
    jest.useFakeTimers();
    await act(async () => {
      void latest.hook.start('b', NEW_URI);
      await flush();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(END_WAIT_MS - 100);
    });
    expect(fakeSpeech.starts).toHaveLength(1);
    expect(latest.hook.stateOf('b').status).toBe('running');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    expect(fakeSpeech.starts).toHaveLength(1); // never starts alongside the old run
    expect(latest.hook.stateOf('b').error?.code).toBe('busy');
    expect(latest.hook.busyId).toBeNull();
    // Still wedged: a later start waits again and is refused again.
    await act(async () => {
      void latest.hook.start('c', NEW_URI);
      await flush();
      await jest.advanceTimersByTimeAsync(END_WAIT_MS + 100);
    });
    expect(fakeSpeech.starts).toHaveLength(1);
    expect(latest.hook.stateOf('c').error?.code).toBe('busy');
    // Any end clears it.
    await emit(() => fakeSpeech.end());
    await act(async () => {
      void latest.hook.start('d', NEW_URI);
      await flush();
    });
    expect(fakeSpeech.starts).toHaveLength(2);
  });

  it('the permission-denied message names the platform settings', async () => {
    fakeSpeech.set({ permission: { granted: false } });
    await mount();
    await begin('a');
    expect(latest.hook.stateOf('a').error?.message).toMatch(/Apps, Lucid, Permissions/);
    setOs('ios');
    await begin('b');
    expect(latest.hook.stateOf('b').error?.message).toMatch(/under Lucid/);
  });
});

describe('cancel', () => {
  it('aborts, shows cancelled, frees the slot and ignores later events', async () => {
    await mount();
    const { done } = await begin('a');
    await act(async () => latest.hook.cancel('a'));
    expect(fakeSpeech.aborts).toBe(1);
    expect(latest.hook.stateOf('a').status).toBe('failed');
    expect(latest.hook.stateOf('a').error?.code).toBe('cancelled');
    expect(latest.hook.busyId).toBeNull();
    await done;
    await emit(() => fakeSpeech.result('late', true));
    await emit(() => fakeSpeech.error('aborted'));
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([]);
    expect(latest.hook.stateOf('a').error?.code).toBe('cancelled');
  });

  it('is a no-op for another id or when nothing runs', async () => {
    await mount();
    await act(async () => latest.hook.cancel('a'));
    expect(fakeSpeech.aborts).toBe(0);
    await begin('a');
    await act(async () => latest.hook.cancel('b'));
    expect(fakeSpeech.aborts).toBe(0);
    expect(latest.hook.busyId).toBe('a');
  });

  it('late events of a cancelled run do not touch the next run', async () => {
    await mount();
    await begin('a');
    await act(async () => latest.hook.cancel('a'));
    jest.useFakeTimers();
    await act(async () => {
      void latest.hook.start('b', NEW_URI);
      await flush();
    });
    await emit(() => fakeSpeech.result('late from a', true)); // swallowed (no new run yet)
    await emit(() => fakeSpeech.end()); // a's end lets b start
    expect(fakeSpeech.starts).toHaveLength(2);
    expect(results).toEqual([]);
    await emit(() => fakeSpeech.result('b text', true));
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([['b', 'b text']]);
  });

  it('cancel while the permission prompt is up: no start, no abort', async () => {
    await mount();
    const release = fakeSpeech.holdPermissionRequest();
    await begin('a');
    await act(async () => latest.hook.cancel('a'));
    expect(latest.hook.stateOf('a').error?.code).toBe('cancelled');
    await act(async () => {
      release();
      await flush();
    });
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(fakeSpeech.aborts).toBe(0);
    expect(latest.hook.busyId).toBeNull();
  });

  it('cancelAll aborts the active run, and does nothing when idle', async () => {
    await mount();
    await act(async () => latest.hook.cancelAll());
    expect(fakeSpeech.aborts).toBe(0);
    await begin('a');
    await act(async () => latest.hook.cancelAll());
    expect(fakeSpeech.aborts).toBe(1);
    expect(latest.hook.stateOf('a').error?.code).toBe('cancelled');
    expect(latest.hook.busyId).toBeNull();
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([]);
  });
});

describe('watchdog, background and unmount', () => {
  it('aborts after 30 s without events and fails', async () => {
    jest.useFakeTimers();
    await mount();
    await begin('a');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(UNKNOWN_DURATION_WATCHDOG_MS - 1);
    });
    expect(fakeSpeech.aborts).toBe(0);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2);
    });
    expect(fakeSpeech.aborts).toBe(1);
    expect(latest.hook.stateOf('a').error?.code).toBe('failed');
    expect(latest.hook.busyId).toBeNull();
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([]);
  });

  it('every event resets the watchdog', async () => {
    jest.useFakeTimers();
    await mount();
    await begin('a');
    for (const fire of [
      () => fakeSpeech.emit('start'),
      () => fakeSpeech.emit('audiostart'),
      () => fakeSpeech.result('hi', false),
      () => fakeSpeech.result('hi there', true),
    ]) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(UNKNOWN_DURATION_WATCHDOG_MS - 1000);
      });
      await emit(fire);
    }
    expect(fakeSpeech.aborts).toBe(0);
    expect(latest.hook.busyId).toBe('a');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(UNKNOWN_DURATION_WATCHDOG_MS + 1);
    });
    expect(fakeSpeech.aborts).toBe(1);
  });

  it('is cleared when the run ends', async () => {
    jest.useFakeTimers();
    await mount();
    await begin('a');
    await emit(() => fakeSpeech.end());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(UNKNOWN_DURATION_WATCHDOG_MS * 2);
    });
    expect(fakeSpeech.aborts).toBe(0);
  });

  it('leaving the foreground aborts the run and fails it', async () => {
    await mount();
    await begin('a');
    await foreground('background');
    expect(fakeSpeech.aborts).toBe(1);
    expect(latest.hook.stateOf('a').error?.code).toBe('failed');
    expect(latest.hook.busyId).toBeNull();
    await emit(() => fakeSpeech.end());
    expect(results).toEqual([]);
  });

  it('inactive (iOS shade, call banner) does not abort a run', async () => {
    await mount();
    await begin('a');
    await foreground('inactive');
    expect(fakeSpeech.aborts).toBe(0);
    expect(latest.hook.busyId).toBe('a');
  });

  it('the watchdog limit scales with the clip: clamp(30 s + 1.5 x length, 30 s, 10 min), 60 s unknown', async () => {
    expect(watchdogMs(undefined)).toBe(60_000);
    expect(watchdogMs(NaN)).toBe(60_000);
    expect(watchdogMs(-5)).toBe(60_000);
    expect(watchdogMs(0)).toBe(60_000);
    expect(watchdogMs(1000)).toBe(31_500);
    expect(watchdogMs(60_000)).toBe(120_000);
    expect(watchdogMs(10_000_000)).toBe(600_000);
    jest.useFakeTimers();
    await mount();
    await begin('a', NEW_URI, 60_000);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(119_000);
    });
    expect(fakeSpeech.aborts).toBe(0);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_000);
    });
    expect(fakeSpeech.aborts).toBe(1);
  });

  it('backgrounding with no run does nothing', async () => {
    await mount();
    await foreground('background');
    expect(fakeSpeech.aborts).toBe(0);
  });

  it('unmount aborts and never calls onResult again', async () => {
    await mount();
    const { done } = await begin('a');
    await act(async () => mountedHook.unmount());
    expect(fakeSpeech.aborts).toBe(1);
    await done;
    fakeSpeech.result('late', true);
    fakeSpeech.end();
    expect(results).toEqual([]);
  });

  it('unmount with no run does not abort', async () => {
    await mount();
    await act(async () => mountedHook.unmount());
    expect(fakeSpeech.aborts).toBe(0);
  });
});

describe('iOS locale policy: only the checked system locale can reach the recognizer', () => {
  const ALL = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'zh-Hans-CN', 'ko-KR'];
  type Scenario = {
    name: string;
    system: string | null;
    intl?: string;
    locales?: string[];
    onDevice?: boolean;
    available?: boolean;
    expectLang: string | null;
  };
  const scenarios: Scenario[] = [
    { name: 'en_US', system: 'en_US', expectLang: 'en-US' },
    { name: 'en_GB', system: 'en_GB', expectLang: 'en-GB' },
    { name: 'de_DE', system: 'de_DE', expectLang: 'de-DE' },
    { name: 'fr_FR@rg=dezzzz (region override)', system: 'fr_FR@rg=dezzzz', expectLang: null },
    { name: 'a -u- extension', system: 'en-US-u-hc-h23', expectLang: null },
    { name: 'zh_Hans_CN (in the list)', system: 'zh_Hans_CN', expectLang: 'zh-Hans-CN' },
    {
      name: 'zh_Hans_CN not in the list',
      system: 'zh_Hans_CN',
      locales: ['zh-CN', 'en-US'],
      expectLang: null,
    },
    {
      name: 'system locale absent from the list (de_DE, en-US listed)',
      system: 'de_DE',
      locales: ['en-US', 'fr-FR'],
      expectLang: null,
    },
    { name: 'no on-device support', system: 'en_US', onDevice: false, expectLang: null },
    { name: 'recognition unavailable', system: 'en_US', available: false, expectLang: null },
    { name: 'system locale missing', system: null, expectLang: null },
    { name: 'Intl says en-GB, system en_US', system: 'en_US', intl: 'en-GB', expectLang: 'en-US' },
    { name: 'Intl says en-US, system de_DE', system: 'de_DE', intl: 'en-US', expectLang: 'de-DE' },
    {
      name: 'Intl says de-DE, system ko_KR not listed',
      system: 'ko_KR',
      intl: 'de-DE',
      locales: ['de-DE', 'en-US'],
      expectLang: null,
    },
  ];

  it.each(scenarios)('$name', async (s) => {
    setOs('ios');
    systemLocale = s.system;
    if (s.intl) setLocale(s.intl);
    fakeSpeech.enable(s.locales ?? ALL);
    fakeSpeech.set({
      ...(s.onDevice === false ? { onDevice: false } : {}),
      ...(s.available === false ? { available: false } : {}),
    });
    await mount();
    expect(latest.hook.supported).toBe(s.expectLang !== null);
    await begin('a');
    if (s.expectLang === null) {
      expect(fakeSpeech.starts).toHaveLength(0);
      expect(latest.hook.stateOf('a').error?.code).toBe('unsupported');
      return;
    }
    expect(fakeSpeech.starts).toHaveLength(1);
    for (const [i, call] of fakeSpeech.starts.entries()) {
      expect(call.requiresOnDeviceRecognition).toBe(true);
      expect(call.lang).toBe(s.expectLang);
      expect(s.locales ?? ALL).toContain(call.lang);
      expect(fakeSpeech.onDeviceAtStart[i]).toBe(true);
    }
  });

  it('a system locale that changes between the check and start uses the fresh value', async () => {
    setOs('ios');
    fakeSpeech.enable(ALL);
    await mount();
    expect(latest.hook.supported).toBe(true);
    systemLocale = 'de_DE';
    await begin('a');
    expect(fakeSpeech.starts[0].lang).toBe('de-DE');
  });

  it('a system locale that changes to an unsupported one while the permission prompt is up never starts', async () => {
    setOs('ios');
    fakeSpeech.enable(['en-US']);
    await mount();
    const release = fakeSpeech.holdPermissionRequest();
    await begin('a');
    systemLocale = 'de_DE';
    await act(async () => {
      release();
      await flush();
    });
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(latest.hook.stateOf('a').error?.code).toBe('unsupported');
  });

  it('on-device support lost while the permission prompt is up never starts', async () => {
    setOs('ios');
    await mount();
    const release = fakeSpeech.holdPermissionRequest();
    await begin('a');
    fakeSpeech.set({ onDevice: false });
    await act(async () => {
      release();
      await flush();
    });
    expect(fakeSpeech.starts).toHaveLength(0);
  });

  // Revision 7: on a real iPhone I18nManager has no localeIdentifier; AppleLocale is the one source.
  it('I18nManager has no localeIdentifier (the real iPhone): AppleLocale en_US is supported', async () => {
    setOs('ios');
    i18nLocale = undefined;
    fakeSpeech.enable(ALL);
    await mount();
    expect(latest.hook.supported).toBe(true);
    await begin('a');
    expect(fakeSpeech.starts[0].lang).toBe('en-US');
    expect(fakeSpeech.starts[0].requiresOnDeviceRecognition).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['a number', 42],
    ['an array', ['en_US']],
  ])('AppleLocale %s: hidden, nothing starts', async (_n, value) => {
    setOs('ios');
    systemLocale = value;
    fakeSpeech.enable(ALL);
    await mount();
    expect(latest.hook.supported).toBe(false);
    await begin('a');
    expect(fakeSpeech.starts).toHaveLength(0);
  });

  it('AppleLanguages present but AppleLocale missing: hidden (AppleLanguages is never used)', async () => {
    setOs('ios');
    systemLocale = undefined;
    appleLanguages = ['en-US'];
    fakeSpeech.enable(ALL);
    await mount();
    expect(latest.hook.supported).toBe(false);
    await begin('a');
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(settingsGets).not.toContain('AppleLanguages');
    expect(new Set(settingsGets)).toEqual(new Set(['AppleLocale']));
  });

  it.each(['en_US@rg=gbzzzz', 'en_US@calendar=gregorian', 'en-US-u-rg-gbzzzz'])(
    'AppleLocale %s (override or -u- extension): hidden',
    async (value) => {
      setOs('ios');
      systemLocale = value;
      fakeSpeech.enable(ALL);
      await mount();
      expect(latest.hook.supported).toBe(false);
      await begin('a');
      expect(fakeSpeech.starts).toHaveLength(0);
    },
  );

  it('AppleLocale not in the supported list: hidden, no en-US fallback', async () => {
    setOs('ios');
    systemLocale = 'sv_SE';
    fakeSpeech.enable(ALL);
    await mount();
    expect(latest.hook.supported).toBe(false);
    await begin('a');
    expect(fakeSpeech.starts).toHaveLength(0);
  });

  it('Intl disagreeing with AppleLocale still uses AppleLocale', async () => {
    setOs('ios');
    setLocale('en-GB');
    systemLocale = 'de_DE';
    fakeSpeech.enable(ALL);
    await mount();
    await begin('a');
    expect(fakeSpeech.starts[0].lang).toBe('de-DE');
  });

  it('Android never calls Settings.get and still reads I18nManager (language pick stays Intl)', async () => {
    setOs('android');
    systemLocale = 'zz_ZZ';
    i18nLocale = 'de_DE';
    setLocale('de-DE');
    fakeSpeech.enable(['en-US', 'de-DE']);
    onlineSetting = true;
    await mount();
    await begin('a');
    expect(fakeSpeech.starts[0].lang).toBe('de-DE');
    expect(jest.mocked(I18nManager.getConstants)).toHaveBeenCalled();
    expect(settingsGets).toEqual([]);
  });
});

describe('opt-in online transcription (Revision 6)', () => {
  const ALL = ['en-US', 'en-GB', 'de-DE', 'fr-FR'];
  // iOS phone whose system locale has no on-device support: only the online route can work.
  const noOnDevice = () => {
    setOs('ios');
    fakeSpeech.enable(ALL);
    fakeSpeech.set({ onDevice: false });
  };
  const setSetting = async (value: boolean) => {
    onlineSetting = value;
    await act(async () => {
      await mountedHook.rerender(<Probe />);
      await flush();
    });
  };

  it('OFF: a phone without on-device support offers nothing and starts nothing', async () => {
    noOnDevice();
    await mount();
    expect(latest.hook.supported).toBe(false);
    expect(latest.hook.route).toBeNull();
    await begin('a');
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(latest.hook.stateOf('a').error?.code).toBe('unsupported');
  });

  it('OFF: an on-device capable phone runs on-device with the flag true', async () => {
    setOs('ios');
    fakeSpeech.enable(ALL);
    await mount();
    expect(latest.hook.route).toBe('on-device');
    await begin('a');
    expect(fakeSpeech.starts[0].requiresOnDeviceRecognition).toBe(true);
  });

  it('ON and on-device capable: prefers on-device (flag true, route on-device)', async () => {
    onlineSetting = true;
    setOs('ios');
    fakeSpeech.enable(ALL);
    await mount();
    expect(latest.hook.route).toBe('on-device');
    await begin('a');
    expect(fakeSpeech.starts).toHaveLength(1);
    expect(fakeSpeech.starts[0].requiresOnDeviceRecognition).toBe(true);
    expect(fakeSpeech.onDeviceAtStart[0]).toBe(true);
  });

  it('ON and on-device incapable: online route, flag false, lang = system language', async () => {
    onlineSetting = true;
    noOnDevice();
    systemLocale = 'de_DE';
    await mount();
    expect(latest.hook.supported).toBe(true);
    expect(latest.hook.route).toBe('online');
    await begin('a');
    expect(fakeSpeech.starts).toHaveLength(1);
    expect(fakeSpeech.starts[0].requiresOnDeviceRecognition).toBe(false);
    expect(fakeSpeech.starts[0].lang).toBe('de-DE');
    expect(fakeSpeech.starts[0].continuous).toBe(true);
    // The audio source is passed through as on-device (the uri exactly).
    expect(fakeSpeech.starts[0].audioSource).toEqual({ uri: NEW_URI });
    expect(fakeSpeech.permissionRequests).toEqual(['requestSpeechRecognizerPermissionsAsync']);
  });

  it('online route reads AppleLocale even when I18nManager has no localeIdentifier', async () => {
    onlineSetting = true;
    noOnDevice();
    i18nLocale = undefined;
    systemLocale = 'fr_FR';
    await mount();
    expect(latest.hook.route).toBe('online');
    await begin('a');
    expect(fakeSpeech.starts[0].lang).toBe('fr-FR');
    expect(fakeSpeech.starts[0].requiresOnDeviceRecognition).toBe(false);
  });

  it('online locale: system language only, no en-US or other-region fallback', async () => {
    onlineSetting = true;
    setOs('ios');
    fakeSpeech.enable(['en-US', 'en-GB']);
    fakeSpeech.set({ onDevice: false });
    systemLocale = 'de_DE';
    await mount();
    expect(latest.hook.supported).toBe(false);
    await begin('a');
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(latest.hook.stateOf('a').error?.code).toBe('unsupported');
  });

  it('ON but the online route is not available: nothing starts', async () => {
    onlineSetting = true;
    noOnDevice();
    fakeSpeech.set({ available: false });
    await mount();
    expect(latest.hook.supported).toBe(false);
    await begin('a');
    expect(fakeSpeech.starts).toHaveLength(0);
  });

  it('the setting turned OFF between the check and start: a fresh read refuses online', async () => {
    onlineSetting = true;
    noOnDevice();
    await mount();
    expect(latest.hook.route).toBe('online');
    // Turned off, and start called in the same tick before any re-check could land.
    onlineSetting = false;
    await act(async () => {
      await mountedHook.rerender(<Probe />);
    });
    await begin('a');
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(latest.hook.stateOf('a').error?.code).toBe('unsupported');
  });

  it('the setting turned OFF while the permission prompt is up: nothing starts', async () => {
    onlineSetting = true;
    noOnDevice();
    await mount();
    const release = fakeSpeech.holdPermissionRequest();
    await begin('a');
    await setSetting(false);
    await act(async () => {
      release();
      await flush();
    });
    expect(fakeSpeech.starts).toHaveLength(0);
    expect(latest.hook.stateOf('a').error?.code).toBe('unsupported');
  });

  it('the setting turned OFF mid-run: the run continues; the next start refuses', async () => {
    onlineSetting = true;
    noOnDevice();
    await mount();
    const { done } = await begin('a');
    expect(fakeSpeech.starts).toHaveLength(1);
    await setSetting(false);
    expect(fakeSpeech.aborts).toBe(0);
    await emit(() => fakeSpeech.result('hello', true));
    await emit(() => fakeSpeech.end());
    await done;
    expect(results).toEqual([['a', 'hello']]);
    await begin('b');
    expect(fakeSpeech.starts).toHaveLength(1);
    expect(latest.hook.stateOf('b').error?.code).toBe('unsupported');
  });

  it('route and supported recompute when the setting flips, off removing the online route at once', async () => {
    noOnDevice();
    await mount();
    expect([latest.hook.supported, latest.hook.route]).toEqual([false, null]);
    await setSetting(true);
    expect([latest.hook.supported, latest.hook.route]).toEqual([true, 'online']);
    await setSetting(false);
    expect([latest.hook.supported, latest.hook.route]).toEqual([false, null]);
  });

  it('a flip does not recheck when nothing changed (no extra capability calls on a re-render)', async () => {
    setOs('ios');
    fakeSpeech.enable(ALL);
    await mount();
    const calls = fakeSpeech.getSupportedLocalesCalls;
    await act(async () => {
      await mountedHook.rerender(<Probe />);
      await flush();
    });
    expect(fakeSpeech.getSupportedLocalesCalls).toBe(calls);
  });

  describe('failures', () => {
    it('network in online mode becomes offline ("needs internet") and is not retried', async () => {
      onlineSetting = true;
      noOnDevice();
      await mount();
      const { done } = await begin('a');
      await emit(() => fakeSpeech.error('network'));
      await emit(() => fakeSpeech.end());
      await done;
      expect(latest.hook.stateOf('a').error?.code).toBe('offline');
      expect(latest.hook.stateOf('a').error?.message).toMatch(/needs an internet connection/);
      expect(fakeSpeech.starts).toHaveLength(1);
    });

    it('network in on-device mode stays failed, and nothing escalates to online (setting ON)', async () => {
      onlineSetting = true;
      setOs('ios');
      fakeSpeech.enable(ALL);
      await mount();
      const { done } = await begin('a');
      await emit(() => fakeSpeech.error('network'));
      await emit(() => fakeSpeech.end());
      await done;
      expect(latest.hook.stateOf('a').error?.code).toBe('failed');
      expect(fakeSpeech.starts).toHaveLength(1);
      expect(fakeSpeech.starts[0].requiresOnDeviceRecognition).toBe(true);
      expect(latest.hook.route).toBe('on-device');
    });

    it.each(['service-not-allowed', 'busy', 'language-not-supported', 'x'])(
      'an online %s error keeps its mapping and starts nothing more',
      async (code) => {
        onlineSetting = true;
        noOnDevice();
        await mount();
        const { done } = await begin('a');
        await emit(() => fakeSpeech.error(code));
        await emit(() => fakeSpeech.end());
        await done;
        const expected: Record<string, string> = {
          'service-not-allowed': 'unsupported',
          busy: 'busy',
          'language-not-supported': 'no-model',
          x: 'failed',
        };
        expect(latest.hook.stateOf('a').error?.code).toBe(expected[code]);
        expect(fakeSpeech.starts).toHaveLength(1);
      },
    );

    it('the watchdog applies to an online run too', async () => {
      onlineSetting = true;
      noOnDevice();
      await mount();
      jest.useFakeTimers();
      await begin('a');
      await act(async () => {
        jest.advanceTimersByTime(60_001);
        await flush();
      });
      expect(fakeSpeech.aborts).toBe(1);
      expect(latest.hook.stateOf('a').error?.code).toBe('failed');
    });
  });

  describe('platform gate (ONLINE_ROUTE_PLATFORMS)', () => {
    it('Android is never online: no route, nothing starts, even with the setting ON', async () => {
      onlineSetting = true;
      setOs('android');
      setVersion(34);
      fakeSpeech.enable(['en-US']);
      fakeSpeech.set({ onDevice: false });
      await mount();
      expect(latest.hook.supported).toBe(false);
      expect(latest.hook.route).toBeNull();
      await begin('a');
      expect(fakeSpeech.starts).toHaveLength(0);
    });

    it('Android with the setting ON and on-device capable still runs on-device (flag true)', async () => {
      onlineSetting = true;
      setOs('android');
      setVersion(34);
      await mount();
      expect(latest.hook.route).toBe('on-device');
      await begin('a');
      expect(fakeSpeech.starts[0].requiresOnDeviceRecognition).toBe(true);
    });

    it('Android API 32 with the setting ON: still nothing', async () => {
      onlineSetting = true;
      setOs('android');
      setVersion(32);
      await mount();
      expect(latest.hook.supported).toBe(false);
    });
  });

  it('property over the hook: a flag-false start happens only with the setting ON, on iOS, and on-device not capable', async () => {
    let flagFalseStarts = 0;
    for (const os of ['ios', 'android'] as const) {
      for (const setting of [false, true]) {
        for (const onDevice of [false, true]) {
          for (const available of [false, true]) {
            for (const system of ['en_US', 'de_DE', 'fr_FR@rg=x', null]) {
              for (const intl of ['en-US', 'de-DE']) {
                fakeSpeech.reset();
                fakeSpeech.enable(['en-US', 'de-DE']);
                fakeSpeech.set({ onDevice, available });
                setOs(os);
                setVersion(34);
                setLocale(intl);
                systemLocale = system;
                onlineSetting = setting;
                await mount();
                await begin('a');
                for (const [i, call] of fakeSpeech.starts.entries()) {
                  if (call.requiresOnDeviceRecognition === false) {
                    flagFalseStarts += 1;
                    expect(setting).toBe(true);
                    expect(os).toBe('ios');
                    expect(fakeSpeech.onDeviceAtStart[i]).toBe(false);
                    expect(call.lang).toBe(normalizeLang(system));
                  } else {
                    expect(call.requiresOnDeviceRecognition).toBe(true);
                    expect(fakeSpeech.onDeviceAtStart[i]).toBe(true);
                  }
                }
                await mountedHook.unmount();
                while (restorers.length) restorers.pop()?.();
                fakeLocaleSources();
                spy(jest.spyOn(AppState, 'addEventListener')).mockImplementation((_e, h) => {
                  appStateHandlers.push(h as (s: string) => void);
                  return { remove: () => {} };
                });
              }
            }
          }
        }
      }
    }
    // The sweep did exercise the online route.
    expect(flagFalseStarts).toBeGreaterThan(0);
  });
});

const normalizeLang = (system: string | null) => system?.replace(/_/g, '-');
