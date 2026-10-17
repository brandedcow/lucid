import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import type {
  RecordingTranscription,
  RecordingTranscriptionState,
  TranscriptionErrorCode,
} from '../services/transcription';
import {
  buildStartOptions,
  decideRecognitionMode,
  deviceLocaleTag,
  evaluateOnlineSupport,
  evaluateSupport,
  mapSpeechError,
  permissionDeniedMessage,
  type RecognitionMode,
  systemLocaleIdentifier,
  watchdogMs,
} from '../utils/transcribeSupport';
import { stopAllPlayback } from './useRecordingPlayback';

/** After an abort, how long a new run waits for the old native run's `end` before refusing. */
export const END_WAIT_MS = 3_000;

export type RecordingTranscriptionHook = RecordingTranscription & {
  /** Aborts the active run, if any (the entry page was left). */
  cancelAll(): void;
};

type Run = {
  id: string;
  token: number;
  /** True once the module's start was called (an abort is only meaningful then). */
  started: boolean;
  /** False while an automatic start is still checking its consent: busyId and the state stay untouched, and ending the run sets nothing. */
  visible: boolean;
  /** The route this run was started on (decides how a `network` error is mapped). */
  online: boolean;
  finals: string[];
  lastPartial: string;
  timer: ReturnType<typeof setTimeout> | null;
  /** No module event for this long: the run is aborted and fails. Every event resets it. */
  limitMs: number;
  /** Resolves the promise `start` returns (the run ended, however it ended). */
  settle: () => void;
};

function abortModule() {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {
    // Nothing running, or the module is gone.
  }
}

const NONE: RecordingTranscriptionState = { status: 'none' };

/**
 * Transcription of recorded voice notes, one at a time. The text goes to `onResult` (`''` = nothing
 * heard); this hook never keeps it and never logs it. The route is decided only by
 * `decideRecognitionMode`: on-device whenever that is proven, online only as a fallback and only
 * when `onlineAllowed` (the saved setting) is true at the moment of the run. A failed run is never
 * retried or moved to another route automatically.
 * Lives above the page (in App), so closing the sheet does not cancel a run.
 */
