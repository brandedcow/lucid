import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Alert, AlertButton, TextInput } from 'react-native';
import { useEntrySession } from '../hooks/useEntrySession';
import { discardRecording, saveDream } from '../services/dreamStorage';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS } from '../utils/journals';
import { AddEntryWithVoice } from './AddEntryWithVoice';

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

function Harness({ open }: { open?: { dream: Dream; as: 'draft' | 'edit' } }) {
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
      tags={session.tags}
      onTagsChange={entry.setTags}
      tagDraft={session.tagDraft}
      onTagDraftChange={entry.setTagDraft}
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
    expect(tree.indexOf('"Add a tag..."')).toBe(-1);
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
    expect(body().props.value).toBe('first');
    expect(disabled('Redo')).toBe(false);
    await press('Undo');
    expect(body().props.value).toBe('');
    expect(disabled('Undo')).toBe(true);
    await press('Redo');
    expect(body().props.value).toBe('first');
    await press('Redo');
    expect(body().props.value).toBe('first second');
    expect(disabled('Redo')).toBe(true);
  });

  it('typing after an undo clears redo', async () => {
    await renderPage();
    await typeBody('one');
    await press('Undo');
    await fireEvent.changeText(body(), 'other');
    expect(disabled('Redo')).toBe(true);
  });

  it('does not touch the title or tags', async () => {
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
    expect(body().props.value).toBe('words');
    await press('Undo');
    expect(body().props.value).toBe('');
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
    it('hides the tag row until # is tapped, then shows and focuses it', async () => {
      const focus = jest.spyOn(TextInput.prototype, 'focus');
      await renderPage();
      expect(screen.queryByPlaceholderText('Add a tag...')).toBeNull();
      await press('Add tags');
      expect(screen.getByPlaceholderText('Add a tag...')).toBeTruthy();
      expect(focus).toHaveBeenCalledTimes(1);
    });

    it('focuses the input again when # is tapped with tag text in it', async () => {
      const focus = jest.spyOn(TextInput.prototype, 'focus');
      await renderPage();
      await press('Add tags');
      await fireEvent.changeText(screen.getByPlaceholderText('Add a tag...'), 'wat');
      await press('Add tags');
      expect(focus).toHaveBeenCalledTimes(2);
    });

    it('tapping # again hides an empty row', async () => {
      await renderPage();
      await press('Add tags');
      await press('Add tags');
      expect(screen.queryByPlaceholderText('Add a tag...')).toBeNull();
    });

    it('shows the row regardless when the entry has tags, and # does not hide it', async () => {
      await renderPage({ open: { dream: { ...stored, tags: ['water'] }, as: 'edit' } });
      expect(screen.getByPlaceholderText('Add a tag...')).toBeTruthy();
      await press('Add tags');
      expect(screen.getByPlaceholderText('Add a tag...')).toBeTruthy();
    });

    it('keeps the row open after the last tag of a tagged entry is removed, until # closes it', async () => {
      await renderPage({ open: { dream: { ...stored, tags: ['water'] }, as: 'edit' } });
      await press('Remove tag water');
      expect(screen.queryByText('water')).toBeNull();
      expect(screen.getByPlaceholderText('Add a tag...')).toBeTruthy();
      await press('Add tags');
      expect(screen.queryByPlaceholderText('Add a tag...')).toBeNull();
    });

    it('keeps the row when tag text is typed', async () => {
      await renderPage();
      await press('Add tags');
      await fireEvent.changeText(screen.getByPlaceholderText('Add a tag...'), 'wat');
      await press('Add tags');
      expect(screen.getByPlaceholderText('Add a tag...')).toBeTruthy();
    });
  });
});
