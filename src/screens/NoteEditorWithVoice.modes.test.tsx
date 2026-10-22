import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect, useReducer } from 'react';
import { Alert, Keyboard, Linking } from 'react-native';
import { NoteSession, newSession, noteSessionReducer } from '../hooks/noteSessionState';
import type { Note } from '../services/notesStorage';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { bodyText } from '../test/bodyText';
import { LINK_COPY, NoteEditorWithVoice } from './NoteEditorWithVoice';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }),
}));
jest.mock('../hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    start: jest.fn(),
    stop: jest.fn(),
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
        attachRecording: () => 'x',
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
  state = null;
  keyboard = fakeKeyboard();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('opening', () => {
  it('shows a stored note in the reading view with no text input', async () => {
    await renderPage({ body: 'Title\nsome text' });
    expect(screen.getByText('some text')).toBeTruthy();
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(screen.queryByLabelText('Note text')).toBeNull();
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('opens a new note in editing', async () => {
    await renderPage({ stored: false, autoFocus: true });
    expect(input()).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
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
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('tapping the empty placeholder starts editing at the start', async () => {
    await renderPage({ body: '' });
    await tap('Start writing...');
    expect(caret()).toEqual({ start: 0, end: 0 });
  });

  it('Edit puts the caret at the end of the body when none is known', async () => {
    await renderPage({ body: 'abc\ndef' });
    await press('Edit note');
    expect(caret()).toEqual({ start: 7, end: 7 });
    expect(screen.getByLabelText('Done editing')).toBeTruthy();
  });

  it('Edit returns the caret to the last known selection', async () => {
    await renderPage({ body: 'abc\ndef' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await fireEvent(input(), 'selectionChange', {
      nativeEvent: { selection: { start: 1, end: 1 } },
    });
    await press('Done editing');
    expect(screen.queryByTestId('note-body')).toBeNull();
    await press('Edit note');
    expect(caret()).toEqual({ start: 1, end: 1 });
  });

  it('Done returns to reading and dismisses the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await press('Done editing');
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(dismiss).toHaveBeenCalled();
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

  it('taps and Edit do nothing while locked', async () => {
    await renderPage({ body: 'abc', locked: true });
    await tap('abc');
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(disabled('Edit note')).toBe(true);
  });

  it('a mic press leads to reading once the keyboard hides', async () => {
    await renderPage({ body: 'abc' });
    await tap('abc');
    await fireEvent(input(), 'focus');
    await press('Record voice note');
    await keyboard.emit('keyboardDidHide');
    await advance(200);
    expect(screen.queryByTestId('note-body')).toBeNull();
    expect(disabled('Edit note')).toBe(true);
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

  it('hides the tag bar in reading and disables the # and checkbox buttons', async () => {
    await renderPage({ body: 'abc' });
    expect(disabled('Add tags')).toBe(true);
    expect(disabled('Add checkbox')).toBe(true);
    expect(disabled('Undo')).toBe(true);
    await tap('abc');
    expect(disabled('Add tags')).toBe(false);
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
    await press('Done editing');
    await fireEvent.press(screen.getByRole('checkbox'));
    await act(async () => {});
    expect(state?.body).toBe('- [x] milk\nsecond');
    await press('Edit note');
    expect(caret()).toEqual({ start: 3, end: 3 });
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
