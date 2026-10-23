import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect, useReducer } from 'react';
import { Alert, BackHandler, Keyboard, TextInput } from 'react-native';
import {
  NoteSession,
  newRecordingId,
  newSession,
  noteSessionReducer,
} from '../hooks/noteSessionState';
import { createFakeTranscription, FakeTranscription } from '../test/fakeTranscription';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { bodyText } from '../test/bodyText';
import type { Note } from '../services/notesStorage';
import * as noteLinks from '../utils/noteLinks';
import type { NoteEditor } from '../hooks/useNoteEditor';
import { NoteEditorWithVoice } from './NoteEditorWithVoice';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }),
}));

const mockScreen: { editor: NoteEditor | null } = { editor: null };
jest.mock('./NoteEditorScreen', () => {
  const actual = jest.requireActual('./NoteEditorScreen');
  return {
    ...actual,
    NoteEditorScreen: (props: { editor: NoteEditor }) => {
      mockScreen.editor = props.editor;
      return <actual.NoteEditorScreen {...props} />;
    },
  };
});

const mockRec = { start: jest.fn(), stop: jest.fn(), level: 0, durationMs: 0 };
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
const events = {
  onRecordingChange: jest.fn(),
  onRecordingDiscarded: jest.fn(),
  onBack: jest.fn(),
  onTogglePin: jest.fn(),
  onDelete: jest.fn(),
};
const leaveRef: { current: (() => void) | null } = { current: null };
let state: NoteSession | null = null;
let fakeT: FakeTranscription | undefined;
let keyboard: ReturnType<typeof fakeKeyboard>;

const storedVoice: NoteSession['recordings'][number] = {
  id: 'stored-1',
  uri: 'file:///document/notes/7.m4a',
  fileName: '7.m4a',
  persisted: true,
  removed: false,
  durationMs: 12_000,
  voiceTranscript: 'I was flying #water',
};

type HarnessProps = {
  knownTags?: string[];
  initial?: Partial<NoteSession>;
  locked?: boolean;
  notes?: Note[];
};

function Harness({ knownTags, initial, locked = false, notes }: HarnessProps) {
  const [session, dispatch] = useReducer(
    noteSessionReducer as (
      s: NoteSession,
      a: Parameters<typeof noteSessionReducer>[1],
    ) => NoteSession,
    undefined,
    () => ({ ...newSession('n1'), ...initial }),
  );
  useEffect(() => {
    state = session;
  });
  return (
    <NoteEditorWithVoice
      date="Sunday, October 18"
      onBack={events.onBack}
      onTogglePin={events.onTogglePin}
      onDelete={events.onDelete}
      menuDisabled={false}
      locked={locked}
      autoFocus={false}
      session={session}
      actions={{
        setBody: (text) => dispatch({ type: 'setBody', text }),
        attachRecording: (recording) => {
          const id = newRecordingId();
          dispatch({ type: 'attach', id, recording });
          return id;
        },
        closeRecording: (id) => dispatch({ type: 'close', id }),
        restoreRecording: (id) => dispatch({ type: 'restore', id }),
      }}
      knownTags={knownTags}
      notes={notes}
      transcription={fakeT}
      onRecordingChange={events.onRecordingChange}
      leaveRef={leaveRef}
      onRecordingDiscarded={events.onRecordingDiscarded}
    />
  );
}

const renderPage = async (props: HarnessProps = {}) => {
  const view = await render(<Harness {...props} />);
  await act(async () => {});
  return view;
};
const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
const body = () => screen.getByTestId('note-body');
const disabled = (label: string) => screen.getByLabelText(label).props.accessibilityState.disabled;
const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};
const select = (start: number, end = start) =>
  fireEvent(body(), 'selectionChange', { nativeEvent: { selection: { start, end } } });
