import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Alert, AlertButton, BackHandler, Keyboard, StyleSheet, TextInput } from 'react-native';
import { entryHasEdits, useEntrySession } from '../hooks/useEntrySession';
import { saveDream } from '../services/dreamStorage';
import { discardRecording } from '../services/recordingFiles';
import { shareRecording } from '../services/shareRecording';
import { createFakeTranscription, FakeTranscription } from '../test/fakeTranscription';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { bodyText } from '../test/bodyText';
import { colors } from '../theme';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS } from '../utils/journals';
import { AddEntryWithVoice } from './AddEntryWithVoice';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }),
}));

jest.mock('../services/recordingFiles', () => ({ discardRecording: jest.fn() }));

jest.mock('../services/dreamStorage', () => ({
  saveDream: jest.fn(),
  recordingUri: (r: { fileName: string }) => `file:///document/dreams/${r.fileName}`,
  isIndexUnreadableError: () => false,
}));

jest.mock('../services/shareRecording', () => ({
  ...jest.requireActual('../services/shareRecording'),
  shareRecording: jest.fn(),
}));

const mockRec = {
  start: jest.fn(),
  stop: jest.fn(),
  level: 0,
  durationMs: 0,
};
jest.mock('../hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    ...mockRec,
    pause: jest.fn(),
    resume: jest.fn(),
    isRecording: true,
  }),
}));
const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
}));

const CACHE = 'file:///cache/r1.m4a';
const CACHE2 = 'file:///cache/r2.m4a';
const CACHE3 = 'file:///cache/r3.m4a';
const [DREAMS] = BUILT_IN_JOURNALS;
const events = {
  onRecordingChange: jest.fn(),
  onRecordingDiscarded: jest.fn(),
  onBack: jest.fn(),
  onSaved: jest.fn(),
  onDelete: jest.fn(),
};
const leaveRef: { current: (() => void) | null } = { current: null };
let sessionApi: ReturnType<typeof useEntrySession> | null = null;
let fakeT: FakeTranscription | undefined;

const stored: Dream = {
  id: '7',
  createdAt: '2026-10-01T08:00:00.000Z',
  durationMs: 12_000,
  audioFileName: '7.m4a',
  title: 'Old title',
  tags: [],
  transcript: 'old text',
  waveform: [0.2, 0.6, 0.9],
};

function Harness({
  open,
  knownTags,
}: {
  open?: { dream: Dream; as: 'draft' | 'edit' };
  knownTags?: string[];
}) {
  const entry = useEntrySession(BUILT_IN_JOURNALS);
  const { session } = entry;
  // The mic and the check read the latest session through this.
  useEffect(() => {
    sessionApi = entry;
  });
  useEffect(() => {
    if (open?.as === 'edit') entry.openEntry(open.dream);
    else if (open) entry.openDraft(open.dream);
    else entry.startNew('dreams');
    // Starts the session once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!session) return null;
  return (
    <AddEntryWithVoice
      journal={DREAMS}
      title={session.title}
      onTitleChange={entry.setTitle}
      body={session.body}
      onBodyChange={entry.setBody}
      bodyBaseFrom={session.materializedFrom}
      knownTags={knownTags}
      date="Sunday, October 6"
      entryCreatedAt={session.createdAt}
      saving={entry.saving}
      onSave={() => void entry.save('saved').then((ok) => ok && events.onSaved())}
      onBack={events.onBack}
      recordings={session.recordings}
      onRecorded={entry.attachRecording}
      onRemoveRecording={entry.removeRecording}
      onRestoreRecording={entry.restoreRecording}
      onRecordingChange={events.onRecordingChange}
      leaveRef={leaveRef}
      onRecordingDiscarded={events.onRecordingDiscarded}
      transcription={fakeT}
    />
  );
}

const renderPage = async (props: Parameters<typeof Harness>[0] = {}) => {
  const view = await render(<Harness {...props} />);
  await act(async () => {});
  return view;
};
const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
const buttons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
const openPanel = async () => {
  await fireEvent.press(screen.getByLabelText('Record voice note'));
  await act(async () => {});
};
// Opens the panel (idle) and taps its red button.
const startRecording = async () => {
  await openPanel();
  await fireEvent.press(screen.getByLabelText('Start recording'));
  await act(async () => {});
};
const stopRecording = async () => {
  await fireEvent.press(screen.getByLabelText('Stop recording'));
  await act(async () => {});
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRec.level = 0;
  mockRec.durationMs = 0;
  mockRec.start.mockResolvedValue(true);
  mockRec.stop.mockResolvedValue({ uri: CACHE, durationMs: 3000 });
  leaveRef.current = null;
  sessionApi = null;
  fakeT = undefined;
  jest.mocked(saveDream).mockResolvedValue({ id: '1', createdAt: 'c' } as Dream);
  jest.mocked(shareRecording).mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('recording on the page', () => {
  it('starts from the mic, shows the recording state and disables mic and check', async () => {
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'A title');
    expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(
      false,
    );
    await startRecording();
    expect(mockRec.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByLabelText('Stop recording')).toBeTruthy();
    expect(screen.queryByLabelText('Record voice note')).toBeNull();
    expect(screen.getByLabelText('Save dream').props.accessibilityState.disabled).toBe(true);
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(true);
  });

  it('shows the elapsed time from the recorder', async () => {
    const view = await renderPage();
    await startRecording();
    mockRec.durationMs = 65_400;
    await view.rerender(<Harness />);
    expect(screen.getByText('1:05')).toBeTruthy();
  });

  it('opens idle: no recorder start, no permission request, a flat waveform and a 0:00 timer', async () => {
    await renderPage();
    await openPanel();
    expect(mockRec.start).not.toHaveBeenCalled();
    expect(screen.getByTestId('entry-recording-panel')).toBeTruthy();
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByTestId('recording-waveform-idle')).toBeTruthy();
    expect(screen.queryByTestId('recording-waveform-live')).toBeNull();
    expect(screen.getByLabelText('Start recording')).toBeTruthy();
    expect(screen.queryByLabelText('Stop recording')).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(true);
  });

  it('the red button starts the recorder (permission asked) and the panel shows the live waveform', async () => {
    await renderPage();
    await openPanel();
    await fireEvent.press(screen.getByLabelText('Start recording'));
    await act(async () => {});
    expect(mockRec.start).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('recording-waveform-live')).toBeTruthy();
    expect(screen.queryByLabelText('Start recording')).toBeNull();
    expect(screen.getByLabelText('Stop recording').props.accessibilityState.disabled).toBe(false);
  });

  it('alerts and returns the panel to idle (still open) when the microphone permission is denied', async () => {
    mockRec.start.mockResolvedValue(false);
    await renderPage();
    await startRecording();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Microphone access needed',
      expect.stringMatching(/microphone/i),
    );
    expect(screen.queryByLabelText('Stop recording')).toBeNull();
    expect(screen.getByTestId('recording-waveform-idle')).toBeTruthy();
    expect(screen.getByLabelText('Start recording').props.accessibilityState.disabled).toBe(false);
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(true);
    // Back from there closes the panel with no confirmation.
    jest.mocked(Alert.alert).mockClear();
    await act(async () => leaveRef.current?.());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.queryByTestId('entry-recording-panel')).toBeNull();
  });

  it('alerts and returns the panel to idle when the recorder cannot start', async () => {
    mockRec.start.mockRejectedValue(new Error('boom'));
    await renderPage();
    await startRecording();
    expect(Alert.alert).toHaveBeenCalledWith('Could not start recording', 'Please try again.');
    expect(screen.queryByLabelText('Stop recording')).toBeNull();
    expect(screen.getByLabelText('Start recording')).toBeTruthy();
  });

  it('a second red tap while the recorder is starting starts nothing twice', async () => {
    let resolve: (v: boolean) => void = () => {};
    mockRec.start.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    await renderPage();
    await openPanel();
    await fireEvent.press(screen.getByLabelText('Start recording'));
    await fireEvent.press(screen.getByLabelText('Start recording'));
    await act(async () => resolve(true));
    expect(mockRec.start).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Stop recording')).toBeTruthy();
  });

  it('stop attaches the recording as a card above the title with a 56-bar waveform of sampled peaks', async () => {
    const view = await renderPage();
    await startRecording();
    // About ten samples a second: quiet, then loud, then quiet.
    for (const level of [0.1, 0.1, 0.9, 0.9, 0.2, 0.2]) {
      mockRec.level = level;
      await view.rerender(<Harness />);
      await advance(100);
    }
    await stopRecording();
    expect(mockRec.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Stop recording')).toBeNull();
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(screen.getByLabelText('Remove recording')).toBeTruthy();
    expect(screen.getAllByTestId('wave-bar')).toHaveLength(56);
    expect(sessionApi?.session?.recordings).toHaveLength(1);
    const audio = sessionApi?.session?.recordings[0];
    expect(audio).toMatchObject({ uri: CACHE, durationMs: 3000, persisted: false, removed: false });
    expect(audio?.waveform).toHaveLength(56);
    expect(Math.max(...(audio?.waveform ?? []))).toBe(0.9);
    expect(Math.min(...(audio?.waveform ?? [1]))).toBeLessThanOrEqual(0.2);
    // The mic stays available after a recording (another can be added).
    expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(
      false,
    );
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps recording and alerts when stop fails', async () => {
    mockRec.stop.mockRejectedValueOnce(new Error('boom'));
    await renderPage();
    await startRecording();
    await stopRecording();
    expect(Alert.alert).toHaveBeenCalledWith('Could not finish recording', 'Please try again.');
    expect(screen.getByLabelText('Stop recording').props.accessibilityState.disabled).toBe(false);
    expect(sessionApi?.session?.recordings).toEqual([]);
  });

  it('saves the recording and its waveform through saveDream', async () => {
    const view = await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Voice');
    await startRecording();
    mockRec.level = 0.5;
    await view.rerender(<Harness />);
    await advance(300);
    await stopRecording();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    const input = jest.mocked(saveDream).mock.calls[0][0];
    expect(input).toMatchObject({
      addRecordings: [{ uri: CACHE, durationMs: 3000 }],
      status: 'saved',
    });
    expect(input.addRecordings?.[0].waveform).toHaveLength(56);
    expect(input).not.toHaveProperty('recordingUri');
    expect(events.onSaved).toHaveBeenCalled();
  });
});

