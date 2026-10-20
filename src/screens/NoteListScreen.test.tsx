import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PanResponder, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Note } from '../services/notesStorage';
import { NoteListScreen } from './NoteListScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};
const NOW = new Date('2026-10-18T12:00:00');
const note = (i: number, over: Partial<Note> = {}): Note => ({
  id: `n${i}`,
  createdAt: '2026-10-18T09:00:00',
  updatedAt: '2026-10-18T09:00:00',
  body: `Note ${i}\nBody ${i}`,
  ...over,
});

type Props = Partial<React.ComponentProps<typeof NoteListScreen>>;
async function setup(over: Props = {}) {
  const props = {
    title: 'All Notes',
    notes: [note(1), note(2)] as Note[] | null,
    now: NOW,
    indexStatus: 'ok' as const,
    emptyKind: { kind: 'all' } as const,
    onOpenNote: jest.fn(),
    onNewNote: jest.fn(),
    onOpenMenu: jest.fn(),
    ...over,
  };
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NoteListScreen {...props} />
    </SafeAreaProvider>,
  );
  return props;
}

describe('NoteListScreen', () => {
  it('shows the view title as the page header', async () => {
    await setup({ title: '#dreams' });
    expect(screen.getByRole('header', { name: '#dreams' })).toBeTruthy();
  });

  it('lists the notes and opens one by id', async () => {
    const p = await setup();
    expect(screen.getByText('Note 1')).toBeTruthy();
    expect(screen.getByText('Body 2')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Note 2\./ }));
    expect(p.onOpenNote).toHaveBeenCalledWith('n2');
  });

  it('shows nothing, not an empty text, while loading', async () => {
    await setup({ notes: null });
    expect(screen.queryByText('No notes yet.')).toBeNull();
    expect(screen.queryByTestId('note-list')).toBeNull();
  });

  it.each([
    [{ kind: 'all' }, 'No notes yet.'],
    [{ kind: 'today' }, 'Nothing written or edited today.'],
    [{ kind: 'todo' }, 'No notes with checkboxes.'],
    [{ kind: 'untagged' }, 'No untagged notes.'],
    [{ kind: 'pinned' }, 'No pinned notes.'],
    [{ kind: 'tag', tag: 'sea' }, 'No notes with #sea.'],
  ] as const)('shows the empty text for %j', async (emptyKind, text) => {
    await setup({ notes: [], emptyKind });
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('adds the hint line for an empty All Notes only', async () => {
    await setup({ notes: [] });
    expect(screen.getByText('Tap + to write one.')).toBeTruthy();
  });

  it('replaces the list with the unreadable message', async () => {
    await setup({ indexStatus: 'unreadable' });
    expect(screen.getByText('Your notes could not be read. Nothing was changed.')).toBeTruthy();
    expect(screen.queryByText('Note 1')).toBeNull();
  });

  it('shows the working notice as a polite live region', async () => {
    await setup({ migrationNotice: { kind: 'working' } });
    const line = screen.getByText('Bringing in your earlier notes...');
    expect(line).toBeTruthy();
    expect(screen.getByText('Note 1')).toBeTruthy();
  });

  it('shows a dismissible info notice', async () => {
    const onDismiss = jest.fn();
    await setup({
      migrationNotice: { kind: 'info', text: '3 earlier notes were brought in.', onDismiss },
    });
    expect(screen.getByText('3 earlier notes were brought in.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows a retry notice with Try again', async () => {
    const onRetry = jest.fn();
    await setup({
      migrationNotice: { kind: 'retry', text: "Couldn't bring in your earlier notes.", onRetry },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('new note button calls onNewNote and can be disabled', async () => {
    const p = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'New note' }));
    expect(p.onNewNote).toHaveBeenCalledTimes(1);
  });

  it('disables the new note button', async () => {
    const p = await setup({ newNoteDisabled: true });
    await fireEvent.press(screen.getByRole('button', { name: 'New note' }));
    expect(p.onNewNote).not.toHaveBeenCalled();
  });

  it('menu button opens the menu', async () => {
    const p = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Open menu' }));
    expect(p.onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it('renders the right slot', async () => {
    await setup({ rightSlot: <Text>slot</Text> });
    expect(screen.getByText('slot')).toBeTruthy();
  });

  it('hides the list from screen readers while the drawer is open', async () => {
    await setup({ drawerOpen: true });
    const hidden = screen.getByTestId('note-list-screen').props.children;
    expect(JSON.stringify(screen.toJSON())).toContain(
      '"importantForAccessibility":"no-hide-descendants"',
    );
    expect(hidden).toBeTruthy();
  });

  it('renders a large list without rendering every row', async () => {
    const notes = Array.from({ length: 500 }, (_, i) => note(i));
    await setup({ notes });
    expect(screen.getByText('Note 0')).toBeTruthy();
    expect(screen.queryByText('Note 499')).toBeNull();
  });

  describe('left-edge swipe', () => {
    let handlers: {
      onMoveShouldSetPanResponderCapture?: (e: unknown, g: unknown) => boolean;
      onPanResponderRelease?: (e: unknown, g: unknown) => void;
    };
    beforeEach(() => {
      const real = PanResponder.create;
      jest.spyOn(PanResponder, 'create').mockImplementation((cfg) => {
        handlers = cfg as never;
        return real(cfg);
      });
    });
    afterEach(() => jest.restoreAllMocks());

    it('opens the menu when the swipe starts at the edge and goes far enough', async () => {
      const p = await setup();
      const move = { x0: 5, dx: 30, dy: 0 };
      expect(handlers.onMoveShouldSetPanResponderCapture?.({}, move)).toBe(true);
      await act(async () => handlers.onPanResponderRelease?.({}, { dx: 50 }));
      expect(p.onOpenMenu).toHaveBeenCalledTimes(1);
    });

    it('ignores a swipe that does not start at the edge or is too short', async () => {
      const p = await setup();
      expect(handlers.onMoveShouldSetPanResponderCapture?.({}, { x0: 100, dx: 30, dy: 0 })).toBe(
        false,
      );
      await act(async () => handlers.onPanResponderRelease?.({}, { dx: 20 }));
      expect(p.onOpenMenu).not.toHaveBeenCalled();
    });

    it('is off while the drawer is open', async () => {
      const p = await setup({ drawerOpen: true });
      expect(handlers.onMoveShouldSetPanResponderCapture?.({}, { x0: 5, dx: 30, dy: 0 })).toBe(
        false,
      );
      await act(async () => handlers.onPanResponderRelease?.({}, { dx: 80 }));
      expect(p.onOpenMenu).not.toHaveBeenCalled();
    });
  });
});