const typeBody = async (text: string) => {
  await fireEvent.changeText(body(), text);
  await advance(600);
};
const type = async (text: string, cursor = text.length) => {
  await fireEvent(body(), 'focus');
  await fireEvent.changeText(body(), text);
  await select(cursor);
  await advance(600);
};
const openPanel = async () => {
  await press('Record voice note');
};
const startRecording = async () => {
  await openPanel();
  await press('Start recording');
};
const stopRecording = async () => press('Stop recording');
const recordOne = async () => {
  await startRecording();
  await stopRecording();
};
const pills = () =>
  screen
    .queryAllByRole('button')
    .map((b) => b.props.accessibilityLabel as string)
    .filter((l) => /^Tag #/.test(l ?? ''));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRec.level = 0;
  mockRec.durationMs = 0;
  mockRec.start.mockResolvedValue(true);
  mockRec.stop.mockResolvedValue({ uri: CACHE, durationMs: 3000 });
  leaveRef.current = null;
  state = null;
  fakeT = undefined;
  keyboard = fakeKeyboard();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('undo and redo', () => {
  it('starts with undo and redo disabled and shows the six buttons', async () => {
    await renderPage();
    for (const label of [
      'Undo',
      'Redo',
      'Hide keyboard',
      'Record voice note',
      'Add tags',
      'Add checkbox',
    ])
      expect(screen.getByLabelText(label)).toBeTruthy();
    expect(disabled('Undo')).toBe(true);
    expect(disabled('Redo')).toBe(true);
  });

  it('groups typing into steps and undoes and redoes them', async () => {
    await renderPage();
    // The real input is focused by autoFocus; without a focus the new note falls back to reading.
    await fireEvent(body(), 'focus');
    await typeBody('first');
    await typeBody('first second');
    await press('Undo');
    expect(bodyText(body())).toBe('first');
    expect(disabled('Redo')).toBe(false);
    await press('Undo');
    expect(bodyText(body())).toBe('');
    expect(disabled('Undo')).toBe(true);
    await press('Redo');
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

  it('the checkbox cell is its own step, apart from the typing before and after', async () => {
    await renderPage();
    await fireEvent(body(), 'focus');
    // No pause between typing and the cell: they must still be separate steps.
    await fireEvent.changeText(body(), 'milk');
    await select(4);
    await press('Add checkbox');
    expect(state?.body).toBe('- [ ] milk');
    expect(screen.getByLabelText('Remove checkbox')).toBeTruthy();
    await fireEvent.changeText(body(), '- [ ] milk!');
    await advance(600);
    await press('Undo');
    expect(state?.body).toBe('- [ ] milk');
    await press('Undo');
    expect(state?.body).toBe('milk');
    await press('Undo');
    expect(state?.body).toBe('');
    await press('Redo');
    await press('Redo');
    expect(state?.body).toBe('- [ ] milk');
  });

  it.each([
    ['indentItem', (e: NoteEditor) => e.indentItem(), '- a\n- b', 7, '- a\n  - b'],
    ['outdentItem', (e: NoteEditor) => e.outdentItem(), '- a\n  - b', 9, '- a\n- b'],
    ['moveItem', (e: NoteEditor) => e.moveItem('up'), '- a\n- b', 7, '- b\n- a'],
    ['setListType', (e: NoteEditor) => e.setListType('numbered'), '- a', 3, '1. a'],
  ])(
    '%s is one undo step that restores the exact prior text',
    async (_n, run, text, caret, out) => {
      await renderPage();
      await type(text, caret);
      await act(async () => run(mockScreen.editor!));
      expect(state?.body).toBe(out);
      await press('Undo');
      expect(state?.body).toBe(text);
      await press('Redo');
      expect(state?.body).toBe(out);
    },
  );

  it('a list method with a null result changes nothing and adds no undo step', async () => {
    await renderPage();
    await type('# head', 2);
    await act(async () => mockScreen.editor!.indentItem());
    expect(state?.body).toBe('# head');
    await press('Undo');
    expect(state?.body).toBe('');
  });

  it('undo and redo put the caret at the end of the changed region', async () => {
    await renderPage();
    await type('abc def');
    await type('abc XY def', 6);
    await press('Undo');
    expect(bodyText(body())).toBe('abc def');
    expect(body().props.selection).toEqual({ start: 4, end: 4 });
    await press('Redo');
    expect(bodyText(body())).toBe('abc XY def');
    expect(body().props.selection).toEqual({ start: 7, end: 7 });
  });

  it('undo of closing a voice note restores it; redo closes it again; nothing is deleted', async () => {
    await renderPage();
    await recordOne();
    await press('Remove recording');
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(state?.recordings[0]?.removed).toBe(true);
    await press('Undo');
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(state?.recordings[0]?.removed).toBe(false);
    await press('Redo');
    expect(state?.recordings[0]?.removed).toBe(true);
    expect(state?.recordings).toHaveLength(1);
  });

  it('a closed stored voice note is only marked; undo and redo toggle the mark', async () => {
    await renderPage({ initial: { stored: true, recordings: [storedVoice] } });
    await press('Remove recording');
    expect(state?.recordings[0]?.removed).toBe(true);
    // The toolbar (and Undo) only exists while editing: tap into the note first.
    await press('Edit note');
    await fireEvent(body(), 'focus');
    await press('Undo');
    expect(state?.recordings[0]?.removed).toBe(false);
    await press('Redo');
    expect(state?.recordings[0]?.removed).toBe(true);
  });

  it('a new voice note is not on the undo stack; typing and a close share one stack', async () => {
    await renderPage();
    await recordOne();
    expect(disabled('Undo')).toBe(true);
    await typeBody('words');
    await press('Remove recording');
    await press('Undo');
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(bodyText(body())).toBe('words');
    await press('Undo');
    expect(bodyText(body())).toBe('');
    expect(disabled('Undo')).toBe(true);
  });

  it('the recording panel replaces the toolbar, so undo and redo are off', async () => {
    await renderPage();
    await typeBody('words');
    await openPanel();
    for (const label of ['Undo', 'Redo', 'Record voice note', 'Add tags'])
      expect(screen.queryByLabelText(label)).toBeNull();
    await act(async () => leaveRef.current?.());
    expect(disabled('Undo')).toBe(false);
  });

  it('locks every toolbar button while locked', async () => {
    await renderPage({ locked: true, initial: { body: 'a' } });
    for (const label of ['Undo', 'Redo', 'Record voice note', 'Add tags', 'Add checkbox'])
      expect(disabled(label)).toBe(true);
    expect(body().props.editable).toBe(false);
  });
});

describe('tag suggestions', () => {
  const KNOWN = ['dream', 'water', 'waterfall', 'flying'];

  it('is hidden with no token or without focus', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('plain words');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    await type('a #wa b', 7);
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });

  it('shows every existing tag (capped) for a bare "#"', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`);
    await renderPage({ knownTags: many });
    await type('#');
    expect(pills()).toEqual(many.slice(0, 8).map((t) => `Tag #${t}`));
  });

  it('filters by prefix then substring; a word nothing matches shows no bar', async () => {
    await renderPage({ knownTags: [...KNOWN, 'sea-water'] });
    await type('x #wat');
    expect(pills()).toEqual(['Tag #water', 'Tag #waterfall', 'Tag #sea-water']);
    await type('x #wolf');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });

  it('works mid-sentence and hides for a range selection', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('before #fl after', 10);
    expect(pills()).toEqual(['Tag #flying']);
    await select(2, 12);
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });

  it('completes the word on tap as ONE undo step, with the caret after it and the body focused', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderPage({ knownTags: KNOWN });
    await type('see #wa now', 7);
    await press('Tag #water');
    expect(state?.body).toBe('see #water now');
    expect(body().props.selection).toEqual({ start: 11, end: 11 });
    expect(focus).toHaveBeenCalled();
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    await press('Undo');
    expect(state?.body).toBe('see #wa now');
    expect(disabled('Undo')).toBe(false);
    await press('Redo');
    expect(state?.body).toBe('see #water now');
  });

  it('completes at the end of the text, adding one trailing space', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('hi #dr');
    await press('Tag #dream');
    expect(state?.body).toBe('hi #dream ');
  });

  it('suggests tags already typed in the note, and not the word being typed', async () => {
    await renderPage({ knownTags: [] });
    await type('#dre');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    await fireEvent.changeText(body(), '#dre #d');
    await select(7);
    expect(pills()).toEqual(['Tag #dre']);
  });

  it('offers stored tags in their inline form, deduped, dropping ones that cannot be inline', async () => {
    await renderPage({
      knownTags: ['bad dream', 'v1.2', 'bad-dream', '2024', '', 'x'.repeat(41), 'ok'],
    });
    await type('#');
    expect(pills()).toEqual(['Tag #bad-dream', 'Tag #v1-2', 'Tag #ok']);
  });

  it('the # button inserts "#" at the caret as its own step and shows the bar at once', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('word');
    await press('Add tags');
    expect(state?.body).toBe('word #');
    expect(pills()).toEqual(KNOWN.map((t) => `Tag #${t}`));
    await press('Undo');
    expect(state?.body).toBe('word');
  });

  it('the # button goes to the end when no caret is known', async () => {
    await renderPage({ initial: { body: 'abc' } });
    await press('Add tags');
    expect(state?.body).toBe('abc #');
  });

  it('hides on blur and when the keyboard hides, returns on focus', async () => {
    await renderPage({ knownTags: KNOWN });
    await type('a #wa');
    expect(screen.queryByTestId('tag-suggestions')).not.toBeNull();
    await fireEvent(body(), 'blur');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
    await fireEvent(body(), 'focus');
    expect(screen.queryByTestId('tag-suggestions')).not.toBeNull();
    await keyboard.emit('keyboardWillHide');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });

  it('is hidden while locked', async () => {
    const view = await renderPage({ knownTags: KNOWN });
    await type('a #wa');
    expect(screen.queryByTestId('tag-suggestions')).not.toBeNull();
    await view.rerender(<Harness knownTags={KNOWN} locked />);
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });
});

