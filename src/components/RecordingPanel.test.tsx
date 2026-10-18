import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, AlertButton } from 'react-native';
import { discardRecording } from '../services/recordingFiles';
import { LEVEL_SAMPLE_MS, RecordingPanel } from './RecordingPanel';

jest.mock('../services/recordingFiles', () => ({ discardRecording: jest.fn() }));

const mockRec = { start: jest.fn(), stop: jest.fn(), level: 0, durationMs: 0 };
jest.mock('../hooks/useDreamRecorder', () => ({
  useDreamRecorder: () => ({ ...mockRec, pause: jest.fn(), resume: jest.fn(), isRecording: true }),
}));

const CACHE = 'file:///cache/p1.m4a';
const handlers = { onRecorded: jest.fn(), onClosed: jest.fn(), onDiscarded: jest.fn() };
const leaveRef: { current: (() => void) | null } = { current: null };
const buttons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];

const renderPanel = async () => {
  const view = await render(
    <RecordingPanel microphoneMessage="Mic needed." leaveRef={leaveRef} {...handlers} />,
  );
  await act(async () => {});
  return view;
};
const tap = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};
// Drives the handle's PanResponder with a vertical drag of `dy` points from touch-down to release.
const drag = async (dy: number) => {
  const h = screen.getByTestId('recording-handle-area').props;
  const event = (y: number, t: number) => ({
    nativeEvent: { touches: [{ pageX: 0, pageY: y }], changedTouches: [{ pageX: 0, pageY: y }] },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: t,
      touchBank: [
        {
          touchActive: true,
          startPageX: 0,
          startPageY: 0,
          startTimeStamp: 0,
          currentPageX: 0,
          currentPageY: y,
          currentTimeStamp: t,
          previousPageX: 0,
          previousPageY: 0,
          previousTimeStamp: t - 1,
        },
      ],
    },
  });
  await act(async () => {
    h.onStartShouldSetResponderCapture?.(event(0, 1));
    h.onMoveShouldSetResponderCapture?.(event(dy, 20));
    const claimed = h.onMoveShouldSetResponder?.(event(dy, 20));
    if (claimed) {
      h.onResponderGrant?.(event(dy, 20));
      h.onResponderMove?.(event(dy, 21));
      h.onResponderRelease?.(event(dy, 22));
    }
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRec.level = 0;
  mockRec.durationMs = 0;
  mockRec.start.mockResolvedValue(true);
  mockRec.stop.mockResolvedValue({ uri: CACHE, durationMs: 3000 });
  leaveRef.current = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('RecordingPanel idle', () => {
  it('mounts idle: does not start the recorder or ask permission, shows 0:00 and a start button', async () => {
    await renderPanel();
    expect(mockRec.start).not.toHaveBeenCalled();
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByLabelText('Start recording')).toBeTruthy();
    expect(screen.getByTestId('recording-waveform-idle')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('tapping the handle closes the panel with no confirmation', async () => {
    await renderPanel();
    await tap('Close recording panel');
    expect(handlers.onClosed).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockRec.stop).not.toHaveBeenCalled();
  });

  it('back (leaveRef) closes it with no confirmation', async () => {
    await renderPanel();
    await act(async () => leaveRef.current?.());
    expect(handlers.onClosed).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('a swipe down on the handle closes it with no confirmation', async () => {
    await renderPanel();
    await drag(80);
    expect(handlers.onClosed).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('a short drag or an upward drag does not close it', async () => {
    await renderPanel();
    await drag(20);
    await drag(-80);
    expect(handlers.onClosed).not.toHaveBeenCalled();
  });

  it('unmounting while idle stops nothing and deletes nothing', async () => {
    const view = await renderPanel();
    await view.unmount();
    expect(mockRec.stop).not.toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();
  });
});

describe('RecordingPanel recording', () => {
  it('the red button starts, shows the live waveform and a stop button; stop reports the recording with a waveform', async () => {
    const view = await renderPanel();
    await tap('Start recording');
    expect(mockRec.start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('recording-waveform-live')).toBeTruthy();
    mockRec.level = 0.8;
    await view.rerender(
      <RecordingPanel microphoneMessage="Mic needed." leaveRef={leaveRef} {...handlers} />,
    );
    await act(async () => void jest.advanceTimersByTime(LEVEL_SAMPLE_MS * 3));
    await tap('Stop recording');
    expect(mockRec.stop).toHaveBeenCalledTimes(1);
    expect(handlers.onRecorded).toHaveBeenCalledTimes(1);
    const rec = handlers.onRecorded.mock.calls[0][0];
    expect(rec).toMatchObject({ uri: CACHE, durationMs: 3000 });
    expect(Math.max(...rec.waveform)).toBe(0.8);
    expect(handlers.onClosed).not.toHaveBeenCalled();
  });

  it('the handle does not drag or close while recording, and back asks to discard', async () => {
    await renderPanel();
    await tap('Start recording');
    await drag(80);
    expect(handlers.onClosed).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Close recording panel')).toBeNull();
    await act(async () => leaveRef.current?.());
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard this recording?',
      'Your recording will be deleted.',
      expect.any(Array),
    );
    expect(handlers.onClosed).not.toHaveBeenCalled();
    await act(async () =>
      buttons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(discardRecording).toHaveBeenCalledWith(CACHE);
    expect(handlers.onDiscarded).toHaveBeenCalledTimes(1);
  });

  it('denied permission returns to idle and keeps the panel open', async () => {
    mockRec.start.mockResolvedValue(false);
    await renderPanel();
    await tap('Start recording');
    expect(Alert.alert).toHaveBeenCalledWith('Microphone access needed', 'Mic needed.');
    expect(handlers.onClosed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Start recording')).toBeTruthy();
    // A retry asks again.
    await tap('Start recording');
    expect(mockRec.start).toHaveBeenCalledTimes(2);
  });

  it('unmounting while recording stops the recorder and deletes the cache file', async () => {
    const view = await renderPanel();
    await tap('Start recording');
    await view.unmount();
    await act(async () => {});
    expect(mockRec.stop).toHaveBeenCalledTimes(1);
    expect(discardRecording).toHaveBeenCalledWith(CACHE);
  });
});
