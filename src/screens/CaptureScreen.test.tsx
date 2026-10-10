import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, AlertButton } from 'react-native';
import { BUILT_IN_JOURNALS } from '../utils/journals';
import { CaptureScreen } from './CaptureScreen';

const LIFE_TIPS = [
  'Start anywhere',
  'Say it as it comes',
  'Note how you felt',
  'Keep it short or long',
];

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));
jest.mock('../components/Waveform', () => ({ Waveform: () => null }));
const mockDiscard = jest.fn();
jest.mock('../services/dreamStorage', () => ({
  discardRecording: (uri: string) => mockDiscard(uri),
}));

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

describe('CaptureScreen Type instead', () => {
  const tapTypeInstead = async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Type instead' }));
    await act(async () => {});
  };
  const confirmButtons = () =>
    (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
  const confirm = async () => {
    await act(async () => {
      confirmButtons()
        .find((b) => b.text === 'Type instead')
        ?.onPress?.();
    });
  };
  const setupTyping = async () => {
    const onTypeInstead = jest.fn();
    const view = await render(
      <CaptureScreen onRecorded={jest.fn()} onTypeInstead={onTypeInstead} />,
    );
    await fireEvent.press(screen.getByLabelText('Tap to talk'));
    await act(async () => {});
    mockRec.isRecording = true;
    await view.rerender(<CaptureScreen onRecorded={jest.fn()} onTypeInstead={onTypeInstead} />);
    return onTypeInstead;
  };

  it('asks first, and Keep recording changes nothing', async () => {
    const onTypeInstead = await setupTyping();
    await tapTypeInstead();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Type instead?',
      'Your recording will be deleted. The text so far is kept.',
      expect.any(Array),
    );
    const keep = confirmButtons().find((b) => b.text === 'Keep recording');
    expect(keep?.style).toBe('cancel');
    expect(keep?.onPress).toBeUndefined();
    expect(mockRec.stop).not.toHaveBeenCalled();
    expect(mockTx.stop).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
    expect(onTypeInstead).not.toHaveBeenCalled();
    expect(screen.getByText(/^Listening ·/)).toBeTruthy();
  });

  it('stops text, stops the recorder, discards the cache file, then hands off the text', async () => {
    const onTypeInstead = await setupTyping();
    mockTx.stop.mockImplementation(() => {
      mockCalls.push('transcription.stop');
      return Promise.resolve('I was flying');
    });
    mockRec.stop.mockImplementation(() => {
      mockCalls.push('recorder.stop');
      return Promise.resolve(recording);
    });
    mockDiscard.mockImplementation(() => void mockCalls.push('discard'));
    onTypeInstead.mockImplementation(() => void mockCalls.push('onTypeInstead'));
    await tapTypeInstead();
    await confirm();
    expect(mockCalls).toEqual(['transcription.stop', 'recorder.stop', 'discard', 'onTypeInstead']);
    expect(mockDiscard).toHaveBeenCalledWith(recording.uri);
    expect(onTypeInstead).toHaveBeenCalledWith('I was flying');
  });

  it('passes an empty string when live text is unsupported or empty', async () => {
    const onTypeInstead = await setupTyping();
    mockTx.stop.mockResolvedValue(undefined);
    await tapTypeInstead();
    await confirm();
    expect(onTypeInstead).toHaveBeenCalledWith('');
  });

  it('ignores a failed delete', async () => {
    const onTypeInstead = await setupTyping();
    mockDiscard.mockImplementation(() => {
      throw new Error('nope');
    });
    await tapTypeInstead();
    await confirm();
    expect(onTypeInstead).toHaveBeenCalledWith('');
  });

  it('discards nothing, does not leave and shows the failure when the recorder will not stop', async () => {
    const onTypeInstead = await setupTyping();
    mockRec.stop.mockRejectedValue(new Error('boom'));
    await tapTypeInstead();
    await confirm();
    expect(mockDiscard).not.toHaveBeenCalled();
    expect(onTypeInstead).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith('Could not finish recording', 'Please try again.');
    expect(screen.getByRole('button', { name: 'Save dream' })).toBeTruthy();
    expect(screen.getByText(/^Listening ·/)).toBeTruthy();
  });

  it('is guarded against a double confirm', async () => {
    let release: (r: typeof recording) => void = () => {};
    mockRec.stop.mockReturnValue(new Promise((r) => (release = r)));
    const onTypeInstead = await setupTyping();
    await tapTypeInstead();
    const button = confirmButtons().find((b) => b.text === 'Type instead');
    await act(async () => {
      button?.onPress?.();
      button?.onPress?.();
    });
    await act(async () => release(recording));
    expect(mockRec.stop).toHaveBeenCalledTimes(1);
    expect(mockDiscard).toHaveBeenCalledTimes(1);
    expect(onTypeInstead).toHaveBeenCalledTimes(1);
  });

  it('works while paused', async () => {
    mockTx.stop.mockResolvedValue('so far');
    const onTypeInstead = await setupTyping();
    await tapPause();
    await advance(400);
    await tapTypeInstead();
    await confirm();
    expect(mockDiscard).toHaveBeenCalledWith(recording.uri);
    expect(onTypeInstead).toHaveBeenCalledWith('so far');
  });

  it('leaves the normal Save dream path alone', async () => {
    const { onRecorded } = await setup();
    await fireEvent.press(screen.getByText('Save dream'));
    await act(async () => {});
    expect(onRecorded).toHaveBeenCalledWith(recording, '');
    expect(mockDiscard).not.toHaveBeenCalled();
  });
});