describe('recording flow', () => {
  it('opens idle, announces the panel and asks for no permission until the red button', async () => {
    await renderPage();
    await openPanel();
    expect(mockRec.start).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-recording-panel')).toBeTruthy();
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(true);
    await press('Start recording');
    expect(mockRec.start).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Stop recording')).toBeTruthy();
  });

  it('uses the note microphone message when permission is denied', async () => {
    mockRec.start.mockResolvedValue(false);
    await renderPage();
    await startRecording();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Microphone access needed',
      'Lucid needs the microphone to record a voice note. You can allow it in Settings.',
    );
    await act(async () => leaveRef.current?.());
    expect(screen.queryByTestId('note-recording-panel')).toBeNull();
  });

  it('stop attaches a card and the mic stays available', async () => {
    await renderPage();
    await recordOne();
    expect(state?.recordings).toHaveLength(1);
    expect(state?.recordings[0]).toMatchObject({ uri: CACHE, durationMs: 3000, removed: false });
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(disabled('Record voice note')).toBe(false);
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(false);
  });

  it('leaving while recording asks first; Discard carries on leaving', async () => {
    await renderPage();
    await startRecording();
    await act(async () => leaveRef.current?.());
    expect(Alert.alert).toHaveBeenCalled();
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
    const discard = buttons.find((b) => b.style === 'destructive');
    await act(async () => void discard?.onPress?.());
    expect(events.onRecordingDiscarded).toHaveBeenCalledTimes(1);
    expect(state?.recordings).toEqual([]);
  });

  it('tells the parent the recording ended when the page goes away', async () => {
    const view = await renderPage();
    await openPanel();
    events.onRecordingChange.mockClear();
    await view.unmount();
    expect(events.onRecordingChange).toHaveBeenLastCalledWith(false);
  });
});

