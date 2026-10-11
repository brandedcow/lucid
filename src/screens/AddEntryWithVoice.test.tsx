import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Alert, AlertButton, TextInput } from 'react-native';
import { entryHasEdits, useEntrySession } from '../hooks/useEntrySession';
import { discardRecording, saveDream } from '../services/dreamStorage';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { bodyText } from '../test/bodyText';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS } from '../utils/journals';
import { AddEntryWithVoice } from './AddEntryWithVoice';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }),
}));

jest.mock('../services/dreamStorage', () => ({
  listTags: jest.fn().mockResolvedValue([]),
  saveDream: jest.fn(),
  discardRecording: jest.fn(),
  dreamAudioUri: (d: { audioFileName?: string }) =>
    d.audioFileName ? `file:///document/dreams/${d.audioFileName}` : null,
  isIndexUnreadableError: () => false,
}));

const mockRec = {
  start: jest.fn(),
  stop: jest.fn(),
  level: 0,
  durationMs: 0,
};
jest.mock('../hooks/useDreamRecorder', () => ({
  useDreamRecorder: () => ({
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
const [DREAMS] = BUILT_IN_JOURNALS;
const events = {
  onRecordingChange: jest.fn(),
  onRecordingDiscarded: jest.fn(),
  onBack: jest.fn(),
  onSaved: jest.fn(),
};
const leaveRef: { current: (() => void) | null } = { current: null };
let sessionApi: ReturnType<typeof useEntrySession> | null = null;

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
      saving={entry.saving}
      onSave={() => void entry.save('saved').then((ok) => ok && events.onSaved())}
      onBack={events.onBack}
      audio={session.audio}
      onRecorded={entry.attachRecording}
      onRemoveAudio={entry.removeAudio}
      onRestoreAudio={entry.restoreAudio}
      onRecordingChange={events.onRecordingChange}
      leaveRef={leaveRef}
      onRecordingDiscarded={events.onRecordingDiscarded}
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
const startRecording = async () => {
  await fireEvent.press(screen.getByLabelText('Record voice note'));
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
  jest.mocked(saveDream).mockResolvedValue({ id: '1', createdAt: 'c' } as Dream);
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
    expect(screen.getByText('Recording 0:00')).toBeTruthy();
    expect(screen.getByLabelText('Stop recording')).toBeTruthy();
    expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Save dream').props.accessibilityState.disabled).toBe(true);
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(true);
  });

  it('shows the elapsed time from the recorder', async () => {
    const view = await renderPage();
    await startRecording();
    mockRec.durationMs = 65_400;
    await view.rerender(<Harness />);
    expect(screen.getByText('Recording 1:05')).toBeTruthy();
  });

  it('alerts and stays idle when the microphone permission is denied', async () => {
    mockRec.start.mockResolvedValue(false);
    await renderPage();
    await startRecording();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Microphone access needed',
      expect.stringMatching(/microphone/i),
    );
    expect(screen.queryByLabelText('Stop recording')).toBeNull();
    expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(
      false,
    );
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(false);
  });

  it('alerts and stays idle when the recorder cannot start', async () => {
    mockRec.start.mockRejectedValue(new Error('boom'));
    await renderPage();
    await startRecording();
    expect(Alert.alert).toHaveBeenCalledWith('Could not start recording', 'Please try again.');
    expect(screen.queryByLabelText('Stop recording')).toBeNull();
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
    const audio = sessionApi?.session?.audio;
    expect(audio).toMatchObject({ uri: CACHE, durationMs: 3000, persisted: false, removed: false });
    expect(audio?.waveform).toHaveLength(56);
    expect(Math.max(...(audio?.waveform ?? []))).toBe(0.9);
    expect(Math.min(...(audio?.waveform ?? [1]))).toBeLessThanOrEqual(0.2);
    // Mic stays off while an attachment exists (one recording per entry).
    expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(true);
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps recording and alerts when stop fails', async () => {
    mockRec.stop.mockRejectedValueOnce(new Error('boom'));
    await renderPage();
    await startRecording();
    await stopRecording();
    expect(Alert.alert).toHaveBeenCalledWith('Could not finish recording', 'Please try again.');
    expect(screen.getByLabelText('Stop recording').props.accessibilityState.disabled).toBe(false);
    expect(sessionApi?.session?.audio).toBeUndefined();
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
    expect(input).toMatchObject({ recordingUri: CACHE, durationMs: 3000, status: 'saved' });
    expect(input.waveform).toHaveLength(56);
    expect(events.onSaved).toHaveBeenCalled();
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
    expect(sessionApi?.session?.audio).toMatchObject({ uri: CACHE, removed: true });
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
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('recordingUri');
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
    expect(sessionApi?.session?.audio).toBeUndefined();
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

  it('only registers the confirmation while recording', async () => {
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
    'shows a reopened %s recording in a playable card with a close button, mic off',
    async (as) => {
      await renderPage({ open: { dream: stored, as } });
      expect(screen.getByLabelText('Play recording')).toBeTruthy();
      expect(screen.getAllByTestId('wave-bar')).toHaveLength(3);
      expect(screen.getByLabelText('Remove recording')).toBeTruthy();
      expect(screen.getByLabelText('Record voice note').props.accessibilityState.disabled).toBe(
        true,
      );
    },
  );

  it('closing a stored recording hides the card, deletes nothing and sends removeAudio on save', async () => {
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
      expect.objectContaining({ id: '7', removeAudio: true, durationMs: 0 }),
    );
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('recordingUri');
  });

  it('restoring a closed stored recording brings the card back and saves without removeAudio', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await fireEvent.press(screen.getByLabelText('Remove recording'));
    await act(async () => sessionApi?.restoreAudio());
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    await act(async () => void (await sessionApi?.save('saved')));
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('removeAudio');
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
    expect(sessionApi?.session?.audio?.removed).toBe(false);
    await press('Redo');
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(sessionApi?.session?.audio?.removed).toBe(true);
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

  it('recording a new note after closing the card drops the close step', async () => {
    await renderPage();
    await recordOne();
    await press('Remove recording');
    await recordOne();
    expect(disabled('Undo')).toBe(true);
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
  });

  it('undo and redo are off while recording', async () => {
    await renderPage();
    await typeBody('words');
    await startRecording();
    expect(disabled('Undo')).toBe(true);
    expect(disabled('Redo')).toBe(true);
    expect(disabled('Record voice note')).toBe(true);
  });

  it('a stored recording closed then restored by undo is kept on Done', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await press('Remove recording');
    await press('Undo');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('removeAudio');
  });

  it('a stored recording closed (or closed, undone and redone) is removed on Done', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    await press('Remove recording');
    await press('Undo');
    await press('Redo');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save dream'));
    });
    expect(jest.mocked(saveDream).mock.calls[0][0]).toMatchObject({ removeAudio: true });
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
      .filter((l) => /^(Tag|Create) #/.test(l ?? ''));
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

  it('filters by prefix then substring, with a Create hint first for a new word', async () => {
    await renderPage({ knownTags: [...KNOWN, 'sea-water'] });
    await type('x #wat');
    expect(pills()).toEqual(['Create #wat', 'Tag #water', 'Tag #waterfall', 'Tag #sea-water']);
    await type('x #wolf');
    expect(pills()).toEqual(['Create #wolf']);
  });

  it('has no Create hint for an exact existing tag', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('#water');
    expect(pills()[0]).toBe('Tag #water');
    expect(pills().some((l) => l.startsWith('Create'))).toBe(false);
  });

  it('works mid-sentence: the cursor inside a tag in the middle of the text', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('before #fl after', 10);
    expect(pills()).toEqual(['Tag #flying', 'Create #fl'].reverse());
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

  it('the Create hint only dismisses the bar; the text stays', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('hi #new');
    await press('Create #new');
    expect(bodyText(body())).toBe('hi #new');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    // Another token brings it back.
    await type('hi #new #fl');
    expect(screen.queryByTestId('tag-suggestions')).not.toBeNull();
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