describe('delete menu', () => {
  const openMenu = () => fireEvent.press(screen.getByLabelText('More options'));
  const withDelete = (extra: Record<string, unknown> = {}) => (
    <AddEntryWithVoice
      journal={DREAMS}
      title="t"
      onTitleChange={() => {}}
      body="b"
      onBodyChange={() => {}}
      date="d"
      onSave={() => {}}
      onBack={() => {}}
      onRecorded={() => {}}
      onDelete={events.onDelete}
      {...extra}
    />
  );

  it('is off while the recording panel is open and back after it closes', async () => {
    await render(withDelete());
    await openMenu();
    expect(screen.getByLabelText('Delete dream').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByLabelText('Close menu'));
    await fireEvent.press(screen.getByLabelText('Record voice note'));
    await openMenu();
    expect(screen.getByLabelText('Delete dream').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Delete dream'));
    expect(events.onDelete).not.toHaveBeenCalled();
  });

  it('is off while saving and while the parent says a delete runs', async () => {
    const view = await render(withDelete({ saving: true }));
    await openMenu();
    expect(screen.getByLabelText('Delete dream').props.accessibilityState.disabled).toBe(true);
    await view.rerender(withDelete({ deleteDisabled: true }));
    expect(screen.getByLabelText('Delete dream').props.accessibilityState.disabled).toBe(true);
    await view.rerender(withDelete());
    expect(screen.getByLabelText('Delete dream').props.accessibilityState.disabled).toBe(false);
  });
});

describe('closing the card', () => {
  const recordOne = async () => {
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Voice');
    await startRecording();
    await stopRecording();
  };

  it('hides the card without deleting anything, and the mic works again', async () => {
    await recordOne();
    await fireEvent.press(screen.getByLabelText('Remove recording'));
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(discardRecording).not.toHaveBeenCalled();
    expect(sessionApi?.session?.recordings[0]).toMatchObject({ uri: CACHE, removed: true });
    expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it('a closed recording is not saved; its cache file is deleted only after the save', async () => {
    await recordOne();
    await fireEvent.press(screen.getByLabelText('Remove recording'));
    const order: string[] = [];
    jest.mocked(saveDream).mockImplementation(async () => {
      order.push('save');
      return { id: '1', createdAt: 'c' } as Dream;
    });
    jest.mocked(discardRecording).mockImplementation(() => void order.push('discard'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('addRecordings');
    expect(order).toEqual(['save', 'discard']);
    expect(discardRecording).toHaveBeenCalledWith(CACHE);
  });

  it('leaving with Discard deletes the closed recording cache file (session clear)', async () => {
    await recordOne();
    await fireEvent.press(screen.getByLabelText('Remove recording'));
    expect(discardRecording).not.toHaveBeenCalled();
    await act(async () => sessionApi?.clear());
    expect(discardRecording).toHaveBeenCalledWith(CACHE);
  });
});

describe('leaving while recording', () => {
  it('asks first; Keep recording changes nothing', async () => {
    await renderPage();
    await startRecording();
    await act(async () => leaveRef.current?.());
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard this recording?',
      'Your recording will be deleted.',
      expect.any(Array),
    );
    await act(async () =>
      buttons()
        .find((b) => b.text === 'Keep recording')
        ?.onPress?.(),
    );
    expect(mockRec.stop).not.toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Stop recording')).toBeTruthy();
    expect(events.onRecordingDiscarded).not.toHaveBeenCalled();
  });

  it('Discard stops the recorder, deletes the cache file, clears the recording flag, then carries on leaving', async () => {
    await renderPage();
    await startRecording();
    await act(async () => leaveRef.current?.());
    await act(async () =>
      buttons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(mockRec.stop).toHaveBeenCalledTimes(1);
    expect(discardRecording).toHaveBeenCalledWith(CACHE);
    expect(screen.queryByLabelText('Stop recording')).toBeNull();
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(false);
    expect(events.onRecordingDiscarded).toHaveBeenCalledTimes(1);
    // The recording is not kept on the page.
    expect(sessionApi?.session?.recordings).toEqual([]);
  });

  it('keeps the page when the recorder cannot be stopped, and deletes nothing', async () => {
    await renderPage();
    await startRecording();
    mockRec.stop.mockRejectedValueOnce(new Error('boom'));
    await act(async () => leaveRef.current?.());
    await act(async () =>
      buttons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(Alert.alert).toHaveBeenLastCalledWith('Could not finish recording', 'Please try again.');
    expect(discardRecording).not.toHaveBeenCalled();
    expect(events.onRecordingDiscarded).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Stop recording')).toBeTruthy();
  });

  it('back while the panel is idle closes it with no confirmation and nothing recorded', async () => {
    await renderPage();
    await openPanel();
    await act(async () => leaveRef.current?.());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockRec.start).not.toHaveBeenCalled();
    expect(mockRec.stop).not.toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();
    expect(screen.queryByTestId('entry-recording-panel')).toBeNull();
    expect(screen.getByLabelText('Record voice note')).toBeTruthy();
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(false);
    expect(events.onRecordingDiscarded).not.toHaveBeenCalled();
  });

  it('only registers the back handling while the panel is open', async () => {
    await renderPage();
    expect(leaveRef.current).toBeNull();
    await startRecording();
    expect(leaveRef.current).not.toBeNull();
    await stopRecording();
    expect(leaveRef.current).toBeNull();
  });

  it('stops the recorder and deletes the cache file if the page goes away mid-recording', async () => {
    const view = await renderPage();
    await startRecording();
    await view.unmount();
    await act(async () => {});
    expect(mockRec.stop).toHaveBeenCalled();
    expect(discardRecording).toHaveBeenCalledWith(CACHE);
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(false);
  });
});

describe('a stored recording', () => {
  it.each(['edit', 'draft'] as const)(
    'shows a reopened %s recording in a playable card with a close button, mic on',
    async (as) => {
      await renderPage({ open: { dream: stored, as } });
      expect(screen.getByLabelText('Play recording')).toBeTruthy();
      expect(screen.getAllByTestId('wave-bar')).toHaveLength(3);
      expect(screen.getByLabelText('Remove recording')).toBeTruthy();
      expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(
        false,
      );
    },
  );

  it('closing a stored recording hides the card, deletes nothing and sends removeRecordings on save', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await fireEvent.press(screen.getByLabelText('Remove recording'));
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(discardRecording).not.toHaveBeenCalled();
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(
      false,
    );
    await act(async () => void (await sessionApi?.save('saved')));
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({ id: '7', removeRecordings: ['7.m4a'] }),
    );
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('addRecordings');
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('removeAudio');
  });

  it('restoring a closed stored recording brings the card back and saves without removeRecordings', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await fireEvent.press(screen.getByLabelText('Remove recording'));
    await act(async () => sessionApi?.restoreRecording('stored:7.m4a'));
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    await act(async () => void (await sessionApi?.save('saved')));
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('removeRecordings');
  });

  it('falls back to a plain progress bar for an entry with no waveform', async () => {
    await renderPage({ open: { dream: { ...stored, waveform: undefined }, as: 'edit' } });
    expect(screen.queryAllByTestId('wave-bar')).toHaveLength(0);
    expect(screen.getByTestId('progress-fill')).toBeTruthy();
  });

  it('shows no card for an entry without audio, and the mic is on', async () => {
    await renderPage({ open: { dream: { ...stored, audioFileName: undefined }, as: 'edit' } });
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(
      false,
    );
  });
});

describe('toolbar', () => {
  const body = () => screen.getByLabelText('Entry text');
  const disabled = (label: string) =>
    screen.getByLabelText(label).props.accessibilityState.disabled;
  const typeBody = async (text: string) => {
    await fireEvent.changeText(body(), text);
    await advance(600);
  };
  const press = async (label: string) => {
    await fireEvent.press(screen.getByLabelText(label));
    await act(async () => {});
  };
  const recordOne = async () => {
    await startRecording();
    await stopRecording();
  };

  it('shows the four buttons', async () => {
    await renderPage();
    for (const label of ['Undo', 'Redo', 'Record voice note', 'Add tags'])
      expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('puts the bar after the scrolling fields, so it sits at the bottom, above the keyboard', async () => {
    await renderPage();
    // Structure only: KeyboardAvoidingView (iOS) lifts everything inside it, the bar is its last
    // child. Real keyboard placement is device-only.
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('"Entry text"')).toBeGreaterThan(-1);
    expect(tree.indexOf('"Undo"')).toBeGreaterThan(tree.indexOf('"Entry text"'));
  });

  it('starts with undo and redo disabled', async () => {
    await renderPage();
    expect(disabled('Undo')).toBe(true);
    expect(disabled('Redo')).toBe(true);
  });

  it('undoes and redoes body typing', async () => {
    await renderPage();
    await typeBody('first');
    await typeBody('first second');
    expect(disabled('Undo')).toBe(false);
    await press('Undo');
    expect(bodyText(body())).toBe('first');
    expect(disabled('Redo')).toBe(false);
    await press('Undo');
    expect(bodyText(body())).toBe('');
    expect(disabled('Undo')).toBe(true);
    await press('Redo');
    expect(bodyText(body())).toBe('first');
    await press('Redo');
    expect(bodyText(body())).toBe('first second');
    expect(disabled('Redo')).toBe(true);
  });

  it('typing after an undo clears redo', async () => {
    await renderPage();
    await typeBody('one');
    await press('Undo');
    await fireEvent.changeText(body(), 'other');
    expect(disabled('Redo')).toBe(true);
  });

  it('does not touch the title', async () => {
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'A title');
    await advance(600);
    expect(disabled('Undo')).toBe(true);
  });

  it('undo of closing the card restores it; redo closes it again; nothing is deleted', async () => {
    await renderPage();
    await recordOne();
    await press('Remove recording');
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(disabled('Undo')).toBe(false);
    await press('Undo');
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(sessionApi?.session?.recordings[0]?.removed).toBe(false);
    await press('Redo');
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(sessionApi?.session?.recordings[0]?.removed).toBe(true);
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('a newly recorded note is not on the undo stack', async () => {
    await renderPage();
    await recordOne();
    expect(disabled('Undo')).toBe(true);
  });

  it('undoes in order: type, close the card, undo, undo', async () => {
    await renderPage();
    await recordOne();
    await typeBody('words');
    await press('Remove recording');
    await press('Undo');
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(bodyText(body())).toBe('words');
    await press('Undo');
    expect(bodyText(body())).toBe('');
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(disabled('Undo')).toBe(true);
  });

  it('recording a new note after closing a card keeps the close step; undo restores that card', async () => {
    await renderPage();
    mockRec.stop
      .mockResolvedValueOnce({ uri: CACHE, durationMs: 1000 })
      .mockResolvedValueOnce({ uri: CACHE2, durationMs: 2000 });
    await recordOne();
    await press('Remove recording');
    await recordOne();
    expect(screen.getAllByLabelText('Play recording')).toHaveLength(1);
    expect(disabled('Undo')).toBe(false);
    await press('Undo');
    expect(screen.getAllByLabelText(/^Play voice note \d+ of \d+$/)).toHaveLength(2);
    expect(sessionApi?.session?.recordings.map((r) => r.removed)).toEqual([false, false]);
  });

  it('the toolbar (undo, redo, mic, tags) is hidden while recording', async () => {
    await renderPage();
    await typeBody('words');
    await startRecording();
    for (const label of ['Undo', 'Redo', 'Record voice note', 'Add tags']) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it('a stored recording closed then restored by undo is kept on Done', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await press('Remove recording');
    await press('Undo');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('removeRecordings');
  });

  it('a stored recording closed (or closed, undone and redone) is removed on Done', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await press('Remove recording');
    await press('Undo');
    await press('Redo');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    expect(jest.mocked(saveDream).mock.calls[0][0]).toMatchObject({
      removeRecordings: ['7.m4a'],
    });
  });

  it('locks the toolbar while saving', async () => {
    let finish: (d: Dream) => void = () => {};
    jest.mocked(saveDream).mockReturnValue(new Promise<Dream>((r) => (finish = r)));
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'T');
    await typeBody('text');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    for (const label of ['Undo', 'Redo', 'Record voice note', 'Add tags'])
      expect(disabled(label)).toBe(true);
    await act(async () => finish({ id: '1', createdAt: 'c' } as Dream));
  });

  describe('# button', () => {
    const select = (start: number, end = start) =>
      fireEvent(body(), 'selectionChange', { nativeEvent: { selection: { start, end } } });

    it('shows no tag row or tag input', async () => {
      await renderPage({ open: { dream: { ...stored, tags: ['water'] }, as: 'edit' } });
      expect(screen.queryByPlaceholderText('Add a tag...')).toBeNull();
      expect(screen.queryByLabelText('Remove tag water')).toBeNull();
    });

    it('inserts # at the end of the text when no cursor is known, and focuses the body', async () => {
      const focus = jest.spyOn(TextInput.prototype, 'focus');
      await renderPage();
      await typeBody('hello');
      await press('Add tags');
      expect(bodyText(body())).toBe('hello #');
      expect(sessionApi?.session?.body).toBe('hello #');
      expect(focus).toHaveBeenCalled();
    });

    it('inserts # at the cursor, mid-text, and moves the cursor after it', async () => {
      await renderPage();
      await typeBody('ab cd');
      await select(2);
      await press('Add tags');
      expect(bodyText(body())).toBe('ab # cd');
      expect(body().props.selection).toEqual({ start: 4, end: 4 });
    });

    it('inserts # at the start of an empty body without a space', async () => {
      await renderPage();
      await press('Add tags');
      expect(bodyText(body())).toBe('#');
    });

    it('is its own undo step, apart from the typing before it', async () => {
      await renderPage();
      await typeBody('hello');
      await press('Add tags');
      await press('Undo');
      expect(bodyText(body())).toBe('hello');
      await press('Redo');
      expect(bodyText(body())).toBe('hello #');
    });

    it('is locked while saving', async () => {
      jest.mocked(saveDream).mockReturnValue(new Promise<Dream>(() => {}));
      await renderPage();
      await fireEvent.changeText(screen.getByLabelText('Title'), 'T');
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Save dream'));
      });
      expect(disabled('Add tags')).toBe(true);
    });
  });

  describe('tags in the body', () => {
    it('saves tags derived from the body, with the body kept as typed', async () => {
      await renderPage();
      await fireEvent.changeText(screen.getByLabelText('Title'), 'T');
      await typeBody('Saw #Water and #sky then #water');
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Save dream'));
      });
      expect(saveDream).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            tags: ['water', 'sky'],
            transcript: 'Saw #Water and #sky then #water',
          }),
        }),
      );
    });

    it('opens an entry with its stored tags written into the body as one undo step, not an edit', async () => {
      await renderPage({
        open: { dream: { ...stored, tags: ['water', 'Bad Dream'] }, as: 'edit' },
      });
      expect(bodyText(body())).toBe('old text\n#water #bad-dream');
      expect(entryHasEdits(sessionApi!.session!)).toBe(false);
      expect(disabled('Undo')).toBe(false);
      await press('Undo');
      expect(bodyText(body())).toBe('old text');
      expect(disabled('Undo')).toBe(true);
      await press('Redo');
      expect(bodyText(body())).toBe('old text\n#water #bad-dream');
    });

    it('writes odd old tags in sanitized (v1.2 becomes #v1-2)', async () => {
      await renderPage({ open: { dream: { ...stored, tags: ['v1.2', 'a/b'] }, as: 'draft' } });
      expect(bodyText(body())).toBe('old text\n#v1-2 #a-b');
    });

    it('has no undo step when the body already holds every tag', async () => {
      await renderPage({
        open: { dream: { ...stored, transcript: 'a #water', tags: ['water'] }, as: 'edit' },
      });
      expect(disabled('Undo')).toBe(true);
    });
  });
});