describe('expanded voice note view', () => {
  const sheet = () => screen.queryByTestId('voice-note-sheet');
  let backHandlers: (() => boolean | null | undefined)[] = [];
  beforeEach(() => {
    backHandlers = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
      backHandlers.push(handler as () => boolean);
      return { remove: () => void (backHandlers = backHandlers.filter((h) => h !== handler)) };
    });
  });

  it('opens from a card, keeps the page mounted and closes again', async () => {
    await renderPage();
    await recordOne();
    const before = screen.getByTestId('note-body');
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await press('Open recording');
    expect(sheet()).toBeTruthy();
    expect(dismiss).toHaveBeenCalled();
    expect(screen.getByTestId('note-body', { hidden: true })).toBe(before);
    await press('Close voice note');
    expect(sheet()).toBeNull();
    expect(screen.getByTestId('note-body')).toBe(before);
  });

  it('its trash closes the note as an undoable step and closes the view', async () => {
    await renderPage();
    await recordOne();
    await press('Open recording');
    await press('Remove recording');
    expect(sheet()).toBeNull();
    expect(state?.recordings[0]?.removed).toBe(true);
    await press('Undo');
    expect(state?.recordings[0]?.removed).toBe(false);
  });

  it('shows a stored note date from the session createdAt', async () => {
    await renderPage({
      initial: { stored: true, createdAt: '2026-10-01T08:00:00.000Z', recordings: [storedVoice] },
    });
    await press('Open recording');
    const text: string = screen.getByTestId('voice-note-subtitle').props.children;
    expect(text.startsWith('00:12 · ')).toBe(true);
    expect(text).not.toContain('Today');
  });
});

