import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CaptureScreen } from './CaptureScreen';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));
jest.mock('../components/Waveform', () => ({ Waveform: () => null }));

const mockCalls: string[] = [];
const mockRec = {
  isRecording: false,
  start: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  stop: jest.fn(),
};
const mockTx = {
  start: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  stop: jest.fn(),
};

jest.mock('../hooks/useDreamRecorder', () => ({
  useDreamRecorder: () => ({ ...mockRec, durationMs: 0, level: 0 }),
}));
jest.mock('../hooks/useLiveTranscription', () => ({
  useLiveTranscription: () => ({ ...mockTx, transcript: '', error: null, paused: false }),
}));

const recording = { uri: 'file:///cache/r.m4a', durationMs: 5000 };
const onRecordedStub = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockRec.isRecording = false;
  mockRec.start.mockResolvedValue(true);
  mockRec.pause.mockImplementation(() => mockCalls.push('recorder.pause'));
  mockRec.resume.mockImplementation(() => mockCalls.push('recorder.resume'));
  mockRec.stop.mockResolvedValue(recording);
  mockTx.start.mockResolvedValue(undefined);
  mockTx.pause.mockImplementation(() => mockCalls.push('transcription.pause'));
  mockTx.resume.mockImplementation(() => {
    mockCalls.push('transcription.resume');
    return Promise.resolve(true);
  });
  mockTx.stop.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

async function setup() {
  const onRecorded = jest.fn();
  const view = await render(<CaptureScreen onRecorded={onRecorded} />);
  await fireEvent.press(screen.getByLabelText('Tap to talk'));
  await act(async () => {});
  // The recorder reports that it is recording once started.
  mockRec.isRecording = true;
  await view.rerender(<CaptureScreen onRecorded={onRecorded} />);
  return { view, onRecorded };
}

/** Simulates the polled isRecording value changing, then re-renders the screen. */
async function setRecording(view: Awaited<ReturnType<typeof setup>>['view'], value: boolean) {
  mockRec.isRecording = value;
  await view.rerender(<CaptureScreen onRecorded={onRecordedStub} />);
}

// RNTL's fireEvent awaits an async onPress; call the handler directly when its promise is held
// open on purpose.
const pressWithoutWaiting = async (el: ReturnType<typeof screen.getByLabelText>) => {
  // Pressable's accessibility click handler runs the same onPress.
  const onClick = el.props.onClick as () => void;
  await act(async () => {
    onClick();
  });
};

const tapPause = async () => {
  await fireEvent.press(screen.getByLabelText('Pause'));
  await act(async () => {});
};
const tapResume = async () => {
  await fireEvent.press(screen.getByLabelText('Resume'));
  await act(async () => {});
};