describe('tag suggestions', () => {
  const disabledOf = (label: string) =>
    screen.getByLabelText(label).props.accessibilityState.disabled;
  const body = () => screen.getByLabelText('Entry text');
  const KNOWN = ['dream', 'water', 'waterfall', 'flying'];
  const select = (start: number, end = start) =>
    fireEvent(body(), 'selectionChange', { nativeEvent: { selection: { start, end } } });
  const type = async (text: string, cursor = text.length) => {
    await fireEvent(body(), 'focus');
    await fireEvent.changeText(body(), text);
    await select(cursor);
    await advance(600);
  };
  const press = async (label: string) => {
    await fireEvent.press(screen.getByLabelText(label));
    await act(async () => {});
  };
  const pills = () =>
    screen
      .queryAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((l) => /^Tag #/.test(l ?? ''));
  const dock = () => screen.getByTestId('entry-bottom-dock');

  it('is hidden with no token, and not in the tree', async () => {
    await renderPage({ knownTags: KNOWN });
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    await type('plain words');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    await type('a #wa b', 7); // cursor after the tag's space-separated end: not in a token
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });

  it('sits in the dock directly above the toolbar', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('a #');
    const tree = JSON.stringify(dock().props.children ? screen.toJSON() : null);
    expect(tree.indexOf('"tag-suggestions"')).toBeGreaterThan(-1);
    expect(tree.indexOf('"Undo"')).toBeGreaterThan(tree.indexOf('"tag-suggestions"'));
  });

  it('shows every existing tag (capped) for a bare "#"', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`);
    await renderPage({ knownTags: many });
    await type('#');
    expect(pills()).toEqual(many.slice(0, 8).map((t) => `Tag #${t}`));
  });

  it('filters by prefix then substring; a word nothing matches shows no bar at all', async () => {
    await renderPage({ knownTags: [...KNOWN, 'sea-water'] });
    await type('x #wat');
    expect(pills()).toEqual(['Tag #water', 'Tag #waterfall', 'Tag #sea-water']);
    await type('x #wolf');
    expect(pills()).toEqual([]);
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });

  it('offers an exact existing tag first', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('#water');
    expect(pills()[0]).toBe('Tag #water');
  });

  it('works mid-sentence: the cursor inside a tag in the middle of the text', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('before #fl after', 10);
    expect(pills()).toEqual(['Tag #flying']);
  });

  it('hides for a range selection', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('a #wa');
    expect(screen.queryByTestId('tag-suggestions')).not.toBeNull();
    await select(2, 5);
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });

  it('completes the word on tap: text, cursor and focus, as ONE undo step', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderPage({ knownTags: KNOWN });
    await type('see #wa now', 7);
    await press('Tag #water');
    expect(bodyText(body())).toBe('see #water now');
    expect(sessionApi?.session?.body).toBe('see #water now');
    expect(body().props.selection).toEqual({ start: 11, end: 11 });
    expect(focus).toHaveBeenCalled();
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    await press('Undo');
    expect(bodyText(body())).toBe('see #wa now');
    expect(disabledOf('Undo')).toBe(false); // the typing before is a separate step
    await press('Redo');
    expect(bodyText(body())).toBe('see #water now');
  });

  it('completes at the end of the text, adding one trailing space', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('hi #dr');
    await press('Tag #dream');
    expect(bodyText(body())).toBe('hi #dream ');
    expect(body().props.selection).toEqual({ start: 10, end: 10 });
  });

  it('suggests tags already typed in this entry, with an empty library', async () => {
    await renderPage({ knownTags: [] });
    await type('#dream and more');
    await type('#dream and more #d', 18);
    expect(pills()).toEqual(['Tag #dream']);
    await press('Tag #dream');
    expect(bodyText(body())).toBe('#dream and more #dream ');
  });

  it('does not offer the word being typed itself, and updates on the terminating space', async () => {
    await renderPage({ knownTags: [] });
    await type('#dre');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    // The space ends the tag; the very next "#d" sees it with no pause or selection in between.
    await fireEvent.changeText(body(), '#dre #d');
    await select(7);
    expect(pills()).toEqual(['Tag #dre']);
  });

  it('merges stored and current tags: stored first within a tier, deduped, sanitised', async () => {
    await renderPage({ knownTags: ['dusk', 'bad dream'] });
    await type('#dawn #dusk #adrift #d', 22);
    expect(pills()).toEqual(['Tag #dusk', 'Tag #dawn', 'Tag #bad-dream', 'Tag #adrift']);
  });

  it('the # button shows the bar at once with all existing tags', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('word');
    await press('Add tags');
    expect(bodyText(body())).toBe('word #');
    expect(pills()).toEqual(KNOWN.map((t) => `Tag #${t}`));
  });

  it('is hidden while saving, and the body is not editable', async () => {
    jest.mocked(saveDream).mockReturnValue(new Promise<Dream>(() => {}));
    await renderPage({ knownTags: KNOWN });
    await fireEvent.changeText(screen.getByLabelText('Title'), 'T');
    await type('a #wa');
    expect(screen.queryByTestId('tag-suggestions')).not.toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    expect(body().props.editable).toBe(false);
  });

  it('undo and redo put the cursor at the end of the changed region, within the text', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('abc def');
    await select(3);
    await type('abc XY def', 6);
    await press('Undo');
    expect(bodyText(body())).toBe('abc def');
    expect(body().props.selection).toEqual({ start: 4, end: 4 });
    await press('Redo');
    expect(bodyText(body())).toBe('abc XY def');
    expect(body().props.selection).toEqual({ start: 7, end: 7 });
  });

  it('typing a tag character by character follows the normal typing steps (one step per pause)', async () => {
    await renderPage({ knownTags: KNOWN });
    for (const t of ['#', '#w', '#wa', '#wat']) await fireEvent.changeText(body(), t);
    await advance(600);
    await press('Undo');
    expect(bodyText(body())).toBe('');
  });

  it('shows only while the body has focus: hides on blur, and when the keyboard closes', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('a #wa');
    expect(screen.queryByTestId('tag-suggestions')).not.toBeNull();
    await fireEvent(body(), 'blur');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    await fireEvent(body(), 'focus');
    expect(screen.queryByTestId('tag-suggestions')).not.toBeNull();
  });

  it('a pill tap does not need focus to move: the bar is still there until the tap completes', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('a #wa');
    // No blur happens for a pill press; the press still completes.
    await press('Tag #water');
    expect(bodyText(body())).toBe('a #water ');
  });

  it('offers stored tags in their inline form, deduped, dropping ones that cannot be inline', async () => {
    await renderPage({
      knownTags: ['bad dream', 'v1.2', 'bad-dream', '2024', '', 'x'.repeat(41), 'ok'],
    });
    await type('#');
    expect(pills()).toEqual(['Tag #bad-dream', 'Tag #v1-2', 'Tag #ok']);
    await press('Tag #bad-dream');
    expect(bodyText(body())).toBe('#bad-dream ');
  });

  it('hides when the keyboard hides', async () => {
    const kb = fakeKeyboard();
    await renderPage({ knownTags: KNOWN });
    await type('a #wa');
    expect(screen.queryByTestId('tag-suggestions')).not.toBeNull();
    await kb.emit('keyboardWillHide');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });
});

