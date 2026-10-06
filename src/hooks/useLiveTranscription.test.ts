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

    it('gives up after more than 5 consecutive failed restarts', async () => {
      const hook = await started();
      for (let i = 0; i < 5; i++) await endAfter(100);
      expect(speech.start).toHaveBeenCalledTimes(6);
      expect(hook.result.current.error).toBeNull();
      await endAfter(100);
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
      await endAfter(100, true);
      for (let i = 0; i < 5; i++) await endAfter(100);
      expect(speech.start).toHaveBeenCalledTimes(11);
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