describe('CaptureScreen pause and resume', () => {
  it('pauses the recorder first, then recognition, and shows Paused with Resume', async () => {
    await setup();
    await tapPause();
    expect(mockCalls).toEqual(['recorder.pause', 'transcription.pause']);
    expect(screen.getByText(/^Paused ·/)).toBeTruthy();
    expect(screen.getByLabelText('Resume')).toBeTruthy();
  });

  it('resumes the recorder first, then recognition', async () => {
    await setup();
    await tapPause();
    mockCalls.length = 0;
    await advance(400);
    await tapResume();
    expect(mockCalls).toEqual(['recorder.resume', 'transcription.resume']);
    expect(screen.getByText(/^Listening ·/)).toBeTruthy();
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });

  it('does not pause recognition or change the UI when the recorder pause throws', async () => {
    await setup();
    mockRec.pause.mockImplementation(() => {
      throw new Error('boom');
    });
    await tapPause();
    expect(mockTx.pause).not.toHaveBeenCalled();
    expect(screen.getByText(/^Listening ·/)).toBeTruthy();
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });

  it('stays paused and leaves recognition alone when the recorder resume throws', async () => {
    await setup();
    await tapPause();
    await advance(400);
    mockRec.resume.mockImplementation(() => {
      throw new Error('boom');
    });
    await tapResume();
    expect(mockTx.resume).not.toHaveBeenCalled();
    expect(screen.getByText(/^Paused ·/)).toBeTruthy();
    expect(screen.getByLabelText('Resume')).toBeTruthy();
  });

  it('shows resumed with no alert when live text fails to resume', async () => {
    await setup();
    await tapPause();
    await advance(400);
    mockTx.resume.mockResolvedValue(false);
    await tapResume();
    expect(screen.getByText(/^Listening ·/)).toBeTruthy();
    expect(mockRec.pause).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('ignores a tap inside the 300 ms cooldown', async () => {
    await setup();
    await tapPause();
    await advance(100);
    await tapResume();
    expect(mockRec.resume).not.toHaveBeenCalled();
    expect(screen.getByText(/^Paused ·/)).toBeTruthy();
    await advance(250);
    await tapResume();
    expect(mockRec.resume).toHaveBeenCalledTimes(1);
  });

  it('ignores taps while saving', async () => {
    let release: (r: typeof recording) => void = () => {};
    mockRec.stop.mockReturnValue(new Promise((r) => (release = r)));
    await setup();
    await pressWithoutWaiting(screen.getByRole('button', { name: 'Save dream' }));
    await advance(400);
    await fireEvent.press(screen.getByLabelText('Pause'));
    expect(mockRec.pause).not.toHaveBeenCalled();
    await act(async () => release(recording));
  });
});

describe('CaptureScreen reconcile', () => {
  it('re-pauses only the recorder once if it is still recording 500 ms after a pause', async () => {
    await setup();
    await tapPause();
    mockRec.pause.mockClear();
    mockTx.pause.mockClear();
    await advance(500);
    expect(mockRec.pause).toHaveBeenCalledTimes(1);
    expect(mockTx.pause).not.toHaveBeenCalled();
  });

  it('does nothing extra if the recorder stops recording within 100 ms of the tap', async () => {
    const { view } = await setup();
    await tapPause();
    mockRec.pause.mockClear();
    await advance(100);
    await setRecording(view, false);
    await advance(1000);
    expect(mockRec.pause).not.toHaveBeenCalled();
    expect(mockTx.pause).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 re-pauses and follows the recorder by resuming', async () => {
    const { view } = await setup();
    await tapPause();
    mockRec.pause.mockClear();
    for (let i = 0; i < 3; i++) {
      await advance(500);
      // The OS flips the recorder off and on again, which restarts the debounce.
      await setRecording(view, false);
      await setRecording(view, true);
    }
    expect(mockRec.pause).toHaveBeenCalledTimes(3);
    expect(mockRec.resume).not.toHaveBeenCalled();
    await advance(500);
    expect(mockRec.pause).toHaveBeenCalledTimes(3);
    expect(mockRec.resume).toHaveBeenCalledTimes(1);
    expect(mockTx.resume).toHaveBeenCalledTimes(1);
    expect(mockTx.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/^Listening ·/)).toBeTruthy();
  });

  it('clears the timer on unmount', async () => {
    const { view } = await setup();
    await tapPause();
    mockRec.pause.mockClear();
    await view.unmount();
    await advance(1000);
    expect(mockRec.pause).not.toHaveBeenCalled();
  });

  it('clears the timer when Save is pressed', async () => {
    let release: (r: typeof recording) => void = () => {};
    mockRec.stop.mockReturnValue(new Promise((r) => (release = r)));
    await setup();
    await tapPause();
    mockRec.pause.mockClear();
    await pressWithoutWaiting(screen.getByRole('button', { name: 'Save dream' }));
    await advance(1000);
    expect(mockRec.pause).not.toHaveBeenCalled();
    await act(async () => release(recording));
  });
});

describe('CaptureScreen reconcile stay-true', () => {
  it('keeps re-pausing a recorder that stays recording, then follows it by resuming', async () => {
    await setup();
    await tapPause(); // the user's own pause call; isRecording stays true and pause is a no-op
    expect(mockRec.pause).toHaveBeenCalledTimes(1);
    mockRec.pause.mockClear();
    await advance(500);
    expect(mockRec.pause).toHaveBeenCalledTimes(1);
    await advance(500);
    expect(mockRec.pause).toHaveBeenCalledTimes(2);
    await advance(500);
    expect(mockRec.pause).toHaveBeenCalledTimes(3);
    expect(mockRec.resume).not.toHaveBeenCalled();
    expect(screen.getByText(/^Paused ·/)).toBeTruthy();
    await advance(500);
    expect(mockRec.pause).toHaveBeenCalledTimes(3);
    expect(mockRec.resume).toHaveBeenCalledTimes(1);
    expect(mockTx.resume).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/^Listening ·/)).toBeTruthy();
    expect(screen.queryByText(/^Paused ·/)).toBeNull();
    await advance(2000);
    expect(mockRec.pause).toHaveBeenCalledTimes(3);
    expect(mockRec.resume).toHaveBeenCalledTimes(1);
  });

  it('makes no further pause calls after a manual resume following one re-pause', async () => {
    await setup();
    await tapPause();
    mockRec.pause.mockClear();
    await advance(500);
    expect(mockRec.pause).toHaveBeenCalledTimes(1);
    await tapResume();
    mockRec.pause.mockClear();
    await advance(2000);
    expect(mockRec.pause).not.toHaveBeenCalled();
    expect(screen.getByText(/^Listening ·/)).toBeTruthy();
  });

  it('makes no reconcile pause calls when the recorder is not recording after a pause', async () => {
    const { view } = await setup();
    await tapPause();
    await setRecording(view, false);
    mockRec.pause.mockClear();
    await advance(2000);
    expect(mockRec.pause).not.toHaveBeenCalled();
    expect(screen.getByText(/^Paused ·/)).toBeTruthy();
  });

  it('does nothing and warns about nothing when unmounted mid-wait', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { view } = await setup();
    await tapPause();
    mockRec.pause.mockClear();
    await advance(300);
    await view.unmount();
    await advance(3000);
    expect(mockRec.pause).not.toHaveBeenCalled();
    expect(mockRec.resume).not.toHaveBeenCalled();
    expect(mockTx.resume).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('makes no calls while a Save is pending or after it finishes', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let release: (r: typeof recording) => void = () => {};
    mockRec.stop.mockReturnValue(new Promise((r) => (release = r)));
    await setup();
    await tapPause();
    mockRec.pause.mockClear();
    await advance(300);
    await pressWithoutWaiting(screen.getByRole('button', { name: 'Save dream' }));
    await advance(3000);
    await act(async () => release(recording));
    await advance(3000);
    expect(mockRec.pause).not.toHaveBeenCalled();
    expect(mockRec.resume).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps retrying and reaches the cap when the re-pause throws', async () => {
    await setup();
    await tapPause();
    mockRec.pause.mockClear();
    mockRec.pause.mockImplementation(() => {
      throw new Error('boom');
    });
    await advance(500);
    await advance(500);
    await advance(500);
    expect(mockRec.pause).toHaveBeenCalledTimes(3);
    expect(mockRec.resume).not.toHaveBeenCalled();
    await advance(500);
    expect(mockRec.pause).toHaveBeenCalledTimes(3);
    expect(mockRec.resume).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/^Listening ·/)).toBeTruthy();
  });
});