describe('several recordings on the page', () => {
  const body = () => screen.getByLabelText('Entry text');
  const disabled = (label: string) =>
    screen.getByLabelText(label).props.accessibilityState.disabled;
  const press = async (label: string) => {
    await fireEvent.press(screen.getByLabelText(label));
    await act(async () => {});
  };
  const recordNext = async (uri: string, durationMs: number) => {
    mockRec.stop.mockResolvedValueOnce({ uri, durationMs });
    await startRecording();
    await stopRecording();
  };
  const three: Dream = {
    ...stored,
    audioFileName: undefined,
    waveform: undefined,
    recordings: [
      { fileName: '7.m4a', durationMs: 1000 },
      { fileName: '7-1.m4a', durationMs: 2000 },
      { fileName: '7-2.m4a', durationMs: 3000 },
    ],
  };

  it('a 2nd and 3rd recording each add a card; the mic stays on and nothing is replaced', async () => {
    await renderPage();
    await recordNext(CACHE, 1000);
    expect(screen.getAllByLabelText('Play recording')).toHaveLength(1);
    expect(disabled('Record voice note')).toBe(false);
    await recordNext(CACHE2, 2000);
    await recordNext(CACHE3, 3000);
    expect(screen.getAllByLabelText(/^Play voice note \d of 3$/)).toHaveLength(3);
    expect(sessionApi?.session?.recordings.map((r) => r.uri)).toEqual([CACHE, CACHE2, CACHE3]);
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('cards are labelled by place, and the mic stays enabled after a recording', async () => {
    await renderPage();
    await recordNext(CACHE, 1000);
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(disabled('Record voice note')).toBe(false);
    await recordNext(CACHE2, 2000);
    expect(screen.getByLabelText('Play voice note 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Play voice note 2 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Remove voice note 2 of 2')).toBeTruthy();
    expect(disabled('Record voice note')).toBe(false);
  });

  it('cards cannot play while recording, and can again after stop', async () => {
    await renderPage();
    await recordNext(CACHE, 1000);
    await startRecording();
    expect(disabled('Play recording')).toBe(true);
    mockPlayer.play.mockClear();
    await fireEvent.press(screen.getByLabelText('Play recording'));
    await act(async () => {});
    expect(mockPlayer.play).not.toHaveBeenCalled();
    await stopRecording();
    expect(disabled('Play voice note 1 of 2')).toBe(false);
  });

  it('starting a recording pauses a playing card', async () => {
    await renderPage();
    await recordNext(CACHE, 1000);
    await press('Play recording');
    mockPlayer.pause.mockClear();
    await startRecording();
    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  it('closing one specific card and undoing it brings back that card only', async () => {
    await renderPage();
    await recordNext(CACHE, 1000);
    await recordNext(CACHE2, 2000);
    await recordNext(CACHE3, 3000);
    await fireEvent.press(screen.getByLabelText('Remove voice note 2 of 3'));
    await act(async () => {});
    expect(screen.getAllByLabelText(/^Play voice note \d of 2$/)).toHaveLength(2);
    expect(sessionApi?.session?.recordings.map((r) => r.removed)).toEqual([false, true, false]);
    expect(discardRecording).not.toHaveBeenCalled();
    await press('Undo');
    expect(sessionApi?.session?.recordings.map((r) => r.removed)).toEqual([false, false, false]);
    expect(screen.getAllByLabelText(/^Play voice note \d of 3$/)).toHaveLength(3);
    await press('Redo');
    expect(sessionApi?.session?.recordings.map((r) => r.removed)).toEqual([false, true, false]);
  });

  it('shows the notes in a carousel above the date and title: dots only with several, no seek bar', async () => {
    await renderPage();
    await recordNext(CACHE, 1000);
    const hidden = { includeHiddenElements: true };
    expect(screen.getByTestId('entry-notes')).toContainElement(
      screen.getByTestId('voice-note-carousel'),
    );
    expect(screen.queryByTestId('voice-note-dots', hidden)).toBeNull();
    await recordNext(CACHE2, 2000);
    await recordNext(CACHE3, 3000);
    expect(screen.getAllByTestId('voice-note-dot', hidden)).toHaveLength(3);
    expect(screen.queryByTestId('seek-bar')).toBeNull();
    expect(screen.getByLabelText('Open voice note 2 of 3')).toBeTruthy();
  });

  it('tapping a card does nothing yet (no play, no removal)', async () => {
    await renderPage();
    await recordNext(CACHE, 1000);
    mockPlayer.play.mockClear();
    await fireEvent.press(screen.getByLabelText('Open recording'));
    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(sessionApi?.session?.recordings[0]?.removed).toBe(false);
  });

  it('closing a card updates the dots and undo restores it', async () => {
    await renderPage();
    await recordNext(CACHE, 1000);
    await recordNext(CACHE2, 2000);
    await recordNext(CACHE3, 3000);
    const hidden = { includeHiddenElements: true };
    await fireEvent.press(screen.getByLabelText('Remove voice note 3 of 3'));
    expect(screen.getAllByTestId('voice-note-dot', hidden)).toHaveLength(2);
    await press('Undo');
    expect(screen.getAllByTestId('voice-note-dot', hidden)).toHaveLength(3);
    expect(screen.getByLabelText('Play voice note 3 of 3')).toBeTruthy();
  });

  it('an entry with 3 stored recordings shows 3 cards; closing one saves with only that name', async () => {
    await renderPage({ open: { dream: three, as: 'edit' } });
    expect(screen.getAllByLabelText(/^Play voice note \d+ of \d+$/)).toHaveLength(3);
    await fireEvent.press(screen.getByLabelText('Remove voice note 2 of 3'));
    await act(async () => {});
    expect(screen.getAllByLabelText(/^Play voice note \d of 2$/)).toHaveLength(2);
    expect(entryHasEdits(sessionApi!.session!)).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    const input = jest.mocked(saveDream).mock.calls[0][0];
    expect(input).toMatchObject({ id: '7', removeRecordings: ['7-1.m4a'] });
    expect(input).not.toHaveProperty('addRecordings');
    expect(input).not.toHaveProperty('removeAudio');
  });

  it('saves a mix of a closed stored recording and a new one in one call', async () => {
    await renderPage({ open: { dream: three, as: 'edit' } });
    await recordNext(CACHE, 4000);
    await fireEvent.press(screen.getAllByLabelText(/^Remove voice note \d+ of \d+$/)[0]);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    const input = jest.mocked(saveDream).mock.calls[0][0];
    expect(input.removeRecordings).toEqual(['7.m4a']);
    expect(input.addRecordings).toEqual([
      expect.objectContaining({ uri: CACHE, durationMs: 4000 }),
    ]);
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('typing and a close share one undo stack, newest first', async () => {
    await renderPage();
    await recordNext(CACHE, 1000);
    await fireEvent.changeText(body(), 'words');
    await advance(600);
    await fireEvent.press(screen.getByLabelText('Remove recording'));
    await act(async () => {});
    await press('Undo');
    expect(sessionApi?.session?.recordings[0].removed).toBe(false);
    expect(bodyText(body())).toBe('words');
  });
  describe('the expanded view over several notes', () => {
    const HIDDEN = { includeHiddenElements: true };
    const swipeSheet = async (page: number) => {
      const w = 300;
      await fireEvent(screen.getByTestId('voice-note-pager'), 'layout', {
        nativeEvent: { layout: { width: w, height: 600 } },
      });
      await fireEvent(screen.getByTestId('voice-note-pager'), 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: page * w, y: 0 } },
      });
      await act(async () => {});
    };
    const cardDots = () =>
      screen
        .getAllByTestId('voice-note-dot', HIDDEN)
        .map((d) => StyleSheet.flatten(d.props.style).backgroundColor === colors.accent);
    const setUp = async () => {
      await renderPage();
      await recordNext(CACHE, 1000);
      await recordNext(CACHE2, 2000);
      await recordNext(CACHE3, 3000);
    };
    const sheet = () => screen.queryByTestId('voice-note-sheet');
    const ids = () => sessionApi?.session?.recordings.map((r) => r.id) ?? [];

    it('opens on the tapped card, a pager over all notes with one live player', async () => {
      await setUp();
      await press('Open voice note 2 of 3');
      expect(screen.getByText('2 of 3')).toBeTruthy();
      expect(screen.getByLabelText('Remove voice note 2 of 3')).toBeTruthy();
      expect(screen.getAllByTestId('voice-note-sheet-page')).toHaveLength(3);
      expect(screen.getAllByTestId('seek-bar')).toHaveLength(1);
      expect(screen.getByTestId('voice-note-subtitle').props.children).toMatch(/^00:02 · /);
    });

    it('swiping moves the cards by id, and they stay on the last note after closing', async () => {
      await setUp();
      await press('Open voice note 1 of 3');
      expect(cardDots()).toEqual([true, false, false]);
      await swipeSheet(2);
      expect(screen.getByLabelText('Remove voice note 3 of 3')).toBeTruthy();
      expect(cardDots()).toEqual([false, false, true]);
      await press('Close voice note');
      expect(sheet()).toBeNull();
      expect(cardDots()).toEqual([false, false, true]);
    });

    it('the next button changes page and moves the cards too', async () => {
      await setUp();
      await press('Open voice note 1 of 3');
      await press('Next voice note');
      expect(screen.getByText('2 of 3')).toBeTruthy();
      expect(cardDots()).toEqual([false, true, false]);
    });

    it('trash on a swiped-to note removes that note (by id), closes, and undo restores it', async () => {
      await setUp();
      const [, second] = ids();
      await press('Open voice note 1 of 3');
      await press('Next voice note');
      await press('Remove voice note 2 of 3');
      expect(sheet()).toBeNull();
      expect(sessionApi?.session?.recordings.map((r) => [r.id, r.removed])).toEqual([
        [ids()[0], false],
        [second, true],
        [ids()[2], false],
      ]);
      expect(discardRecording).not.toHaveBeenCalled();
      await press('Undo');
      expect(sessionApi?.session?.recordings.every((r) => !r.removed)).toBe(true);
      expect(sheet()).toBeNull();
    });

    it('another note being removed keeps the view on the same note; the active one closes it', async () => {
      await setUp();
      const [first, second, third] = ids();
      await press('Open voice note 2 of 3');
      await act(async () => sessionApi?.removeRecording(first));
      expect(sheet()).toBeTruthy();
      expect(screen.getByText('1 of 2')).toBeTruthy();
      expect(screen.getByLabelText('Remove voice note 1 of 2')).toBeTruthy();
      await act(async () => sessionApi?.restoreRecording(first));
      expect(screen.getByText('2 of 3')).toBeTruthy();
      await act(async () => sessionApi?.removeRecording(third));
      expect(screen.getByText('2 of 2')).toBeTruthy();
      await act(async () => sessionApi?.removeRecording(second));
      expect(sheet()).toBeNull();
    });

    it('a note attached while the view is open joins the pager and the active note stays', async () => {
      await setUp();
      await press('Open voice note 2 of 3');
      await act(
        async () =>
          void sessionApi?.attachRecording({ uri: 'file:///cache/r4.m4a', durationMs: 4000 }),
      );
      expect(sheet()).toBeTruthy();
      expect(screen.getByText('2 of 4')).toBeTruthy();
      expect(screen.getByLabelText('Remove voice note 2 of 4')).toBeTruthy();
    });

    it('a single note shows no pager controls', async () => {
      await renderPage();
      await recordNext(CACHE, 1000);
      await press('Open recording');
      expect(screen.queryByTestId('voice-note-pager-bar')).toBeNull();
      expect(screen.queryByLabelText('Next voice note')).toBeNull();
    });
  });
});

describe('notes and recording panel layout', () => {
  it('shows the cards in the page and the live panel in the bottom dock', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    const notes = screen.getByTestId('entry-notes');
    expect(screen.getByTestId('entry-page')).toContainElement(notes);
    expect(notes).toContainElement(screen.getByLabelText('Play recording'));
    expect(screen.queryByTestId('entry-recording-panel')).toBeNull();
    await startRecording();
    const panel = screen.getByTestId('entry-recording-panel');
    expect(panel).toContainElement(screen.getByLabelText('Stop recording'));
    expect(screen.getByTestId('entry-bottom-dock')).toContainElement(panel);
    expect(screen.getByTestId('entry-page')).not.toContainElement(panel);
    expect(notes).not.toContainElement(screen.getByLabelText('Stop recording'));
    expect(notes).toContainElement(screen.getByLabelText('Play recording'));
  });

  it('shows no notes wrapper while recording the first note', async () => {
    await renderPage();
    await startRecording();
    expect(screen.queryByTestId('entry-notes')).toBeNull();
    expect(screen.getByTestId('entry-recording-panel')).toBeTruthy();
  });

  it('dismisses the keyboard and hides the toolbar while recording, and restores it after', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderPage();
    expect(screen.getByLabelText('Undo')).toBeTruthy();
    await startRecording();
    expect(dismiss).toHaveBeenCalled();
    expect(screen.queryByLabelText('Undo')).toBeNull();
    expect(screen.queryByLabelText('Add tags')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Stop recording'));
    await act(async () => {});
    expect(screen.getByLabelText('Undo')).toBeTruthy();
    dismiss.mockRestore();
  });
});

describe('the expanded voice note view', () => {
  const press = async (label: string) => {
    await fireEvent.press(screen.getByLabelText(label));
    await act(async () => {});
  };
  const recordOne = async () => {
    await renderPage();
    await startRecording();
    await stopRecording();
  };
  const sheet = () => screen.queryByTestId('voice-note-sheet');
  let backHandlers: (() => boolean | null | undefined)[] = [];
  beforeEach(() => {
    backHandlers = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
      backHandlers.push(handler as () => boolean);
      return { remove: () => void (backHandlers = backHandlers.filter((h) => h !== handler)) };
    });
  });

  it('opens from a card with the title and a "mm:ss · Today, time" subtitle (stop time for a new note)', async () => {
    await recordOne();
    expect(sheet()).toBeNull();
    await press('Open recording');
    expect(sheet()).toBeTruthy();
    expect(screen.getByText('Audio Recording')).toBeTruthy();
    expect(screen.getByTestId('voice-note-subtitle').props.children).toMatch(
      /^00:03 · Today, \d{1,2}:\d{2} [AP]M$/,
    );
  });

  it('shows the entry date for a stored note', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await press('Open recording');
    const text: string = screen.getByTestId('voice-note-subtitle').props.children;
    expect(text.startsWith('00:12 · ')).toBe(true);
    expect(text).not.toContain('Today');
  });

  it('opening pauses the card player that was playing', async () => {
    await recordOne();
    await press('Play recording');
    expect(mockPlayer.play).toHaveBeenCalled();
    mockPlayer.pause.mockClear();
    await press('Open recording');
    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  it('keeps the very same page mounted (no remount) and out of the accessibility tree while open', async () => {
    await recordOne();
    const bodyBefore = screen.getByTestId('entry-body');
    const titleBefore = screen.getByLabelText('Title');
    await press('Open recording');
    expect(screen.getByTestId('voice-note-sheet').props.accessibilityViewIsModal).toBe(true);
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.getByTestId('entry-body', { hidden: true })).toBe(bodyBefore);
    await press('Close voice note');
    expect(screen.getByTestId('entry-body')).toBe(bodyBefore);
    expect(screen.getByLabelText('Title')).toBe(titleBefore);
  });

  describe('keyboard', () => {
    const body = () => screen.getByLabelText('Entry text', { hidden: true });
    it('dismisses the keyboard when it opens', async () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss');
      await recordOne();
      await fireEvent(screen.getByLabelText('Entry text'), 'focus');
      dismiss.mockClear();
      await press('Open recording');
      expect(dismiss).toHaveBeenCalledTimes(1);
    });

    // Keyboard.dismiss is a no-op in jest, so the blur it causes on a device is fired by hand.
    it('the blur ends the typing step and hides the suggestion bar; closing neither refocuses nor remounts', async () => {
      await renderPage({ knownTags: ['dream'] });
      await startRecording();
      await stopRecording();
      const input = screen.getByLabelText('Entry text');
      await fireEvent(input, 'focus');
      await fireEvent.changeText(input, 'hello #dr');
      await fireEvent(input, 'selectionChange', {
        nativeEvent: { selection: { start: 9, end: 9 } },
      });
      await advance(600);
      expect(screen.getByLabelText('Tag #dream')).toBeTruthy();
      await press('Open recording');
      await fireEvent(body(), 'blur');
      expect(screen.queryByLabelText('Tag #dream', { hidden: true })).toBeNull();
      await press('Close voice note');
      // Closing brings neither the keyboard nor the bar back, and does not remount the body.
      expect(screen.getByLabelText('Entry text')).toBe(input);
      expect(screen.queryByLabelText('Tag #dream')).toBeNull();
      expect(bodyText(input)).toBe('hello #dr');
      // The typing was its own step.
      await press('Undo');
      // Undo remounts the body, so read the fresh element.
      expect(bodyText(screen.getByLabelText('Entry text'))).toBe('');
    });
  });

  it('the back arrow closes it and stops its own player', async () => {
    await recordOne();
    await press('Open recording');
    mockPlayer.pause.mockClear();
    await press('Close voice note');
    expect(sheet()).toBeNull();
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
  });

  it('Android back closes it first and does not reach the page', async () => {
    await recordOne();
    await press('Open recording');
    expect(backHandlers).toHaveLength(1);
    await act(async () => void backHandlers.at(-1)?.());
    expect(sheet()).toBeNull();
    expect(events.onBack).not.toHaveBeenCalled();
    // Closed: its back handler is gone.
    expect(backHandlers).toHaveLength(0);
  });

  it('the trash marks the note removed, closes the view, deletes nothing; Undo restores the card', async () => {
    await recordOne();
    await press('Open recording');
    await press('Remove recording');
    expect(sheet()).toBeNull();
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(sessionApi?.session?.recordings[0]).toMatchObject({ uri: CACHE, removed: true });
    expect(discardRecording).not.toHaveBeenCalled();
    expect(saveDream).not.toHaveBeenCalled();
    await press('Undo');
    expect(sessionApi?.session?.recordings[0]?.removed).toBe(false);
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    // Undoing does not reopen the view.
    expect(sheet()).toBeNull();
  });

  it('the trash on a stored note marks it removed; nothing is deleted until a save sends removeRecordings', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await press('Open recording');
    await press('Remove recording');
    expect(sheet()).toBeNull();
    expect(sessionApi?.session?.recordings[0]).toMatchObject({ removed: true });
    expect(discardRecording).not.toHaveBeenCalled();
    expect(saveDream).not.toHaveBeenCalled();
    await act(async () => void (await sessionApi?.save('saved')));
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({ id: '7', removeRecordings: ['7.m4a'] }),
    );
  });

  it('labels the trash like the card when there are several notes', async () => {
    await recordOne();
    mockRec.stop.mockResolvedValue({ uri: CACHE2, durationMs: 5000 });
    await startRecording();
    await stopRecording();
    await press('Open voice note 2 of 2');
    expect(screen.getByLabelText('Remove voice note 2 of 2')).toBeTruthy();
    await press('Remove voice note 2 of 2');
    expect(sessionApi?.session?.recordings.map((r) => r.removed)).toEqual([false, true]);
  });

  it('trash and share are disabled while a save is in flight', async () => {
    await recordOne();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Voice');
    await press('Open recording');
    jest.mocked(saveDream).mockReturnValue(new Promise(() => {}));
    await act(async () => void sessionApi?.save('saved'));
    expect(screen.getByLabelText('Remove recording').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Share voice note').props.accessibilityState.disabled).toBe(true);
  });

  it('trash and share are disabled while the recording panel is open', async () => {
    await recordOne();
    await openPanel();
    await press('Open recording');
    expect(sheet()).toBeTruthy();
    expect(screen.getByLabelText('Remove recording').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Share voice note').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Play audio recording').props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('shares the cache uri of an unsaved note and changes nothing', async () => {
    await recordOne();
    await press('Open recording');
    await press('Share voice note');
    expect(shareRecording).toHaveBeenCalledWith(CACHE);
    expect(sheet()).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
    expect(saveDream).not.toHaveBeenCalled();
    expect(sessionApi?.session?.recordings[0]?.removed).toBe(false);
  });

  it('shares the stored file uri of a stored note', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await press('Open recording');
    await press('Share voice note');
    expect(shareRecording).toHaveBeenCalledWith('file:///document/dreams/7.m4a');
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('a share failure shows a quiet alert and nothing else', async () => {
    jest.mocked(shareRecording).mockRejectedValue(new Error('no'));
    await recordOne();
    await press('Open recording');
    await press('Share voice note');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not share',
      'This voice note could not be shared.',
    );
    expect(sheet()).toBeTruthy();
    expect(sessionApi?.session?.recordings[0]?.removed).toBe(false);
  });

  it('closes when its note disappears from under it', async () => {
    await recordOne();
    await press('Open recording');
    const id = sessionApi?.session?.recordings[0]?.id ?? '';
    await act(async () => sessionApi?.removeRecording(id));
    expect(sheet()).toBeNull();
    // Restoring it does not reopen the view.
    await act(async () => sessionApi?.restoreRecording(id));
    expect(sheet()).toBeNull();
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
  });
});

describe('transcripts in the expanded view', () => {
  const body = () => screen.getByLabelText('Entry text');
  const press = async (label: string) => {
    await fireEvent.press(screen.getByLabelText(label));
    await act(async () => {});
  };
  const sheet = () => screen.queryByTestId('voice-note-sheet');
  const withTranscript: Dream = {
    ...stored,
    audioFileName: undefined,
    waveform: undefined,
    transcript: 'Last night',
    recordings: [{ fileName: '7.m4a', durationMs: 1000, voiceTranscript: 'I was flying #water' }],
  };
  const addFromMenu = async () => {
    await press('More options');
    await press('Add transcript to entry');
  };

  it('hides every Transcribe affordance by default (no transcription prop)', async () => {
    await renderPage();
    mockRec.stop.mockResolvedValueOnce({ uri: CACHE, durationMs: 1000 });
    await startRecording();
    await stopRecording();
    await press('Open recording');
    expect(screen.queryByLabelText('Show transcript')).toBeNull();
    expect(screen.getByLabelText('More options')).toBeDisabled();
  });

  it('passes the transcription to the view: tapping the bubble starts a run for the note', async () => {
    fakeT = createFakeTranscription();
    await renderPage();
    mockRec.stop.mockResolvedValueOnce({ uri: CACHE, durationMs: 1000 });
    await startRecording();
    await stopRecording();
    await press('Open recording');
    await press('Show transcript');
    expect(fakeT.start).toHaveBeenCalledWith(sessionApi?.session?.recordings[0].id, CACHE, 1000);
  });

  it("shows a stored note's transcript in the view and offers the menu", async () => {
    await renderPage({ open: { dream: withTranscript, as: 'edit' } });
    await press('Open recording');
    await press('Show transcript');
    expect(screen.getByText('I was flying #water')).toBeTruthy();
    expect(screen.getByLabelText('More options')).toBeTruthy();
  });

  it('Add transcript appends after a blank line, moves the cursor to the end, closes the view and keeps the keyboard closed', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderPage({ open: { dream: withTranscript, as: 'edit' } });
    await press('Open recording');
    focus.mockClear();
    await addFromMenu();
    expect(sheet()).toBeNull();
    expect(sessionApi?.session?.body).toContain('Last night\n\nI was flying #water');
    expect(body().props.selection).toEqual({
      start: sessionApi!.session!.body.length,
      end: sessionApi!.session!.body.length,
    });
    expect(focus).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalled();
  });

  it('is exactly one undo step: undo restores the body, redo adds it back', async () => {
    await renderPage({ open: { dream: { ...withTranscript, tags: [] }, as: 'edit' } });
    const before = sessionApi!.session!.body;
    await press('Open recording');
    await addFromMenu();
    const after = sessionApi!.session!.body;
    expect(after).toBe(`${before.trimEnd()}\n\nI was flying #water`);
    await press('Undo');
    expect(sessionApi?.session?.body).toBe(before);
    expect(bodyText(body())).toBe(before);
    await press('Redo');
    expect(sessionApi?.session?.body).toBe(after);
  });

  it('flushes pending typing first, so it is its own step', async () => {
    await renderPage({ open: { dream: withTranscript, as: 'edit' } });
    await fireEvent.changeText(body(), 'typed words');
    await press('Open recording');
    await addFromMenu();
    expect(sessionApi?.session?.body).toBe('typed words\n\nI was flying #water');
    await press('Undo');
    expect(sessionApi?.session?.body).toBe('typed words');
    await press('Undo');
    expect(sessionApi?.session?.body).not.toBe('typed words');
  });

  it('adds the text to an empty body on its own', async () => {
    await renderPage({
      open: { dream: { ...withTranscript, transcript: '' }, as: 'edit' },
    });
    await fireEvent.changeText(body(), '');
    await press('Open recording');
    await addFromMenu();
    expect(sessionApi?.session?.body).toBe('I was flying #water');
  });

  it('a #tag in the added text becomes a tag on save', async () => {
    await renderPage({ open: { dream: { ...withTranscript, tags: [] }, as: 'edit' } });
    await press('Open recording');
    await addFromMenu();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    expect(jest.mocked(saveDream).mock.calls[0][0].details.tags).toEqual(['water']);
  });

  it('keeps a result that arrived for a removed note, shown after Undo', async () => {
    fakeT = createFakeTranscription((id, text) => sessionApi?.setRecordingTranscript(id, text));
    await renderPage();
    mockRec.stop.mockResolvedValueOnce({ uri: CACHE, durationMs: 1000 });
    await startRecording();
    await stopRecording();
    const id = sessionApi!.session!.recordings[0].id;
    await press('Remove recording');
    await act(async () => fakeT?.emit(id, 'late words'));
    expect(sessionApi?.session?.recordings[0].voiceTranscript).toBe('late words');
    await press('Undo');
    await press('Open recording');
    await press('Show transcript');
    expect(screen.getByText('late words')).toBeTruthy();
  });
});

