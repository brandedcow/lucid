import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useLiveTranscription } from './useLiveTranscription';

type Handler = (event: unknown) => void;
const handlers: Record<string, Handler> = {};

jest.mock('expo-speech-recognition', () => {
  const React = jest.requireActual('react');
  return {
    ExpoSpeechRecognitionModule: {
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
      getAudioSessionCategoryAndOptionsIOS: jest.fn(),
      isRecognitionAvailable: jest.fn(),
      supportsOnDeviceRecognition: jest.fn(),
      requestPermissionsAsync: jest.fn(),
      getSupportedLocales: jest.fn(),
    },
    useSpeechRecognitionEvent: (name: string, handler: Handler) => {
      React.useEffect(() => {
        handlers[name] = handler;
      });
    },
  };
});

const speech = jest.mocked(ExpoSpeechRecognitionModule);
const emit = async (name: string, event: unknown = {}) => {
  await act(async () => handlers[name]?.(event));
};
const result = (transcript: string, isFinal: boolean) =>
  emit('result', { isFinal, results: [{ transcript }] });
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

const setOs = (os: 'ios' | 'android', version: number | string) => {
  Platform.OS = os;
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.clearAllMocks();
  speech.start.mockReset();
  setOs('ios', '17.0');
  speech.isRecognitionAvailable.mockReturnValue(true);
  speech.supportsOnDeviceRecognition.mockReturnValue(true);
  speech.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
  speech.getSupportedLocales.mockResolvedValue({ locales: [], installedLocales: [] });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function started() {
  const hook = await renderHook(() => useLiveTranscription());
  await act(async () => {
    await hook.result.current.start();
  });
  return hook;
}

type Hook = Awaited<ReturnType<typeof started>>;

/** Calls stop(), delivers the native `end`, and returns what stop() resolved with. */
async function stopAndEnd(hook: Hook) {
  let text = '';
  const stopped = hook.result.current.stop().then((t) => (text = t));
  await emit('end');
  await act(async () => {
    await stopped;
  });
  return text;
}

describe('useLiveTranscription', () => {
  it('starts on-device, continuous recognition with interim results', async () => {
    await started();
    expect(speech.start).toHaveBeenCalledWith(
      expect.objectContaining({
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: true,
      }),
    );
  });

  it('stops recognition', async () => {
    const hook = await started();
    await stopAndEnd(hook);
    expect(speech.stop).toHaveBeenCalled();
  });

  it('shows interim text, then replaces it with the final text', async () => {
    const hook = await started();
    await result('I was', false);
    expect(hook.result.current.transcript).toBe('I was');
    await result('I was flying', false);
    expect(hook.result.current.transcript).toBe('I was flying');
    await result('I was flying.', true);
    expect(hook.result.current.transcript).toBe('I was flying.');
    await result('over', false);
    expect(hook.result.current.transcript).toBe('I was flying. over');
  });

  it('restarts after an unexpected end and appends rather than overwrites', async () => {
    const hook = await started();
    await result('first part', true);
    await result('still talk', false);
    await emit('end');
    expect(hook.result.current.transcript).toBe('first part still talk');

    await advance(500);
    expect(speech.start).toHaveBeenCalledTimes(2);

    await result('second part', true);
    expect(hook.result.current.transcript).toBe('first part still talk second part');
  });

  it('does not restart after stop()', async () => {
    const hook = await started();
    await stopAndEnd(hook);
    await emit('end');
    await advance(1000);
    expect(speech.start).toHaveBeenCalledTimes(1);
  });

  describe('restart crash-loop guard', () => {
    /** One session that ends `ms` after it began, with an optional result first. */
    const endAfter = async (ms: number, withResult = false) => {
      await advance(ms);
      if (withResult) await result('hello', false);
      await emit('end');
      await advance(500);
    };

    // Rule: only restarts count. A failed first session just triggers restart 1 and is not
    // counted; after 5 consecutive failed restarts we give up. So an always-failing recognizer
    // gets 6 native starts in total (1 initial + 5 restarts), whether or not the first
    // session was healthy. Any result (or a healthy session) resets the count.
    it('gives up after 5 consecutive failed restarts (6 native starts)', async () => {
      const hook = await started();
      // The first session's failure is restart 1's trigger; ends 2..5 fail restarts 1..4.
      for (let i = 0; i < 5; i++) await endAfter(100);
      expect(speech.start).toHaveBeenCalledTimes(6);
      expect(hook.result.current.error).toBeNull();
      // Restart 5 fails: give up without a 7th start.
      await endAfter(100);
      expect(speech.start).toHaveBeenCalledTimes(6);
      expect(hook.result.current.error).toMatch(/stopped/);
    });

    it('also allows exactly 5 failed restarts after a healthy first session', async () => {
      const hook = await started();
      await endAfter(2500, true); // healthy first session, then restart 1
      expect(speech.start).toHaveBeenCalledTimes(2);
      for (let i = 0; i < 4; i++) await endAfter(100); // restarts 1..4 fail, restart 5 starts
      expect(speech.start).toHaveBeenCalledTimes(6);
      expect(hook.result.current.error).toBeNull();
      await endAfter(100); // restart 5 fails
      expect(speech.start).toHaveBeenCalledTimes(6);
      expect(hook.result.current.error).toMatch(/stopped/);
    });

    it('does not count a long session as failed even with no result', async () => {
      await started();
      for (let i = 0; i < 8; i++) await endAfter(2500);
      expect(speech.start).toHaveBeenCalledTimes(9);
    });

    it('a result resets the failure count', async () => {
      const hook = await started();
      for (let i = 0; i < 4; i++) await endAfter(100);
      await endAfter(100, true); // a restart that produced a result resets the count
      expect(speech.start).toHaveBeenCalledTimes(6);
      for (let i = 0; i < 4; i++) await endAfter(100);
      expect(speech.start).toHaveBeenCalledTimes(10);
      expect(hook.result.current.error).toBeNull();
    });

    it('clears the error when a result arrives', async () => {
      const hook = await started();
      await emit('error', { error: 'network', message: 'blip' });
      expect(hook.result.current.error).toContain('network');
      await result('hello', false);
      expect(hook.result.current.error).toBeNull();
    });

    it('clears the error on start', async () => {
      speech.requestPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
      const hook = await started();
      expect(hook.result.current.error).toMatch(/permission/);
      await act(async () => {
        await hook.result.current.start();
      });
      expect(hook.result.current.error).toBeNull();
    });
  });

  it('ignores quiet errors such as no-speech', async () => {
    const hook = await started();
    await emit('error', { error: 'no-speech', message: 'none' });
    expect(hook.result.current.error).toBeNull();
  });

  it('records a fatal error and does not restart', async () => {
    const hook = await started();
    await emit('error', { error: 'not-allowed', message: 'denied' });
    await emit('end');
    await advance(1000);
    expect(hook.result.current.error).toContain('not-allowed');
    expect(speech.start).toHaveBeenCalledTimes(1);
  });

  it('does not start when permission is denied', async () => {
    speech.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);
    const hook = await started();
    expect(speech.start).not.toHaveBeenCalled();
    expect(hook.result.current.error).toMatch(/permission/);
  });

  it('reports unsupported devices without throwing', async () => {
    speech.isRecognitionAvailable.mockReturnValue(false);
    const hook = await started();
    expect(speech.start).not.toHaveBeenCalled();
    expect(hook.result.current.isSupported).toBe(false);
  });

  it('on Android, reports a missing on-device model instead of using the cloud', async () => {
    setOs('android', 33);
    speech.getSupportedLocales.mockResolvedValue({
      locales: ['en-US'],
      installedLocales: ['de-DE'],
    });
    const hook = await started();
    expect(speech.start).not.toHaveBeenCalled();
    expect(hook.result.current.error).toMatch(/model is not installed/);
  });

  it('on Android without on-device support, does not start', async () => {
    setOs('android', 33);
    speech.supportsOnDeviceRecognition.mockReturnValue(false);
    const hook = await started();
    expect(speech.start).not.toHaveBeenCalled();
    expect(hook.result.current.isSupported).toBe(false);
    expect(hook.result.current.error).toMatch(/model is not installed/);
  });

  it('turns a thrown native error into an error state', async () => {
    speech.start.mockImplementation(() => {
      throw new Error('boom');
    });
    const hook = await started();
    expect(hook.result.current.error).toBeTruthy();
  });

  describe('session lifecycle', () => {
    const deferred = <T>() => {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    };

    it('stop during the permission request means native start is never called', async () => {
      const permission = deferred<{ granted: boolean }>();
      speech.requestPermissionsAsync.mockReturnValue(permission.promise as never);
      const hook = await renderHook(() => useLiveTranscription());
      let startResult: boolean | undefined;
      await act(async () => {
        void hook.result.current.start().then((r) => (startResult = r));
      });
      await act(async () => {
        await hook.result.current.stop();
      });
      await act(async () => permission.resolve({ granted: true }));
      expect(speech.start).not.toHaveBeenCalled();
      expect(startResult).toBe(false);
    });

    it('unmount during start never starts native recognition and aborts', async () => {
      const permission = deferred<{ granted: boolean }>();
      speech.requestPermissionsAsync.mockReturnValue(permission.promise as never);
      const hook = await renderHook(() => useLiveTranscription());
      await act(async () => {
        void hook.result.current.start();
      });
      await hook.unmount();
      await act(async () => permission.resolve({ granted: true }));
      expect(speech.start).not.toHaveBeenCalled();
      expect(speech.abort).toHaveBeenCalled();
    });

    it('unmount clears a pending restart', async () => {
      const hook = await started();
      await emit('end');
      await hook.unmount();
      await advance(1000);
      expect(speech.start).toHaveBeenCalledTimes(1);
    });

    it('a late end after a new start does not start native twice', async () => {
      const hook = await started();
      let startResult: boolean | undefined;
      // stop() then start() straight away: the new start must wait for the old session's end.
      await act(async () => {
        void hook.result.current.stop();
        void hook.result.current.start().then((r) => (startResult = r));
      });
      expect(speech.start).toHaveBeenCalledTimes(1);
      await emit('end');
      await advance(0);
      expect(startResult).toBe(true);
      expect(speech.start).toHaveBeenCalledTimes(2);
      // Nothing else is pending: no restart timer from the old session fires.
      await advance(2000);
      expect(speech.start).toHaveBeenCalledTimes(2);
    });

    it('aborts a stuck old session before starting again', async () => {
      const hook = await started();
      await act(async () => {
        void hook.result.current.stop();
        void hook.result.current.start();
      });
      await advance(1100);
      expect(speech.abort).toHaveBeenCalled();
      await advance(600);
      expect(speech.start).toHaveBeenCalledTimes(2);
    });

    it('stop() in the restart gap resolves immediately and nothing restarts', async () => {
      const hook = await started();
      await result('before the gap', false);
      await emit('end'); // restart is scheduled 300 ms out
      speech.stop.mockClear();
      let text: string | undefined;
      await act(async () => {
        void hook.result.current.stop().then((t) => (text = t));
      });
      // No timers advanced: it must not have waited for an end that never comes.
      expect(text).toBe('before the gap');
      expect(speech.stop).not.toHaveBeenCalled();
      await advance(2000);
      expect(speech.start).toHaveBeenCalledTimes(1);
      // Phase is idle again: a new start() begins at once, without the abort wait.
      let startResult: boolean | undefined;
      await act(async () => {
        void hook.result.current.start().then((r) => (startResult = r));
      });
      expect(startResult).toBe(true);
      expect(speech.start).toHaveBeenCalledTimes(2);
      expect(speech.abort).not.toHaveBeenCalled();
    });

    it('swallows the late end of an aborted session once', async () => {
      const hook = await started();
      await act(async () => {
        void hook.result.current.stop();
        void hook.result.current.start();
      });
      await advance(1100);
      await advance(600);
      expect(speech.abort).toHaveBeenCalled();
      expect(speech.start).toHaveBeenCalledTimes(2);
      await emit('end'); // the stale end of the aborted session
      await advance(1000);
      expect(speech.start).toHaveBeenCalledTimes(2);
      // The new session is still live: its result is kept and a real end restarts it.
      await result('hello', true);
      await emit('end');
      await advance(500);
      expect(speech.start).toHaveBeenCalledTimes(3);
      expect(hook.result.current.transcript).toBe('hello');
    });

    it('does not swallow an end once the new session has produced a result', async () => {
      const hook = await started();
      await act(async () => {
        void hook.result.current.stop();
        void hook.result.current.start();
      });
      await advance(1100);
      await advance(600);
      await result('hello', false);
      await emit('end');
      await advance(500);
      expect(speech.start).toHaveBeenCalledTimes(3);
    });

    it('stop() resolves with the final text after end', async () => {
      const hook = await started();
      await result('first', true);
      await result('last words', false);
      let text: string | undefined;
      await act(async () => {
        void hook.result.current.stop().then((t) => (text = t));
      });
      expect(text).toBeUndefined();
      await result('last words.', true);
      await emit('end');
      expect(text).toBe('first last words.');
    });

    it('stop() resolves after the timeout if end never comes', async () => {
      const hook = await started();
      await result('some words', false);
      let text: string | undefined;
      await act(async () => {
        void hook.result.current.stop().then((t) => (text = t));
      });
      await advance(1600);
      expect(text).toBe('some words');
    });
  });

  describe('pause and resume', () => {
    const deferred = <T>() => {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    };
    const pause = (hook: Hook) =>
      act(async () => {
        hook.result.current.pause();
      });
    const resume = async (hook: Hook) => {
      let ok: boolean | undefined;
      await act(async () => {
        ok = await hook.result.current.resume();
      });
      return ok;
    };
    /** A session that ends `ms` after it began with no result, then lets the restart delay pass. */
    const endAfter = async (ms: number) => {
      await advance(ms);
      await emit('end');
      await advance(500);
    };

    it('pause while running stops native, keeps a final result from the drain, and goes quiet', async () => {
      const hook = await started();
      await result('hello', false);
      await pause(hook);
      expect(speech.stop).toHaveBeenCalledTimes(1);
      expect(hook.result.current.paused).toBe(true);
      await result('hello there.', true); // the flushed final text arrives during the drain
      await emit('end');
      await advance(3000);
      expect(speech.start).toHaveBeenCalledTimes(1);
      expect(speech.abort).not.toHaveBeenCalled();
      expect(hook.result.current.transcript).toBe('hello there.');
      expect(hook.result.current.paused).toBe(true);
      expect(hook.result.current.listening).toBe(false);
    });

    it('commits interim text left over when the drain ends without a final result', async () => {
      const hook = await started();
      await result('dangling words', false);
      await pause(hook);
      await emit('end');
      expect(hook.result.current.transcript).toBe('dangling words');
      await resume(hook);
      await result('more', true);
      expect(hook.result.current.transcript).toBe('dangling words more');
    });

    it('pause in the restart gap goes straight to paused with interim text committed', async () => {
      const hook = await started();
      await result('before the gap', false);
      await emit('end'); // restart scheduled 300 ms out
      speech.stop.mockClear();
      await pause(hook);
      expect(speech.stop).not.toHaveBeenCalled();
      expect(hook.result.current.paused).toBe(true);
      expect(hook.result.current.transcript).toBe('before the gap');
      await advance(3000);
      expect(speech.start).toHaveBeenCalledTimes(1);
    });

    it('pause during starting ends in paused without calling native start', async () => {
      const permission = deferred<{ granted: boolean }>();
      speech.requestPermissionsAsync.mockReturnValue(permission.promise as never);
      const hook = await renderHook(() => useLiveTranscription());
      let startResult: boolean | undefined;
      await act(async () => {
        void hook.result.current.start().then((r) => (startResult = r));
      });
      await pause(hook);
      await act(async () => permission.resolve({ granted: true }));
      expect(speech.start).not.toHaveBeenCalled();
      expect(startResult).toBe(true);
      expect(hook.result.current.paused).toBe(true);
      // And it can be resumed without asking for permission again.
      speech.requestPermissionsAsync.mockClear();
      expect(await resume(hook)).toBe(true);
      expect(speech.start).toHaveBeenCalledTimes(1);
      expect(speech.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('ignores results and errors while paused', async () => {
      const hook = await started();
      await result('kept', true);
      await pause(hook);
      await emit('end');
      await result('ghost', true);
      await result('ghost two', false);
      await emit('error', { error: 'network', message: 'blip' });
      expect(hook.result.current.transcript).toBe('kept');
      expect(hook.result.current.error).toBeNull();
    });

    it('resume starts a new session, appends, asks for nothing, and is not a restart', async () => {
      setOs('android', 33);
      const hook = await started();
      await result('first', true);
      await pause(hook);
      await emit('end');
      speech.requestPermissionsAsync.mockClear();
      speech.getSupportedLocales.mockClear();
      expect(await resume(hook)).toBe(true);
      expect(speech.start).toHaveBeenCalledTimes(2);
      expect(speech.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(speech.getSupportedLocales).not.toHaveBeenCalled();
      expect(hook.result.current.paused).toBe(false);
      await result('second', true);
      expect(hook.result.current.transcript).toBe('first second');
    });

    it('a resumed session is not counted as a restart in the crash-loop guard', async () => {
      const hook = await started();
      await pause(hook);
      await emit('end');
      await resume(hook); // native start 2
      // Same accounting as a first session: its failure is not counted, it only triggers a restart.
      for (let i = 0; i < 5; i++) await endAfter(100);
      expect(speech.start).toHaveBeenCalledTimes(7);
      expect(hook.result.current.error).toBeNull();
      await endAfter(100);
      expect(speech.start).toHaveBeenCalledTimes(7);
      expect(hook.result.current.error).toMatch(/stopped/);
    });

    it('resume while a pause is draining waits for end', async () => {
      const hook = await started();
      await result('a', true);
      await pause(hook);
      let ok: boolean | undefined;
      await act(async () => {
        void hook.result.current.resume().then((r) => (ok = r));
      });
      expect(speech.start).toHaveBeenCalledTimes(1);
      await result('b.', true);
      await emit('end');
      await advance(0);
      expect(ok).toBe(true);
      expect(speech.start).toHaveBeenCalledTimes(2);
      expect(speech.abort).not.toHaveBeenCalled();
      expect(hook.result.current.transcript).toBe('a b.');
    });

    it('resume aborts a stuck pause and swallows the stale end', async () => {
      const hook = await started();
      await pause(hook);
      await act(async () => {
        void hook.result.current.resume();
      });
      await advance(1100);
      expect(speech.abort).toHaveBeenCalled();
      await advance(600);
      expect(speech.start).toHaveBeenCalledTimes(2);
      await emit('end'); // the stale end of the aborted session
      await advance(1000);
      expect(speech.start).toHaveBeenCalledTimes(2);
      await result('hello', true);
      await emit('end');
      await advance(500);
      expect(speech.start).toHaveBeenCalledTimes(3);
    });

    it('stop() while paused returns the full text without native stop', async () => {
      const hook = await started();
      await result('all of it', true);
      await pause(hook);
      await emit('end');
      speech.stop.mockClear();
      let text: string | undefined;
      await act(async () => {
        void hook.result.current.stop().then((t) => (text = t));
      });
      expect(text).toBe('all of it');
      expect(speech.stop).not.toHaveBeenCalled();
      expect(hook.result.current.paused).toBe(false);
      expect(await resume(hook)).toBe(false);
      // Idle again: a new start() begins at once.
      await act(async () => {
        await hook.result.current.start();
      });
      expect(speech.start).toHaveBeenCalledTimes(2);
      expect(speech.abort).not.toHaveBeenCalled();
    });

    it('stop() while a pause is draining returns the final text and ends idle', async () => {
      const hook = await started();
      await result('first', true);
      await result('last', false);
      await pause(hook);
      let text: string | undefined;
      await act(async () => {
        void hook.result.current.stop().then((t) => (text = t));
      });
      expect(hook.result.current.paused).toBe(false);
      expect(text).toBeUndefined();
      await result('last.', true);
      await emit('end');
      expect(text).toBe('first last.');
      await advance(3000);
      expect(speech.start).toHaveBeenCalledTimes(1);
      expect(await resume(hook)).toBe(false);
      expect(speech.start).toHaveBeenCalledTimes(1);
    });

    it('unmount while paused is clean', async () => {
      const hook = await started();
      await result('x', true);
      await pause(hook);
      await emit('end');
      speech.abort.mockClear();
      await hook.unmount();
      expect(speech.abort).toHaveBeenCalledTimes(1);
      const stateWrites = jest.spyOn(console, 'error');
      await emit('end');
      await result('ghost', true);
      await advance(3000);
      expect(speech.start).toHaveBeenCalledTimes(1);
      expect(speech.stop).toHaveBeenCalledTimes(1);
      expect(hook.result.current.transcript).toBe('x');
      expect(hook.result.current.paused).toBe(true); // state is frozen, not written after unmount
      expect(stateWrites).not.toHaveBeenCalled();
    });

    describe('hardening', () => {
      const resumeAsync = (hook: Hook) => {
        const out: { value?: boolean; promise?: Promise<boolean> } = {};
        out.promise = hook.result.current.resume();
        void out.promise.then((v) => (out.value = v));
        return out;
      };

      it('concurrent double resume during a stuck drain aborts once and starts once', async () => {
        const hook = await started();
        await pause(hook);
        let p1: Promise<boolean> | undefined;
        let p2: Promise<boolean> | undefined;
        await act(async () => {
          p1 = hook.result.current.resume();
          p2 = hook.result.current.resume();
        });
        expect(p2).toBe(p1);
        await advance(1100);
        await advance(600);
        expect(speech.abort).toHaveBeenCalledTimes(1);
        expect(speech.start).toHaveBeenCalledTimes(2);
        await expect(p1).resolves.toBe(true);
        await expect(p2).resolves.toBe(true);
        expect(hook.result.current.paused).toBe(false);
        // Running: a result is kept and an unexpected end restarts.
        await emit('end'); // stale end of the aborted session, swallowed
        await result('alive', false);
        await emit('end');
        await advance(500);
        expect(speech.start).toHaveBeenCalledTimes(3);
        expect(hook.result.current.transcript).toBe('alive');
      });

      it('resume while starting returns true; start() then goes straight to running', async () => {
        const permission = deferred<{ granted: boolean }>();
        speech.requestPermissionsAsync.mockReturnValue(permission.promise as never);
        const hook = await renderHook(() => useLiveTranscription());
        await act(async () => {
          void hook.result.current.start();
        });
        await pause(hook);
        expect(await resume(hook)).toBe(true);
        expect(speech.start).not.toHaveBeenCalled();
        expect(hook.result.current.paused).toBe(false);
        await act(async () => permission.resolve({ granted: true }));
        expect(speech.start).toHaveBeenCalledTimes(1);
        expect(hook.result.current.paused).toBe(false);
        await result('live', false);
        expect(hook.result.current.transcript).toBe('live');
      });

      it('pause, resume, pause before the old end ends paused with no new native start', async () => {
        const hook = await started();
        await result('one', true);
        await pause(hook);
        let out: ReturnType<typeof resumeAsync> | undefined;
        await act(async () => {
          out = resumeAsync(hook);
        });
        await pause(hook); // newer intent: pause
        expect(speech.stop).toHaveBeenCalledTimes(1);
        expect(hook.result.current.paused).toBe(true);
        await emit('end');
        await advance(0);
        expect(out?.value).toBe(false);
        expect(speech.start).toHaveBeenCalledTimes(1);
        expect(hook.result.current.paused).toBe(true);
        await advance(3000);
        expect(speech.start).toHaveBeenCalledTimes(1);
        // A later resume works.
        expect(await resume(hook)).toBe(true);
        expect(speech.start).toHaveBeenCalledTimes(2);
        expect(hook.result.current.paused).toBe(false);
      });

      it('pause, resume, pause, resume ends running with a single new session', async () => {
        const hook = await started();
        await pause(hook);
        let out: ReturnType<typeof resumeAsync> | undefined;
        let second: Promise<boolean> | undefined;
        await act(async () => {
          out = resumeAsync(hook);
        });
        await pause(hook);
        await act(async () => {
          second = hook.result.current.resume();
        });
        expect(second).toBe(out?.promise);
        await emit('end');
        await advance(0);
        await expect(second).resolves.toBe(true);
        expect(speech.start).toHaveBeenCalledTimes(2);
        expect(speech.stop).toHaveBeenCalledTimes(1);
        expect(hook.result.current.paused).toBe(false);
      });

      it('pause during a post-abort resume wait still ends paused', async () => {
        const hook = await started();
        await pause(hook);
        let out: ReturnType<typeof resumeAsync> | undefined;
        await act(async () => {
          out = resumeAsync(hook);
        });
        await advance(1100); // aborted, now in the 500 ms wait
        await pause(hook);
        await advance(600);
        expect(out?.value).toBe(false);
        expect(speech.start).toHaveBeenCalledTimes(1);
        expect(hook.result.current.paused).toBe(true);
        expect(await resume(hook)).toBe(true);
        expect(speech.start).toHaveBeenCalledTimes(2);
      });

      it('an end during the post-abort wait does not arm the stale-end swallow', async () => {
        const hook = await started();
        await pause(hook);
        await act(async () => {
          void hook.result.current.resume();
        });
        await advance(1100);
        expect(speech.abort).toHaveBeenCalledTimes(1);
        await emit('end'); // arrives inside the 500 ms wait
        await advance(0);
        expect(speech.start).toHaveBeenCalledTimes(2);
        // The new session's first quick end is real: it must restart, not be swallowed.
        await emit('end');
        await advance(500);
        expect(speech.start).toHaveBeenCalledTimes(3);
      });

      it('commits interim text when a stuck drain is aborted', async () => {
        const hook = await started();
        await result('left over', false);
        await pause(hook);
        await act(async () => {
          void hook.result.current.resume();
        });
        await advance(1100);
        await advance(600);
        expect(speech.abort).toHaveBeenCalledTimes(1);
        await result('next', true);
        expect(hook.result.current.transcript).toBe('left over next');
      });

      it('stop() during a pause drain makes no second native stop', async () => {
        const hook = await started();
        await result('first', true);
        await pause(hook);
        expect(speech.stop).toHaveBeenCalledTimes(1);
        let text: string | undefined;
        await act(async () => {
          void hook.result.current.stop().then((t) => (text = t));
        });
        expect(speech.stop).toHaveBeenCalledTimes(1);
        await result('last.', true);
        await emit('end');
        expect(text).toBe('first last.');
        expect(await resume(hook)).toBe(false);
        expect(speech.start).toHaveBeenCalledTimes(1);
      });

      it('a double pause is a no-op', async () => {
        const hook = await started();
        await pause(hook);
        await pause(hook);
        expect(speech.stop).toHaveBeenCalledTimes(1);
        await emit('end');
        await pause(hook);
        expect(speech.stop).toHaveBeenCalledTimes(1);
        expect(hook.result.current.paused).toBe(true);
        expect(await resume(hook)).toBe(true);
        expect(speech.start).toHaveBeenCalledTimes(2);
      });

      it('pause when native stop() throws still pauses (accepted gap)', async () => {
        const hook = await started();
        speech.stop.mockImplementationOnce(() => {
          throw new Error('boom');
        });
        await pause(hook);
        // Documents current behavior: paused and no longer native-active, even though native may
        // in principle still be alive. Accepted gap (see the comment in pause()).
        expect(hook.result.current.paused).toBe(true);
        expect(hook.result.current.listening).toBe(false);
        await advance(3000);
        expect(speech.start).toHaveBeenCalledTimes(1);
        // Not native-active: stop() finishes at once with no native stop and no waiting.
        speech.stop.mockClear();
        let text: string | undefined;
        await act(async () => {
          void hook.result.current.stop().then((t) => (text = t));
        });
        expect(text).toBe('');
        expect(speech.stop).not.toHaveBeenCalled();
      });

      it('resume() when beginRecognition throws goes idle with an error and clears in-flight', async () => {
        const hook = await started();
        await pause(hook);
        await emit('end');
        speech.start.mockImplementationOnce(() => {
          throw new Error('boom');
        });
        expect(await resume(hook)).toBe(false);
        expect(hook.result.current.error).toBe('Live text stopped.');
        expect(hook.result.current.paused).toBe(false);
        // In-flight was cleared: pause() is a real no-op (idle) and a fresh start() works.
        await pause(hook);
        expect(hook.result.current.paused).toBe(false);
        await act(async () => {
          await hook.result.current.start();
        });
        expect(speech.start).toHaveBeenCalledTimes(3);
      });

      it('resume bails by token when stop() runs during the wait', async () => {
        const hook = await started();
        await pause(hook);
        let out: ReturnType<typeof resumeAsync> | undefined;
        await act(async () => {
          out = resumeAsync(hook);
        });
        await act(async () => {
          void hook.result.current.stop();
        });
        await emit('end');
        await advance(2000);
        expect(out?.value).toBe(false);
        expect(speech.start).toHaveBeenCalledTimes(1);
        expect(speech.stop).toHaveBeenCalledTimes(1);
      });

      it('resume bails by token when the hook unmounts during the wait', async () => {
        const hook = await started();
        await pause(hook);
        let out: ReturnType<typeof resumeAsync> | undefined;
        await act(async () => {
          out = resumeAsync(hook);
        });
        await hook.unmount();
        await advance(3000);
        expect(out?.value).toBe(false);
        expect(speech.start).toHaveBeenCalledTimes(1);
      });
    });

    it('cycling pause and resume 6 times does not trip the crash-loop guard', async () => {
      const hook = await started();
      for (let i = 0; i < 6; i++) {
        await advance(100); // short sessions with no result: would count if they were restarts
        await pause(hook);
        await emit('end');
        expect(await resume(hook)).toBe(true);
      }
      expect(speech.start).toHaveBeenCalledTimes(7);
      expect(hook.result.current.error).toBeNull();
      // Still alive: an unexpected end restarts as usual.
      await result('hello', false);
      await emit('end');
      await advance(500);
      expect(speech.start).toHaveBeenCalledTimes(8);
    });

    it('pause, resume and stop are safe no-ops after a fatal error', async () => {
      const hook = await started();
      await emit('error', { error: 'not-allowed', message: 'denied' });
      await emit('end');
      speech.stop.mockClear();
      await pause(hook);
      expect(hook.result.current.paused).toBe(false);
      expect(speech.stop).not.toHaveBeenCalled();
      expect(await resume(hook)).toBe(false);
      await hook.result.current.stop();
      expect(speech.start).toHaveBeenCalledTimes(1);
    });

    it('pause and resume do nothing when never started', async () => {
      const hook = await renderHook(() => useLiveTranscription());
      await act(async () => {
        hook.result.current.pause();
      });
      expect(hook.result.current.paused).toBe(false);
      let ok: boolean | undefined;
      await act(async () => {
        ok = await hook.result.current.resume();
      });
      expect(ok).toBe(false);
      expect(speech.start).not.toHaveBeenCalled();
      expect(speech.stop).not.toHaveBeenCalled();
    });
  });

  describe('OS gate', () => {
    it.each([
      ['android', 32, false],
      ['android', 33, true],
      ['ios', '16.4', false],
      ['ios', '17.0', true],
    ] as const)('%s %s -> supported=%s', async (os, version, ok) => {
      setOs(os, version);
      const hook = await renderHook(() => useLiveTranscription());
      let startResult: boolean | undefined;
      await act(async () => {
        startResult = await hook.result.current.start();
      });
      expect(startResult).toBe(ok);
      expect(hook.result.current.isSupported).toBe(ok);
      if (ok) {
        expect(speech.start).toHaveBeenCalled();
      } else {
        expect(speech.start).not.toHaveBeenCalled();
        expect(speech.isRecognitionAvailable).not.toHaveBeenCalled();
        expect(speech.requestPermissionsAsync).not.toHaveBeenCalled();
        expect(hook.result.current.error).toBe("Live text isn't available on this phone.");
      }
    });
  });
});