describe('CaptureScreen finish while paused', () => {
  it('stops both, hands off the recording, and blocks the toggle afterwards', async () => {
    const { onRecorded } = await setup();
    await tapPause();
    await advance(400);
    await fireEvent.press(screen.getByText('Save dream'));
    await act(async () => {});
    expect(mockRec.stop).toHaveBeenCalledTimes(1);
    expect(mockTx.stop).toHaveBeenCalledTimes(1);
    expect(onRecorded).toHaveBeenCalledWith(recording, '');
    await advance(400);
    await fireEvent.press(screen.getByLabelText('Resume'));
    expect(mockRec.resume).not.toHaveBeenCalled();
  });

  it('re-enables the toggle when finishing fails', async () => {
    const { onRecorded } = await setup();
    await tapPause();
    await advance(400);
    mockRec.stop.mockResolvedValue(null);
    await fireEvent.press(screen.getByText('Save dream'));
    await act(async () => {});
    expect(onRecorded).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Could not finish recording', 'Please try again.');
    await advance(400);
    await tapResume();
    expect(mockRec.resume).toHaveBeenCalledTimes(1);
  });
});

describe('CaptureScreen start', () => {
  it('ignores a second start while one is in flight', async () => {
    let grant: (v: boolean) => void = () => {};
    mockRec.start.mockReturnValue(new Promise((r) => (grant = r)));
    await render(<CaptureScreen onRecorded={jest.fn()} />);
    await pressWithoutWaiting(screen.getByLabelText('Tap to talk'));
    await pressWithoutWaiting(screen.getByLabelText('Tap to talk'));
    expect(mockRec.start).toHaveBeenCalledTimes(1);
    await act(async () => grant(true));
  });
});

