import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

const LANG = 'en-US';
const RESTART_DELAY_MS = 300;
/** A session shorter than this that produced no result counts as a failed restart. */
const MIN_HEALTHY_SESSION_MS = 2000;
/**
 * Give up after this many restarts in a row failed. Only restart sessions count: the first
 * session's failure just triggers restart number 1. Any result (or a healthy session) resets it.
 */
const MAX_FAILED_RESTARTS = 5;
/** A late `end` from an aborted session is only swallowed this soon after the new session began. */
const STALE_END_WINDOW_MS = 2000;
/** How long start() waits for the previous session's `end` before aborting it. */
const START_WAIT_FOR_END_MS = 1000;
/** How long stop() waits for the final result and `end` before resolving anyway. */
const STOP_WAIT_FOR_END_MS = 1500;
/** Errors where retrying cannot help. */
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
/** Errors that just mean nothing was heard; recognition is restarted quietly. */
const QUIET_ERRORS = new Set(['no-speech', 'speech-timeout', 'aborted']);

const MIN_ANDROID_API = 33;
const MIN_IOS_MAJOR = 17;

/**
 * iOS audio session experiment, flippable with a JS reload (no native rebuild).
 * 'default': let the speech library set its own session (`playAndRecord` + `measurement`).
 * 'matchExpoAudio': ask for the session expo-audio uses (`playAndRecord`, speaker, Bluetooth).
 */
export const IOS_SESSION_MODE: 'default' | 'matchExpoAudio' = 'default';

const MODEL_MISSING =
  'On-device speech model is not installed. Live text is off (audio is still recording).';
// Placeholder wording: this is user-owned copy and needs the owner's approval before release.
const UNSUPPORTED_OS = "Live text isn't available on this phone.";

const log = (...args: unknown[]) => console.log('[transcription]', ...args);

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

type Phase = 'idle' | 'starting' | 'running' | 'stopping' | 'paused';

function osTooOld(): boolean {
  if (Platform.OS === 'android') return Number(Platform.Version) < MIN_ANDROID_API;
  if (Platform.OS === 'ios') return Number.parseInt(String(Platform.Version), 10) < MIN_IOS_MAJOR;
  return false;
}

function logIosSession(label: string) {
  if (Platform.OS !== 'ios') return;
  try {
    log(
      `iOS audio session ${label}:`,
      ExpoSpeechRecognitionModule.getAudioSessionCategoryAndOptionsIOS(),
    );
  } catch (e) {
    log('could not read iOS audio session', e);
  }
}

/**
 * Live, on-device speech-to-text for the capture screen. Spike: runs alongside the expo-audio
 * recorder and never throws; failures end up in `error` and the recording is unaffected.
 */