describe('CaptureScreen for the Life journal', () => {
  const LIFE = BUILT_IN_JOURNALS[1];

  it('shows the Life headline and tips, with no No dream pill and no dream wording', async () => {
    await render(<CaptureScreen onRecorded={jest.fn()} onNoDream={jest.fn()} journal={LIFE} />);
    expect(screen.getByText('What happened today?')).toBeTruthy();
    for (const tip of LIFE_TIPS) expect(screen.getByText(tip)).toBeTruthy();
    expect(screen.queryByText('No dream')).toBeNull();
    expect(screen.getByText('Write instead')).toBeTruthy();
    expect(screen.queryByText(/dream/i)).toBeNull();
  });

  it('keeps the Dreams wording and the No dream pill by default', async () => {
    const onNoDream = jest.fn();
    await render(<CaptureScreen onRecorded={jest.fn()} onNoDream={onNoDream} />);
    expect(screen.getByText('What happened in my dream?')).toBeTruthy();
    await fireEvent.press(screen.getByText('No dream'));
    expect(onNoDream).toHaveBeenCalled();
  });

  it('labels the save button "Save entry" while listening', async () => {
    await render(<CaptureScreen onRecorded={jest.fn()} journal={LIFE} />);
    await fireEvent.press(screen.getByLabelText('Tap to talk'));
    await act(async () => {});
    expect(screen.getByText('Save entry')).toBeTruthy();
    expect(screen.queryByText('Save dream')).toBeNull();
    expect(screen.queryByText(/dream/i)).toBeNull();
  });

  it('uses the Life microphone message when permission is refused', async () => {
    mockRec.start.mockResolvedValue(false);
    await render(<CaptureScreen onRecorded={jest.fn()} journal={LIFE} />);
    await fireEvent.press(screen.getByLabelText('Tap to talk'));
    await act(async () => {});
    expect(Alert.alert).toHaveBeenCalledWith(
      'Microphone access needed',
      'Lucid needs the microphone to record your entry. You can allow it in Settings.',
    );
  });

  it('keeps the Dreams microphone message by default', async () => {
    mockRec.start.mockResolvedValue(false);
    await render(<CaptureScreen onRecorded={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Tap to talk'));
    await act(async () => {});
    expect(Alert.alert).toHaveBeenCalledWith(
      'Microphone access needed',
      'Lucid needs the microphone to record your dream. You can allow it in Settings.',
    );
  });
});