describe('CaptureScreen No dream', () => {
  it('calls onNoDream when No dream is tapped, without starting a recording', async () => {
    const onNoDream = jest.fn();
    await render(<CaptureScreen onRecorded={jest.fn()} onNoDream={onNoDream} />);
    await fireEvent.press(screen.getByText('No dream'));
    expect(onNoDream).toHaveBeenCalledTimes(1);
    expect(mockRec.start).not.toHaveBeenCalled();
  });

  it('does nothing when no onNoDream is given', async () => {
    await render(<CaptureScreen onRecorded={jest.fn()} />);
    await fireEvent.press(screen.getByText('No dream'));
    expect(mockRec.start).not.toHaveBeenCalled();
  });
});

describe('CaptureScreen hand-off text', () => {
  const finishWith = async (text: string | undefined) => {
    mockTx.stop.mockResolvedValue(text);
    const { onRecorded } = await setup();
    await fireEvent.press(screen.getByText('Save dream'));
    await act(async () => {});
    return onRecorded;
  };

  it('passes the final live transcript from stop() to onRecorded', async () => {
    const onRecorded = await finishWith('I was flying over the sea');
    expect(onRecorded).toHaveBeenCalledWith(recording, 'I was flying over the sea');
  });

  it('passes an empty string when live text is empty', async () => {
    const onRecorded = await finishWith('');
    expect(onRecorded).toHaveBeenCalledWith(recording, '');
  });

  it('passes an empty string when live text is unsupported (stop gives nothing)', async () => {
    const onRecorded = await finishWith(undefined);
    expect(onRecorded).toHaveBeenCalledWith(recording, '');
  });
});

describe('CaptureScreen Write instead', () => {
  it('calls onWrite without touching the recorder, permission or live transcription', async () => {
    const onWrite = jest.fn();
    await render(<CaptureScreen onRecorded={jest.fn()} onWrite={onWrite} />);
    await fireEvent.press(screen.getByText('Write instead'));
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(mockRec.start).not.toHaveBeenCalled();
    expect(mockTx.start).not.toHaveBeenCalled();
    expect(mockRec.stop).not.toHaveBeenCalled();
    expect(mockTx.stop).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does nothing when no onWrite is given', async () => {
    await render(<CaptureScreen onRecorded={jest.fn()} />);
    await fireEvent.press(screen.getByText('Write instead'));
    expect(mockRec.start).not.toHaveBeenCalled();
    expect(mockTx.start).not.toHaveBeenCalled();
  });
});