export function useLiveTranscription() {
  const [committed, setCommitted] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [paused, setPausedState] = useState(false);

  /** Bumped by every start/stop/unmount so async work from an older session can bail out. */
  const token = useRef(0);
  const phase = useRef<Phase>('idle');
  const wanted = useRef(false);
  const committedRef = useRef('');
  const interimRef = useRef('');
  const failedRestarts = useRef(0);
  const sessionStartedAt = useRef(0);
  const sessionHadResult = useRef(false);
  /** True while the current session is a restart (not the one start() began). */
  const sessionIsRestart = useRef(false);
  /** True from native start until its `end`; false in the gap before a scheduled restart. */
  const nativeActive = useRef(false);
  /** start() aborted a stuck old session, so one stale `end` may still arrive. */
  const staleEndPending = useRef(false);
  /** pause() was called and no resume()/stop()/start() has followed; recognition must not run. */
  const pausedRef = useRef(false);
  /** Permission and the Android locale check passed once; resume() relies on it. */
  const ready = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endWaiters = useRef<(() => void)[]>([]);

  const clearRestartTimer = () => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  };

  const setCommittedText = (text: string) => {
    committedRef.current = text;
    setCommitted(text);
  };

  const setInterimText = (text: string) => {
    interimRef.current = text;
    setInterim(text);
  };

  const setPausedFlag = (value: boolean) => {
    pausedRef.current = value;
    setPausedState(value);
  };

  const currentText = () => join(committedRef.current, interimRef.current);

  const commitInterim = () => {
    const pending = interimRef.current;
    setInterimText('');
    if (pending) setCommittedText(join(committedRef.current, pending));
  };

  const notifyEnd = () => {
    const waiters = endWaiters.current;
    endWaiters.current = [];
    waiters.forEach((resolve) => resolve());
  };

  /** Resolves true when `end` arrives, false on timeout. */
  const waitForEnd = (ms: number) =>
    new Promise<boolean>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        endWaiters.current = endWaiters.current.filter((w) => w !== done);
        resolve(false);
      }, ms);
      endWaiters.current.push(done);
    });

  const beginRecognition = (isRestart: boolean) => {
    logIosSession('before start');
    ExpoSpeechRecognitionModule.start({
      lang: LANG,
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
      ...(Platform.OS === 'ios' && IOS_SESSION_MODE === 'matchExpoAudio'
        ? {
            iosCategory: {
              category: 'playAndRecord' as const,
              categoryOptions: ['defaultToSpeaker' as const, 'allowBluetooth' as const],
              mode: 'default' as const,
            },
          }
        : {}),
    });
    logIosSession('after start');
    nativeActive.current = true;
    sessionStartedAt.current = Date.now();
    sessionHadResult.current = false;
    sessionIsRestart.current = isRestart;
  };

  useSpeechRecognitionEvent('start', () => {
    log('start');
    logIosSession('on start event');
    if (phase.current === 'running') setListening(true);
  });

  useSpeechRecognitionEvent('audiostart', (event) =>
    log('audiostart', event?.timestamp, event?.uri ?? ''),
  );
  useSpeechRecognitionEvent('audioend', (event) =>
    log('audioend', event?.timestamp, event?.uri ?? ''),
  );

  useSpeechRecognitionEvent('result', (event) => {
    if (phase.current !== 'running' && phase.current !== 'stopping') return;
    const text = event.results?.[0]?.transcript?.trim() ?? '';
    sessionHadResult.current = true;
    staleEndPending.current = false;
    failedRestarts.current = 0;
    setError(null);
    if (event.isFinal) {
      setInterimText('');
      if (text) setCommittedText(join(committedRef.current, text));
    } else {
      setInterimText(text);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (phase.current !== 'running') return;
    log('error', event.error, event.message, event.code);
    staleEndPending.current = false;
    if (event.error === 'audio-capture' || event.error === 'interrupted') {
      log('audio session/mic problem:', event.error, event.message);
    }
    if (QUIET_ERRORS.has(event.error)) return;
    if (FATAL_ERRORS.has(event.error)) {
      wanted.current = false;
      setError(
        event.error === 'language-not-supported' && Platform.OS === 'android'
          ? MODEL_MISSING
          : `${event.error}: ${event.message}`,
      );
      return;
    }
    setError(`${event.error}: ${event.message}`);
  });

  useSpeechRecognitionEvent('end', () => {
    if (phase.current !== 'running' && phase.current !== 'stopping') {
      log('ignoring end from an old session');
      return;
    }
    if (
      phase.current === 'running' &&
      staleEndPending.current &&
      !sessionHadResult.current &&
      Date.now() - sessionStartedAt.current < STALE_END_WINDOW_MS
    ) {
      log('swallowing the late end of an aborted session');
      staleEndPending.current = false;
      return;
    }
    staleEndPending.current = false;
    nativeActive.current = false;
    log('end', phase.current === 'running' && wanted.current ? '(will restart)' : '');
    setListening(false);
    // Whatever was still interim belongs to the text; keep it before a new session starts.
    commitInterim();

    if (phase.current === 'stopping') {
      phase.current = pausedRef.current ? 'paused' : 'idle';
      notifyEnd();
      return;
    }
    if (!wanted.current) {
      phase.current = 'idle';
      return;
    }

    const lasted = Date.now() - sessionStartedAt.current;
    if (lasted < MIN_HEALTHY_SESSION_MS && !sessionHadResult.current) {
      // The first session's failure is not a failed restart; it only triggers restart 1.
      if (sessionIsRestart.current) failedRestarts.current += 1;
      log('session failed: no result in', lasted, 'ms; failures in a row:', failedRestarts.current);
    } else {
      failedRestarts.current = 0;
    }
    if (failedRestarts.current >= MAX_FAILED_RESTARTS) {
      log('giving up after repeated failed restarts');
      wanted.current = false;
      phase.current = 'idle';
      setError((prev) => prev ?? 'Live text stopped (nothing was recognized).');
      return;
    }

    const mine = token.current;
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null;
      if (mine !== token.current || !wanted.current || phase.current !== 'running') return;
      log('restarting');
      try {
        beginRecognition(true);
      } catch (e) {
        log('restart failed', e);
        wanted.current = false;
        phase.current = 'idle';
        setError('Live text stopped.');
      }
    }, RESTART_DELAY_MS);
  });

  /**
   * A previous session is still winding down: let it finish (or abort it) first. Callers compare
   * the token afterwards to see whether stop() or unmount ran while this waited.
   */
  const windDownPrevious = async () => {
    staleEndPending.current = false;
    if (phase.current !== 'stopping') return;
    const ended = await waitForEnd(START_WAIT_FOR_END_MS);
    if (!ended && phase.current === 'stopping') {
      log('previous session did not end in time; aborting it');
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch (e) {
        log('abort failed', e);
      }
      await waitForEnd(500);
      phase.current = 'idle';
      nativeActive.current = false;
      // The aborted session may still deliver its `end` after the new one has begun.
      staleEndPending.current = true;
    }
  };

  /** Starts live text. Resolves false (and sets `error`) if it cannot run; never throws. */
  const start = useCallback(async (): Promise<boolean> => {
    // The API gate runs before anything native is touched.
    if (osTooOld()) {
      log('OS too old for live text', Platform.OS, Platform.Version);
      setIsSupported(false);
      setError(UNSUPPORTED_OS);
      return false;
    }

    try {
      const tokenBeforeWait = token.current;
      await windDownPrevious();
      // stop() or unmount ran while we waited: this start is no longer wanted.
      if (token.current !== tokenBeforeWait) return false;

      clearRestartTimer();
      const mine = ++token.current;
      phase.current = 'starting';
      wanted.current = false;
      ready.current = false;
      setPausedFlag(false);
      const stale = () => mine !== token.current;
      const fail = () => {
        if (!stale()) {
          phase.current = 'idle';
          wanted.current = false;
          setPausedFlag(false);
        }
        return false;
      };

      setCommittedText('');
      setInterimText('');
      setError(null);
      failedRestarts.current = 0;

      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        log('recognition not available on this device');
        setIsSupported(false);
        return fail();
      }
      if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
        log('on-device recognition not supported');
        setIsSupported(false);
        setError(
          Platform.OS === 'android'
            ? MODEL_MISSING
            : 'On-device speech recognition is not available on this device.',
        );
        return fail();
      }
      setIsSupported(true);

      try {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (stale()) return false;
        if (!permission.granted) {
          log('permission not granted');
          setError('Speech recognition permission was not granted.');
          return fail();
        }

        if (Platform.OS === 'android') {
          const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
          if (stale()) return false;
          log('installed on-device locales:', installedLocales);
          if (installedLocales.length > 0 && !installedLocales.includes(LANG)) {
            setError(MODEL_MISSING);
            return fail();
          }
          // An empty list means we could not verify the model, so we try anyway.
        }

        ready.current = true;
        if (pausedRef.current) {
          // pause() came in while the permission dialog or locale check was pending.
          phase.current = 'paused';
          return true;
        }
        wanted.current = true;
        phase.current = 'running';
        beginRecognition(false);
        return true;
      } catch (e) {
        log('start failed', e);
        if (!stale()) setError('Live text could not start.');
        return fail();
      }
    } catch (e) {
      log('start failed', e);
      setError('Live text could not start.');
      return false;
    }
    // The helpers only touch refs and state setters, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Pauses recognition: the native stop flushes the final text, which is kept. Recognition never
   * runs while paused. A no-op unless live text is running or starting.
   */
  const pause = useCallback(() => {
    const current = phase.current;
    if (current === 'starting') {
      setPausedFlag(true);
      return;
    }
    if (current !== 'running') return;
    log('pause requested');
    setPausedFlag(true);
    wanted.current = false;
    clearRestartTimer();
    staleEndPending.current = false;
    if (!nativeActive.current) {
      // Restart gap: nothing native is running, so no `end` will come.
      phase.current = 'paused';
      setListening(false);
      commitInterim();
      return;
    }
    phase.current = 'stopping';
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      log('pause stop failed', e);
      nativeActive.current = false;
      phase.current = 'paused';
      setListening(false);
      commitInterim();
    }
    // The end handler's `stopping` branch commits the text and moves on to 'paused'.
    // The helpers only touch refs and state setters, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Starts a new recognition session after pause(); its text appends to the transcript.
   * Resolves false if there was nothing to resume or it could not start; never throws.
   */
  const resume = useCallback(async (): Promise<boolean> => {
    const draining = phase.current === 'stopping' && pausedRef.current;
    if ((phase.current !== 'paused' && !draining) || !ready.current) return false;
    try {
      const mine = token.current;
      await windDownPrevious();
      // stop(), start() or unmount ran while we waited, or another resume() got there first.
      if (token.current !== mine || !pausedRef.current) return false;

      setPausedFlag(false);
      wanted.current = true;
      failedRestarts.current = 0;
      phase.current = 'running';
      beginRecognition(false);
      return true;
    } catch (e) {
      log('resume failed', e);
      wanted.current = false;
      phase.current = 'idle';
      setError('Live text stopped.');
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Stops live text. Resolves with the final transcript once the recognizer reports `end`
   * (or after a short timeout), so the last words are not lost.
   */
  const stop = useCallback(async (): Promise<string> => {
    log('stop requested');
    token.current += 1;
    wanted.current = false;
    clearRestartTimer();
    staleEndPending.current = false;
    const wasPaused = phase.current === 'paused';
    setPausedFlag(false);
    if (wasPaused) {
      // Nothing native is running (and Android would stop a dead recognizer): finish right away.
      phase.current = 'idle';
      commitInterim();
      return currentText();
    }
    if (phase.current === 'running' && !nativeActive.current) {
      // Restart gap: nothing native is running, so no `end` will come. Finish right away.
      phase.current = 'idle';
      setListening(false);
      commitInterim();
      return currentText();
    }
    if (phase.current === 'starting') phase.current = 'idle';
    if (phase.current === 'running') phase.current = 'stopping';
    const waiting = phase.current === 'stopping';
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      log('stop failed', e);
    }
    if (waiting) await waitForEnd(STOP_WAIT_FOR_END_MS);
    commitInterim();
    return currentText();
    // The helpers only touch refs and state setters, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      token.current += 1;
      wanted.current = false;
      phase.current = 'idle';
      pausedRef.current = false;
      clearRestartTimer();
      notifyEnd();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Nothing to do on unmount.
      }
    },
    [],
  );

  return {
    start,
    stop,
    pause,
    resume,
    paused,
    transcript: join(committed, interim),
    error,
    isSupported,
    listening,
  };
}
