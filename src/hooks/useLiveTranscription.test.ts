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

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.clearAllMocks();
  Platform.OS = 'ios';
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
    await act(async () => hook.result.current.stop());
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
    await act(async () => hook.result.current.stop());
    await emit('end');
    await advance(1000);
    expect(speech.start).toHaveBeenCalledTimes(1);
  });

  it('gives up after repeated restarts that hear nothing', async () => {
    const hook = await started();
    for (let i = 0; i < 7; i++) {
      await emit('end');
      await advance(500);
    }
    expect(speech.start.mock.calls.length).toBeLessThan(8);
    expect(hook.result.current.error).toMatch(/stopped/);
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
    Platform.OS = 'android';
    speech.getSupportedLocales.mockResolvedValue({
      locales: ['en-US'],
      installedLocales: ['de-DE'],
    });
    const hook = await started();
    expect(speech.start).not.toHaveBeenCalled();
    expect(hook.result.current.error).toMatch(/model is not installed/);
  });

  it('on Android without on-device support, does not start', async () => {
    Platform.OS = 'android';
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
});
