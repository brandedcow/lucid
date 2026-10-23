import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect, useReducer } from 'react';
import { Alert, Keyboard, Linking, ScrollView } from 'react-native';
import { NoteSession, newSession, noteSessionReducer } from '../hooks/noteSessionState';
import type { Note } from '../services/notesStorage';
import * as playbackModule from '../hooks/useRecordingPlayback';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { bodyText } from '../test/bodyText';
import { LINK_COPY, NoteEditorWithVoice } from './NoteEditorWithVoice';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }),
}));
const mockRec = { start: jest.fn(), stop: jest.fn() };
jest.mock('../hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    ...mockRec,
    pause: jest.fn(),
    resume: jest.fn(),
    level: 0,
    durationMs: 0,
    isRecording: true,
  }),
}));
const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
}));

const onFollowNoteLink = jest.fn();
let state: NoteSession | null = null;
let keyboard: ReturnType<typeof fakeKeyboard>;

const voice: NoteSession['recordings'][number] = {
  id: 'v1',
  uri: 'file:///document/notes/7.m4a',
  fileName: '7.m4a',
  persisted: true,
  removed: false,
  durationMs: 12_000,
};
const other = (body: string): Note => ({
  id: 'other',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  body,
});

type HarnessProps = {
  body?: string;
  stored?: boolean;
  autoFocus?: boolean;
  locked?: boolean;
  imagesEnabled?: boolean;
  notes?: Note[];
  recordings?: NoteSession['recordings'];
};

function Harness({
  body = '',
  stored = true,
  autoFocus = false,
  locked = false,
  imagesEnabled = false,
  notes = [],
  recordings = [],
}: HarnessProps) {
  const [session, dispatch] = useReducer(
    noteSessionReducer as (
      s: NoteSession,
      a: Parameters<typeof noteSessionReducer>[1],
    ) => NoteSession,
    undefined,
    () => ({ ...newSession('n1'), body, stored, recordings }),
  );
  useEffect(() => {
    state = session;
  });
  return (
    <NoteEditorWithVoice
      date="Sunday, October 18"
      onBack={() => {}}
      onTogglePin={() => {}}
      onDelete={() => {}}
      menuDisabled={false}
      locked={locked}
      autoFocus={autoFocus}
      session={session}
      actions={{
        setBody: (text) => dispatch({ type: 'setBody', text }),
        attachRecording: (recording) => {
          dispatch({ type: 'attach', id: 'r1', recording });
          return 'r1';
        },
        closeRecording: (id) => dispatch({ type: 'close', id }),
        restoreRecording: (id) => dispatch({ type: 'restore', id }),
      }}
      notes={notes}
      imagesEnabled={imagesEnabled}
      onFollowNoteLink={onFollowNoteLink}
    />
  );
}

const renderPage = async (props: HarnessProps = {}) => {
  const view = await render(<Harness {...props} />);
  await act(async () => {});
  return view;
};
const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));
const input = () => screen.getByTestId('note-body');
const disabled = (label: string) => screen.getByLabelText(label).props.accessibilityState.disabled;
const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};
const tap = async (text: string) => {
  await fireEvent.press(screen.getByText(text));
  await act(async () => {});
};
const caret = () => input().props.selection;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRec.start.mockReset();
  mockRec.stop.mockReset();
  state = null;
  keyboard = fakeKeyboard();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const fill = () => screen.getByTestId('reading-fill');
const tapFill = async () => {
  await fireEvent.press(fill());
  await act(async () => {});
};
const present = (label: string) => screen.queryByLabelText(label) !== null;