describe('transcription', () => {
  const addFromMenu = async () => {
    await press('More options');
    await press('Add transcript to entry');
  };

  it('hides Transcribe by default', async () => {
    await renderPage();
    await recordOne();
    await press('Open recording');
    expect(screen.queryByLabelText('Show transcript')).toBeNull();
  });

  it('passes the transcription to the view', async () => {
    fakeT = createFakeTranscription();
    await renderPage();
    mockRec.stop.mockResolvedValueOnce({ uri: CACHE, durationMs: 1000 });
    await recordOne();
    await press('Open recording');
    await press('Show transcript');
    expect(fakeT.start).toHaveBeenCalledWith(state?.recordings[0].id, CACHE, 1000);
  });

  it('Add transcript appends as ONE undo step, closes the view and keeps the keyboard closed', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderPage({
      initial: { stored: true, body: 'Last night', recordings: [storedVoice] },
    });
    await press('Open recording');
    focus.mockClear();
    await addFromMenu();
    expect(screen.queryByTestId('voice-note-sheet')).toBeNull();
    expect(state?.body).toBe('Last night\n\nI was flying #water');
    expect(focus).not.toHaveBeenCalled();
    // The toolbar (and Undo) only exists while editing: tap into the note first.
    await press('Edit note');
    await fireEvent(body(), 'focus');
    await press('Undo');
    expect(state?.body).toBe('Last night');
    await press('Redo');
    expect(state?.body).toBe('Last night\n\nI was flying #water');
  });

  it('flushes pending typing first, so it is its own step', async () => {
    await renderPage({ initial: { stored: true, recordings: [storedVoice] } });
    // A stored note opens in the reading view; a tap on the note brings the input back.
    await press('Edit note');
    await fireEvent.changeText(body(), 'typed words');
    await press('Open recording');
    await addFromMenu();
    expect(state?.body).toBe('typed words\n\nI was flying #water');
    await press('Undo');
    expect(state?.body).toBe('typed words');
  });
});

describe('automatic transcription after a recording', () => {
  const noteId = (i: number) => state!.recordings[i].id;
  const record = async (uri: string, durationMs = 3000) => {
    mockRec.stop.mockResolvedValueOnce({ uri, durationMs });
    await startRecording();
    await stopRecording();
  };

  it('starts a new recording once, on-device, with auto: true', async () => {
    fakeT = createFakeTranscription();
    await renderPage();
    await record(CACHE);
    expect(fakeT.start).toHaveBeenCalledTimes(1);
    expect(fakeT.start).toHaveBeenCalledWith(noteId(0), CACHE, 3000, { auto: true });
  });

  it('does not start stored notes at mount', async () => {
    fakeT = createFakeTranscription();
    await renderPage({
      initial: { stored: true, recordings: [{ ...storedVoice, voiceTranscript: undefined }] },
    });
    expect(fakeT.start).not.toHaveBeenCalled();
  });

  it('opening the recording panel cancels the run', async () => {
    fakeT = createFakeTranscription();
    await renderPage();
    await record(CACHE2);
    fakeT.cancelAll.mockClear();
    await openPanel();
    expect(fakeT.cancelAll).toHaveBeenCalledTimes(1);
  });
});

