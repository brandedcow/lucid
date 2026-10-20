import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
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

  describe('drawer swipe', () => {
    it('is not handled here: the page has no responder of its own (NotesRoute owns the drag)', async () => {
      await setup();
      const props = screen.getByTestId('note-list-screen').props;
      expect(props.onMoveShouldSetResponderCapture).toBeUndefined();
      expect(props.onResponderRelease).toBeUndefined();
    });

    it('moves screen-reader focus back to the menu button when the drawer closes', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- the namespace import is a copy
      jest.spyOn(require('react-native'), 'findNodeHandle').mockReturnValue(7);
      const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation();
      const props = {
        title: 'All Notes',
        notes: [note(1)] as Note[] | null,
        now: NOW,
        indexStatus: 'ok' as const,
        emptyKind: { kind: 'all' } as const,
        onOpenNote: jest.fn(),
        onNewNote: jest.fn(),
        onOpenMenu: jest.fn(),
      };
      const ui = (open: boolean) => (
        <SafeAreaProvider initialMetrics={METRICS}>
          <NoteListScreen {...props} drawerOpen={open} />
        </SafeAreaProvider>
      );
      const view = await render(ui(false));
      await view.rerender(ui(true));
      expect(focus).not.toHaveBeenCalled();
      await view.rerender(ui(false));
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledWith(7);
      jest.restoreAllMocks();
    });
  });

  it('while searching, the search header replaces the title row and the panel is drawn over the list', async () => {
    await setup({
      searchHeader: <Text>the-field</Text>,
      searchPanel: <Text>the-results</Text>,
    });
    expect(screen.getByText('the-field')).toBeTruthy();
    expect(screen.getByText('the-results')).toBeTruthy();
    expect(screen.queryByLabelText('Open menu')).toBeNull();
    expect(screen.queryByRole('header', { name: 'All Notes' })).toBeNull();
    // The list stays mounted underneath but is hidden from screen readers.
    expect(screen.getByTestId('note-list', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('note-list')).toBeNull();
    expect(screen.getByLabelText('New note')).toBeTruthy();
  });

  it('without a search header it shows the menu button and title, and no panel', async () => {
    await setup({ searchPanel: <Text>the-results</Text> });
    expect(screen.getByLabelText('Open menu')).toBeTruthy();
    expect(screen.queryByText('the-results')).toBeNull();
  });
});