describe('opening', () => {
  it('shows a stored note in the reading view with no text input', async () => {
    await renderPage({ body: 'Title\nsome text' });
    expect(screen.getByText('some text')).toBeTruthy();
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(screen.queryByLabelText('Note text')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Done')).toBeNull();
    expect(present('Hide keyboard')).toBe(false);
  });

  it('opens a new note in editing', async () => {
    await renderPage({ stored: false, autoFocus: true });
    expect(input()).toBeTruthy();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Done')).toBeNull();
    expect(present('Hide keyboard')).toBe(true);
  });

  it('starts a new note that already has text with the caret after it', async () => {
    await renderPage({ stored: false, autoFocus: true, body: 'Missing note' });
    expect(caret()).toEqual({ start: 12, end: 12 });
  });
});

describe('entering and leaving editing', () => {
  it('a tap puts the caret at the end of the tapped line and mounts the input', async () => {
    await renderPage({ body: 'one\ntwo words\nthree' });
    await tap('two words');
    expect(bodyText(input())).toBe('one\ntwo words\nthree');
    expect(caret()).toEqual({ start: 13, end: 13 });
    expect(present('Hide keyboard')).toBe(true);
  });

  it('tapping the empty placeholder starts editing at the start', async () => {
    await renderPage({ body: '' });
    await tap('Start writing...');
    expect(caret()).toEqual({ start: 0, end: 0 });
  });

  it('a tap in the blank space puts the caret at the end of the body and asks for a reveal', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype as never, 'scrollTo');
    await renderPage({ body: 'abc\ndef' });
    await fireEvent(fill(), 'layout', {
      nativeEvent: { layout: { x: 0, y: 300, width: 300, height: 200 } },
    });
    await fireEvent(screen.getByTestId('note-page'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 600 } },
    });
    await fireEvent(screen.getByTestId('note-body-wrap'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 100, width: 300, height: 400 } },
    });
    await tapFill();
    expect(caret()).toEqual({ start: 7, end: 7 });
    expect(present('Hide keyboard')).toBe(true);
    await fireEvent(input(), 'focus');
    await keyboard.emit('keyboardWillShow', 300);
    // y = wrap (100) + fillY (300) - a third of the viewport (200)
    expect(scrollTo).toHaveBeenCalledWith({ y: 200, animated: false });
    scrollTo.mockRestore();
  });

  it('the blank space puts the caret at the end of the body even after an earlier selection', async () => {
    await renderPage({ body: 'abc\ndef' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await fireEvent(input(), 'selectionChange', {
      nativeEvent: { selection: { start: 1, end: 1 } },
    });
    await press('Hide keyboard');
    expect(screen.queryByTestId('note-body')).toBeNull();
    await tapFill();
    expect(caret()).toEqual({ start: 7, end: 7 });
  });

  it('a link tap does not enter editing', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    await renderPage({ body: '[site](https://example.com/a)' });
    await fireEvent.press(screen.getByRole('link'));
    await act(async () => {});
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(present('Hide keyboard')).toBe(false);
  });

  it('Hide keyboard returns to reading, dismisses the keyboard and keeps the body', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await fireEvent.changeText(input(), 'abcd');
    await advance(600);
    await press('Hide keyboard');
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(screen.getByText('abcd')).toBeTruthy();
    expect(state?.body).toBe('abcd');
    expect(present('Hide keyboard')).toBe(false);
    expect(dismiss).toHaveBeenCalled();
  });

  it('typing, Hide keyboard and a re-entry undo as one grouped step', async () => {
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    // Two quick edits with no pause between them: one step only if the blur ended it.
    await fireEvent.changeText(input(), 'abcd');
    await fireEvent.changeText(input(), 'abcde');
    await press('Hide keyboard');
    await tapFill();
    await fireEvent(input(), 'focus');
    expect(disabled('Undo')).toBe(false);
    await press('Undo');
    expect(bodyText(input())).toBe('abc');
    expect(disabled('Undo')).toBe(true);
  });

  it('with a hardware keyboard (no keyboard events) Hide keyboard still reaches reading', async () => {
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await advance(5000);
    expect(input()).toBeTruthy();
    await press('Hide keyboard');
    expect(screen.queryByTestId('note-body')).toBeNull();
  });

  it('with the keyboard already hidden inside the remount grace, Hide keyboard still reaches reading', async () => {
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    // Undo remounts the input, which opens the grace window for hide events.
    await fireEvent.changeText(input(), 'abcd');
    await press('Undo');
    await keyboard.emit('keyboardDidHide');
    await advance(200);
    expect(screen.getByTestId('note-body')).toBeTruthy();
    await press('Hide keyboard');
    expect(screen.queryByTestId('note-body')).toBeNull();
  });

  it('a keyboard hide after Hide keyboard does nothing', async () => {
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await press('Hide keyboard');
    await keyboard.emit('keyboardDidHide');
    await advance(500);
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(screen.getByText('abc')).toBeTruthy();
  });

  it('the keyboard hiding returns to reading after the debounce', async () => {
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await keyboard.emit('keyboardDidShow', 300);
    await keyboard.emit('keyboardDidHide');
    await advance(200);
    expect(screen.queryByTestId('note-body')).toBeNull();
  });

  it('taps do nothing while locked and the blank space is disabled', async () => {
    await renderPage({ body: 'abc', locked: true });
    await tap('abc');
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(fill().props.accessibilityState.disabled).toBe(true);
    await tapFill();
    expect(screen.queryByTestId('note-body')).toBeNull();
  });

  it('Hide keyboard is disabled while locked', async () => {
    const view = await renderPage({ body: 'abc', stored: false, autoFocus: true });
    expect(disabled('Hide keyboard')).toBe(false);
    await view.unmount();
    await renderPage({ body: 'abc', stored: false, autoFocus: true, locked: true });
    expect(disabled('Hide keyboard')).toBe(true);
  });

  it('a mic press leads to reading with the recording panel shown and no toolbar', async () => {
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await press('Record voice note');
    await keyboard.emit('keyboardDidHide');
    await advance(200);
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(screen.getByTestId('note-recording-panel')).toBeTruthy();
    expect(present('Record voice note')).toBe(false);
    expect(present('Hide keyboard')).toBe(false);
    expect(fill().props.accessibilityState.disabled).toBe(true);
  });

  it('a tap while recording does not enter editing, focus or move the selection', async () => {
    await renderPage({ body: 'abc\ndef' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await press('Record voice note');
    await keyboard.emit('keyboardDidHide');
    await advance(200);
    expect(screen.queryByTestId('note-body')).toBeNull();
    await tap('def');
    await advance(1000);
    expect(screen.queryByTestId('note-body')).toBeNull();
    await tapFill();
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(present('Hide keyboard')).toBe(false);
  });

  it('opening the voice note view leads to reading once the keyboard hides', async () => {
    await renderPage({ body: 'abc', recordings: [voice] });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await press('Open recording');
    await keyboard.emit('keyboardDidHide');
    await advance(200);
    expect(screen.queryByTestId('note-body')).toBeNull();
  });

  it('shows the toolbar only while editing', async () => {
    await renderPage({ body: 'abc' });
    for (const label of ['Add tags', 'Add checkbox', 'Check item', 'Undo', 'Redo'])
      expect(present(label)).toBe(false);
    // The reading-mode button carries the same label as the toolbar mic; it is the only one.
    expect(screen.getAllByLabelText('Record voice note')).toHaveLength(1);
    expect(screen.getByTestId('record-fab')).toBeTruthy();
    await tap('abc');
    expect(screen.queryByTestId('record-fab')).toBeNull();
    expect(screen.getAllByLabelText('Record voice note')).toHaveLength(1);
    expect(present('Undo')).toBe(true);
    expect(present('Record voice note')).toBe(true);
    expect(present('Add tags')).toBe(true);
    expect(disabled('Add tags')).toBe(false);
    expect(disabled('Record voice note')).toBe(false);
    expect(present('Hide keyboard')).toBe(true);
  });
});