describe('[[ note link suggestions', () => {
  const note = (id: string, body: string, day: number): Note => ({
    id,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    body,
  });
  const NOTES = [note('a', 'Foo bar\ntext', 3), note('b', 'Food diary', 2), note('c', 'Other', 1)];
  const bar = () => screen.queryByTestId('wikilink-suggestions');
  const rows = () =>
    screen
      .queryAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((l) => ['Foo bar', 'Food diary', 'Other', 'Bad [x]'].includes(l));

  it('appears while typing [[Fo, best match first, and tags stay out of it', async () => {
    await renderPage({ notes: NOTES, knownTags: ['foo'] });
    await type('see [[Fo');
    expect(bar()).not.toBeNull();
    expect(rows()).toEqual(['Foo bar', 'Food diary']);
    expect(screen.getByTestId('wikilink-suggestions').props.keyboardShouldPersistTaps).toBe(
      'always',
    );
    expect(pills()).toEqual([]);
  });

  it('suppresses the tag bar inside a wiki token even when a tag would match', async () => {
    await renderPage({ notes: [], knownTags: ['foo'] });
    await type('[[#fo');
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });

  it('hides when nothing matches', async () => {
    await renderPage({ notes: NOTES });
    await type('[[zzz');
    expect(bar()).toBeNull();
  });

  it('hides for a range selection', async () => {
    await renderPage({ notes: NOTES });
    await type('[[Fo');
    await select(0, 4);
    expect(bar()).toBeNull();
  });

  it('hides while locked', async () => {
    const view = await renderPage({ notes: NOTES });
    await type('[[Fo');
    expect(bar()).not.toBeNull();
    await view.rerender(<Harness notes={NOTES} locked />);
    expect(bar()).toBeNull();
  });

  it('hides while the recording panel is open', async () => {
    await renderPage({ notes: NOTES });
    await type('[[Fo');
    await openPanel();
    expect(bar()).toBeNull();
  });

  it('is not shown in the reading view', async () => {
    await renderPage({ notes: NOTES, initial: { stored: true, body: '[[Fo' } });
    expect(bar()).toBeNull();
  });

  it('hides on blur and when the keyboard hides, returns on focus', async () => {
    await renderPage({ notes: NOTES });
    await type('[[Fo');
    await fireEvent(body(), 'blur');
    expect(bar()).toBeNull();
    await fireEvent(body(), 'focus');
    expect(bar()).not.toBeNull();
    await keyboard.emit('keyboardWillHide');
    expect(bar()).toBeNull();
  });

  it('a pick writes [[Title]], puts the caret after ]], is ONE undo step and keeps focus', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus');
    await renderPage({ notes: NOTES });
    await type('see [[Fo and more', 8);
    await press('Foo bar');
    expect(state?.body).toBe('see [[Foo bar]] and more');
    expect(body().props.selection).toEqual({ start: 15, end: 15 });
    expect(focus).toHaveBeenCalled();
    expect(bar()).toBeNull();
    await press('Undo');
    expect(state?.body).toBe('see [[Fo and more');
    expect(disabled('Undo')).toBe(false);
    await press('Redo');
    expect(state?.body).toBe('see [[Foo bar]] and more');
  });

  it('does not double the ]] that already follows the caret', async () => {
    await renderPage({ notes: NOTES });
    await type('[[Fo]] x', 4);
    await press('Food diary');
    expect(state?.body).toBe('[[Food diary]] x');
    expect(body().props.selection).toEqual({ start: 14, end: 14 });
  });

  it('a title completeWikiToken rejects does nothing', async () => {
    await renderPage({ notes: [note('x', 'Bad [x]', 5)] });
    await type('[[Ba');
    // matchTitles already hides bracketed titles; force a row through to exercise the guard.
    jest
      .spyOn(noteLinks, 'matchTitles')
      .mockReturnValue([{ key: 'bad', id: 'x', title: 'Bad [x]', updatedAt: undefined }]);
    await type('[[Bad');
    await press('Bad [x]');
    expect(state?.body).toBe('[[Bad');
  });

  it('does not rebuild the index when only text below the Title changes', async () => {
    const build = jest.spyOn(noteLinks, 'buildTitleIndex');
    await renderPage({ notes: NOTES });
    await type('Mine\n[[Fo');
    const n = build.mock.calls.length;
    expect(n).toBeGreaterThan(0);
    await fireEvent.changeText(body(), 'Mine\n[[Foo');
    await select(10);
    expect(rows()).toEqual(['Foo bar', 'Food diary']);
    expect(build.mock.calls.length).toBe(n);
  });

  it('builds and matches 5000 notes in a sane time', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => note(`n${i}`, `Note title ${i}\nx`, 1));
    await renderPage({ notes: many });
    const t0 = Date.now();
    await type('[[Note title 49');
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(bar()).not.toBeNull();
    expect(rows().length).toBe(0); // titles are not in the fixed label list above
    expect(screen.getAllByRole('button', { name: /^Note title 49/ }).length).toBeGreaterThan(0);
  });
});