describe('automatic transcription after a recording', () => {
  // A real-looking start: the note is busy until the test ends the run.
  const ends = new Map<string, () => void>();
  const useRunningStart = () => {
    ends.clear();
    fakeT!.start.mockImplementation(
      (id) =>
        new Promise<void>((resolve) => {
          fakeT!.setState(id, { status: 'running' });
          ends.set(id, resolve);
        }),
    );
  };
  const noteId = (i: number) => sessionApi!.session!.recordings[i].id;
  const record = async (uri: string, durationMs = 3000) => {
    mockRec.stop.mockResolvedValueOnce({ uri, durationMs });
    await startRecording();
    await stopRecording();
  };
  const endRun = async (id: string) => {
    await act(async () => {
      fakeT!.setState(id, { status: 'ready' });
      ends.get(id)?.();
    });
    // The page re-renders with whatever the session holds.
    await act(async () => sessionApi!.setRecordingTranscript(id, 'text'));
  };

  it('starts a new recording once, on-device, with auto: true', async () => {
    fakeT = createFakeTranscription();
    useRunningStart();
    await renderPage();
    await record(CACHE);
    expect(fakeT.start).toHaveBeenCalledTimes(1);
    expect(fakeT.start).toHaveBeenCalledWith(noteId(0), CACHE, 3000, { auto: true });
  });

  it('does not start stored notes at mount', async () => {
    fakeT = createFakeTranscription();
    useRunningStart();
    await renderPage({
      open: {
        dream: {
          ...stored,
          audioFileName: undefined,
          waveform: undefined,
          recordings: [{ fileName: '7.m4a', durationMs: 1000 }],
        },
        as: 'edit',
      },
    });
    expect(fakeT.start).not.toHaveBeenCalled();
  });

  it('runs two quick recordings one after another', async () => {
    fakeT = createFakeTranscription();
    useRunningStart();
    await renderPage();
    await record(CACHE);
    await record(CACHE2);
    expect(fakeT.start).toHaveBeenCalledTimes(1);
    await endRun(noteId(0));
    expect(fakeT.start).toHaveBeenCalledTimes(2);
    expect(fakeT.start).toHaveBeenLastCalledWith(noteId(1), CACHE2, 3000, { auto: true });
  });

  it('does not start when the note is discarded (no recording is attached)', async () => {
    fakeT = createFakeTranscription();
    useRunningStart();
    await renderPage();
    await startRecording();
    await act(async () => leaveRef.current?.());
    expect(fakeT.start).not.toHaveBeenCalled();
  });

  it('never starts on the online route or when unsupported', async () => {
    fakeT = createFakeTranscription();
    fakeT.setRoute('online');
    await renderPage();
    await record(CACHE);
    expect(fakeT.start).not.toHaveBeenCalled();
  });

  it('opening the recording panel cancels the run; it restarts after the next recording stops', async () => {
    fakeT = createFakeTranscription();
    useRunningStart();
    await renderPage();
    await record(CACHE);
    const first = noteId(0);
    expect(fakeT.start).toHaveBeenCalledTimes(1);
    fakeT.cancelAll.mockClear();
    await openPanel();
    expect(fakeT.cancelAll).toHaveBeenCalledTimes(1);
    // The recognizer hook ends the cancelled run.
    await act(async () => {
      fakeT!.setState(first, { status: 'none' });
      ends.get(first)?.();
    });
    expect(fakeT.start).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Start recording'));
    await act(async () => {});
    expect(fakeT.start).toHaveBeenCalledTimes(1);
    mockRec.stop.mockResolvedValueOnce({ uri: CACHE2, durationMs: 2000 });
    await stopRecording();
    // The cancelled note goes first again.
    expect(fakeT.start).toHaveBeenCalledTimes(2);
    expect(fakeT.start).toHaveBeenLastCalledWith(first, CACHE, 3000, { auto: true });
    await endRun(first);
    expect(fakeT.start).toHaveBeenLastCalledWith(noteId(1), CACHE2, 2000, { auto: true });
  });
});