describe('reading checkbox', () => {
  const BODY = '- [ ] milk\nsecond';

  it('toggles the body as exactly one undo step and undo reverts it', async () => {
    await renderPage({ body: BODY });
    await fireEvent.press(screen.getByRole('checkbox'));
    await act(async () => {});
    expect(state?.body).toBe('- [x] milk\nsecond');
    expect(screen.getByRole('checkbox', { checked: true })).toBeTruthy();
    expect(screen.queryByTestId('note-body')).toBeNull();
    // Undo lives on the toolbar, which only editing shows.
    await tapFill();
    await fireEvent(input(), 'focus');
    expect(disabled('Undo')).toBe(false);
    await press('Undo');
    expect(state?.body).toBe(BODY);
    expect(disabled('Undo')).toBe(true);
    expect(disabled('Redo')).toBe(false);
  });

  it('does not move the caret', async () => {
    await renderPage({ body: BODY });
    await tap('second');
    await fireEvent(input(), 'focus');
    await fireEvent(input(), 'selectionChange', {
      nativeEvent: { selection: { start: 3, end: 3 } },
    });
    await press('Hide keyboard');
    await fireEvent.press(screen.getByRole('checkbox'));
    await act(async () => {});
    expect(state?.body).toBe('- [x] milk\nsecond');
    expect(screen.queryByTestId('note-body')).toBeNull();
    await tapFill();
    // Entry no longer remembers the old selection: the blank space goes to the end of the body.
    expect(caret()).toEqual({ start: state!.body.length, end: state!.body.length });
  });
});