export function useRecordingTranscription({
  onResult,
  isRecording,
  onlineAllowed = false,
}: {
  onResult: (id: string, text: string) => void;
  isRecording: () => boolean;
  /** The "Transcribe voice notes online" setting. Missing means off. Read again at every start. */
  onlineAllowed?: boolean;
}): RecordingTranscriptionHook {
  const [supported, setSupported] = useState(false);
  const [route, setRoute] = useState<'on-device' | 'online' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, RecordingTranscriptionState>>({});

  const onResultRef = useRef(onResult);
  const isRecordingRef = useRef(isRecording);
  const onlineAllowedRef = useRef(onlineAllowed);
  useEffect(() => {
    onResultRef.current = onResult;
    isRecordingRef.current = isRecording;
    onlineAllowedRef.current = onlineAllowed;
  });

  const mounted = useRef(true);
  const supportedRef = useRef(false);
  const routeRef = useRef<'on-device' | 'online' | null>(null);
  const checkSeq = useRef(0);
  const run = useRef<Run | null>(null);
  const tokenCounter = useRef(0);
  // True from the module's start until its `end` event, whoever ended the run. While it is true no
  // new native run starts, so an event can never be attributed to the wrong run. If an aborted run
  // never sends `end`, this stays true (wedged) and every start is refused until any `end` arrives.
  const nativeActive = useRef(false);
  const endWaiters = useRef<(() => void)[]>([]);

  const setState = (id: string, state: RecordingTranscriptionState) => {
    if (mounted.current) setStates((prev) => ({ ...prev, [id]: state }));
  };

  // The route right now: on-device if proven; else online only if the setting is on (read from the
  // ref, so a run always sees the latest value) and the online route is capable. Never throws.
  const decide = useCallback(async (): Promise<RecognitionMode> => {
    const args = {
      os: Platform.OS,
      version: Platform.Version,
      api: ExpoSpeechRecognitionModule,
      deviceTag: deviceLocaleTag(),
      systemLocale: systemLocaleIdentifier(Platform.OS),
    };
    const none = { supported: false, locale: null } as const;
    const onDevice = await evaluateSupport(args);
    const allowed = onlineAllowedRef.current === true;
    const online = !onDevice.supported && allowed ? await evaluateOnlineSupport(args) : none;
    return decideRecognitionMode({ onlineAllowed: allowed, onDevice, online });
  }, []);

  const publishRoute = (next: 'on-device' | 'online' | null) => {
    routeRef.current = next;
    supportedRef.current = next !== null;
    setRoute(next);
    setSupported(next !== null);
  };

  const checkSupport = useCallback(async () => {
    const seq = ++checkSeq.current;
    const decision = await decide();
    // A newer check (the setting flipped meanwhile) wins.
    if (!mounted.current || seq !== checkSeq.current) return;
    publishRoute(decision.mode === 'none' ? null : decision.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publishRoute only writes refs and stable setters
  }, [decide]);

  // The setting flipped: turning it off removes the online route at once, then the capability is
  // re-derived. A run that is already going on continues (it was consented when it started).
  const lastAllowed = useRef(onlineAllowed);
  useEffect(() => {
    if (lastAllowed.current === onlineAllowed) return;
    lastAllowed.current = onlineAllowed;
    if (!onlineAllowed && routeRef.current === 'online') publishRoute(null);
    void checkSupport();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publishRoute only writes refs and stable setters
  }, [onlineAllowed, checkSupport]);

  // The check at mount (no permission prompt), and again on returning to the foreground while it
  // is false (an offline model may have been installed meanwhile).
  useEffect(() => {
    mounted.current = true;
    void checkSupport();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !supportedRef.current) void checkSupport();
    });
    return () => {
      mounted.current = false;
      sub.remove();
      const r = run.current;
      run.current = null;
      if (r) {
        if (r.timer) clearTimeout(r.timer);
        if (r.started) abortModule();
        r.settle();
      }
    };
  }, [checkSupport]);

  const nativeEnded = () => {
    nativeActive.current = false;
    const waiters = endWaiters.current;
    endWaiters.current = [];
    for (const w of waiters) w();
  };

  const armWatchdog = (r: Run) => {
    if (r.timer) clearTimeout(r.timer);
    r.timer = setTimeout(() => {
      if (run.current !== r) return;
      abortRun(r, 'failed', 'Transcribing took too long. Try again.');
    }, r.limitMs);
  };

  // Ends a run (only if it is still the current one): frees the slot and records the final state.
  const finish = (r: Run, state: RecordingTranscriptionState) => {
    if (run.current !== r) return false;
    if (r.timer) clearTimeout(r.timer);
    run.current = null;
    if (mounted.current && r.visible) {
      setBusyId(null);
      setState(r.id, state);
    }
    r.settle();
    return true;
  };

  const fail = (r: Run, code: TranscriptionErrorCode, message: string) =>
    finish(r, { status: 'failed', error: { code, message } });

  const deliver = (r: Run) => {
    const text = r.finals.join(' ').trim() || r.lastPartial.trim();
    if (!finish(r, { status: 'ready' })) return;
    if (mounted.current) onResultRef.current(r.id, text);
  };

  // Our own abort: the module will still report aborted/end for this run; those events find no
  // live run and are ignored (`nativeActive` stays true until `end`).
  const abortRun = (r: Run, code: TranscriptionErrorCode, message: string) => {
    if (run.current !== r) return;
    if (r.started) abortModule();
    fail(r, code, message);
  };

  // The run these events belong to: the current one, once its native run has started.
  const liveRun = () => (run.current?.started ? run.current : null);

  useSpeechRecognitionEvent('start', () => {
    const r = liveRun();
    if (r) armWatchdog(r);
  });
  useSpeechRecognitionEvent('audiostart', () => {
    const r = liveRun();
    if (r) armWatchdog(r);
  });
  useSpeechRecognitionEvent('result', (e) => {
    const r = liveRun();
    if (!r) return;
    armWatchdog(r);
    const text = (e.results?.[0]?.transcript ?? '').trim();
    if (e.isFinal) {
      if (text) r.finals.push(text);
      r.lastPartial = '';
    } else if (text) {
      r.lastPartial = text;
    }
  });
  useSpeechRecognitionEvent('error', (e) => {
    const r = liveRun();
    if (!r) return;
    // The module sends `end` after an error; `nativeActive` holds the next run back until then.
    const outcome = mapSpeechError(e, r.online);
    if (outcome.kind === 'empty') {
      deliver(r);
    } else if (outcome.kind === 'cancelled') {
      fail(r, 'cancelled', 'Cancelled.');
    } else {
      fail(
        r,
        outcome.code,
        outcome.code === 'permission' ? permissionDeniedMessage(Platform.OS) : outcome.message,
      );
    }
  });
  useSpeechRecognitionEvent('end', () => {
    const r = liveRun();
    nativeEnded();
    if (r) deliver(r);
  });

  // Going to the background: on-device recognition is not guaranteed to survive (UNVERIFIED).
  // 'inactive' (iOS notification shade, control center, call banner) does not abort.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const r = run.current;
      if (next === 'background' && r?.started) {
        abortRun(r, 'failed', 'Transcribing was interrupted. Try again.');
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abortRun only reads refs
  }, []);

  // Resolves true when no native run is active (waiting up to `ms` for its `end`).
  const waitForEnd = (ms: number) =>
    new Promise<boolean>((resolve) => {
      if (!nativeActive.current) {
        resolve(true);
        return;
      }
      const timer = setTimeout(() => {
        endWaiters.current = endWaiters.current.filter((w) => w !== waiter);
        resolve(!nativeActive.current);
      }, ms);
      const waiter = () => {
        clearTimeout(timer);
        resolve(true);
      };
      endWaiters.current.push(waiter);
    });

  const start = useCallback(
    async (
      id: string,
      uri: string,
      durationMs?: number,
      options?: { auto?: boolean },
    ): Promise<void> => {
      const auto = options?.auto === true;
      // 1. One run at a time: leave the active one alone and touch no state.
      if (run.current) return;
      // 2. The audio session belongs to the recorder. An automatic start just does not happen.
      if (isRecordingRef.current()) {
        if (auto) return;
        setState(id, {
          status: 'failed',
          error: { code: 'busy', message: 'Finish recording first, then transcribe.' },
        });
        return;
      }
      // Claim the slot at once so a second tap during the permission prompt cannot start another run.
      let settle = () => {};
      const ended = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const r: Run = {
        settle,
        id,
        token: ++tokenCounter.current,
        started: false,
        visible: !auto,
        online: false,
        finals: [],
        lastPartial: '',
        timer: null,
        limitMs: watchdogMs(durationMs),
      };
      run.current = r;
      // An automatic start shows nothing until its consent checks pass (see `show` below).
      const show = () => {
        r.visible = true;
        setBusyId(id);
        setState(id, { status: 'running' });
      };
      if (!auto) show();
      // An automatic start that is not eligible ends without any state, message or prompt.
      const skip = () => finish(r, NONE);
      const alive = () => run.current === r && mounted.current;

      const launch = async () => {
        try {
          // 3. Re-check the route and locale right now (the system locale can change while the app
          // runs, and the online setting is read from its ref each time).
          const first = await decide();
          if (!alive()) return;
          // Automatic starts only run on-device (the online route is always a tap).
          if (first.mode === 'none' || (auto && first.mode !== 'on-device')) {
            if (auto) skip();
            else fail(r, 'unsupported', 'This device cannot transcribe voice notes.');
            return;
          }
          // A previous native run that has not ended (an abort can take a moment) blocks a new one.
          if (nativeActive.current && !(await waitForEnd(END_WAIT_MS))) {
            if (auto) skip();
            else
              fail(r, 'busy', 'Still finishing the previous transcription. Try again in a moment.');
            return;
          }
          if (!alive()) return;
          // 4. Permissions at first use (the system prompt appears here, never earlier). An
          // automatic start only reads the current status: it never prompts.
          const ios = Platform.OS === 'ios';
          const permission = auto
            ? ios
              ? await ExpoSpeechRecognitionModule.getSpeechRecognizerPermissionsAsync()
              : await ExpoSpeechRecognitionModule.getPermissionsAsync()
            : ios
              ? await ExpoSpeechRecognitionModule.requestSpeechRecognizerPermissionsAsync()
              : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
          if (!alive()) return;
          if (!permission.granted) {
            if (auto) skip();
            else fail(r, 'permission', permissionDeniedMessage(Platform.OS));
            return;
          }
          if (auto) show();
          // A recording may have been opened while the prompt was up.
          if (isRecordingRef.current()) {
            if (auto) skip();
            else fail(r, 'busy', 'Finish recording first, then transcribe.');
            return;
          }
          // 5. Nothing plays while the module takes over the audio session.
          stopAllPlayback();
          // The locale used is the one checked right now, not the one from before the prompt.
          // The online setting is read again here: if it was turned off while the prompt was up, an
          // online route is gone and nothing starts.
          const final = await decide();
          if (!alive()) return;
          if (final.mode === 'none' || (auto && final.mode !== 'on-device')) {
            if (auto) skip();
            else fail(r, 'unsupported', 'This device cannot transcribe voice notes.');
            return;
          }
          if (nativeActive.current) {
            fail(r, 'busy', 'Still finishing the previous transcription. Try again in a moment.');
            return;
          }
          // 6. Start. The options come only from buildStartOptions (the flag is the mode's).
          r.started = true;
          r.online = final.mode === 'online';
          armWatchdog(r);
          ExpoSpeechRecognitionModule.start(buildStartOptions(Platform.OS, final, uri));
          nativeActive.current = true;
        } catch {
          if (run.current === r) {
            if (r.started) abortModule();
            fail(r, 'failed', 'Could not transcribe this voice note.');
          }
        }
      };
      await launch();
      await ended;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the helpers only read refs and stable setters
    [],
  );

  const cancel = useCallback((id: string) => {
    const r = run.current;
    if (r && r.id === id) abortRun(r, 'cancelled', 'Cancelled.');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abortRun only reads refs
  }, []);

  const cancelAll = useCallback(() => {
    const r = run.current;
    if (r) abortRun(r, 'cancelled', 'Cancelled.');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abortRun only reads refs
  }, []);

  return {
    supported,
    route,
    busyId,
    stateOf: (id) => states[id] ?? NONE,
    start,
    cancel,
    cancelAll,
  };
}