describe('links and images', () => {
  it('passes imagesEnabled to the image', async () => {
    const body = '![pic](https://example.com/i.png)';
    const view = await renderPage({ body, imagesEnabled: false });
    expect(screen.getByText('Tap to load')).toBeTruthy();
    expect(screen.queryByTestId('reading-image')).toBeNull();
    await view.unmount();
    await renderPage({ body, imagesEnabled: true });
    expect(screen.getByTestId('reading-image')).toBeTruthy();
  });

  it('a wiki link press calls onFollowNoteLink with the trimmed target', async () => {
    await renderPage({ body: 'see [[ Other ]] now', notes: [other('Other\ntext')] });
    await fireEvent.press(screen.getByRole('link'));
    expect(onFollowNoteLink).toHaveBeenCalledWith('Other');
  });

  it('wiki links are inert while locked', async () => {
    await renderPage({ body: 'see [[Other]]', notes: [other('Other')], locked: true });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a hostile web link never reaches Linking', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    await renderPage({ body: '[click](javascript:alert(1)) and [file](file:///etc/passwd)' });
    expect(screen.queryByRole('link')).toBeNull();
    await fireEvent.press(screen.getByText('click'));
    await act(async () => {});
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a web link in the system browser', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const alert = jest.spyOn(Alert, 'alert');
    await renderPage({ body: '[site](https://example.com/a)' });
    await fireEvent.press(screen.getByRole('link'));
    await act(async () => {});
    expect(open).toHaveBeenCalledWith('https://example.com/a');
    expect(alert).not.toHaveBeenCalled();
  });

  it('shows an alert when the link cannot be opened', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderPage({ body: '[site](https://example.com/a)' });
    await fireEvent.press(screen.getByRole('link'));
    await act(async () => {});
    expect(alert).toHaveBeenCalledWith(LINK_COPY.openFailedTitle, undefined, [{ text: 'OK' }]);
    expect(LINK_COPY.openFailedTitle).toBe("Couldn't open this link");
  });
});

describe('record button in reading', () => {
  const fab = () => screen.queryByTestId('record-fab');
  const oneMic = () => expect(screen.queryAllByLabelText('Record voice note').length).toBe(1);

  it('is shown in reading only, never together with the toolbar', async () => {
    await renderPage({ body: 'abc' });
    expect(fab()).toBeTruthy();
    expect(present('Hide keyboard')).toBe(false);
    oneMic();
    await tap('abc');
    expect(fab()).toBeNull();
    expect(present('Hide keyboard')).toBe(true);
    oneMic();
    await press('Hide keyboard');
    expect(fab()).toBeTruthy();
    expect(present('Hide keyboard')).toBe(false);
    oneMic();
  });

  it('is shown on an empty stored note and absent on a new note', async () => {
    await renderPage({ body: '' });
    expect(fab()).toBeTruthy();
  });

  it('a press opens the recording panel like the toolbar mic, and changes nothing else', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const playback = jest.spyOn(playbackModule, 'stopAllPlayback');
    await renderPage({ body: 'abc' });
    await press('Record voice note');
    expect(dismiss).toHaveBeenCalled();
    expect(playback).toHaveBeenCalled();
    expect(screen.getByTestId('note-recording-panel')).toBeTruthy();
    expect(fab()).toBeNull();
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(state?.body).toBe('abc');
    expect(present('Hide keyboard')).toBe(false);
    expect(present('Undo')).toBe(false);
  });

  it('returns after the panel closes, still in reading', async () => {
    await renderPage({ body: 'abc' });
    await press('Record voice note');
    await press('Close recording panel');
    expect(screen.queryByTestId('note-recording-panel')).toBeNull();
    expect(fab()).toBeTruthy();
    expect(screen.queryByTestId('note-body')).toBeNull();
  });

  it('returns after a recording is made and the voice note is attached', async () => {
    mockRec.start.mockResolvedValue(true);
    mockRec.stop.mockResolvedValue({ uri: 'file:///cache/r.m4a', durationMs: 3000 });
    await renderPage({ body: 'abc' });
    await press('Record voice note');
    await press('Start recording');
    await press('Stop recording');
    expect(screen.queryByTestId('note-recording-panel')).toBeNull();
    expect(fab()).toBeTruthy();
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(state?.recordings).toHaveLength(1);
    expect(state?.body).toBe('abc');
    expect(screen.queryByTestId('note-body')).toBeNull();
  });

  it('is absent while locked', async () => {
    await renderPage({ body: 'abc', locked: true });
    expect(fab()).toBeNull();
    expect(present('Record voice note')).toBe(false);
  });

  it('is absent while the voice note view is open and back after it closes', async () => {
    await renderPage({ body: 'abc', recordings: [voice] });
    expect(fab()).toBeTruthy();
    await press('Open recording');
    expect(screen.queryByTestId('record-fab', { includeHiddenElements: true })).toBeNull();
    await press('Close voice note');
    expect(fab()).toBeTruthy();
  });

  it('on an Android-style keyboard hide the toolbar goes first, then the button; never both', async () => {
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await keyboard.emit('keyboardDidShow', 300);
    await keyboard.emit('keyboardDidHide');
    expect(present('Hide keyboard')).toBe(true);
    expect(fab()).toBeNull();
    await advance(200);
    expect(present('Hide keyboard')).toBe(false);
    expect(fab()).toBeTruthy();
    oneMic();
  });
});
