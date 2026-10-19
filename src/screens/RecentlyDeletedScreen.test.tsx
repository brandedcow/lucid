import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Note } from '../services/notesStorage';
import { RecentlyDeletedScreen } from './RecentlyDeletedScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};
const NOW = new Date(2026, 9, 18, 12, 0, 0);
const iso = (h: number) => new Date(2026, 9, 18, h, 0, 0).toISOString();

const note = (id: string, body: string, over: Partial<Note> = {}): Note => ({
  id,
  createdAt: iso(1),
  updatedAt: iso(1),
  deletedAt: iso(10),
  body,
  ...over,
});

type Over = Partial<React.ComponentProps<typeof RecentlyDeletedScreen>>;
async function show(over: Over = {}) {
  const props = {
    notes: [note('a', 'Alpha\ntext'), note('b', 'Beta\ntext')] as Note[] | null,
    now: NOW,
    indexStatus: 'ok' as const,
    busy: false,
    notice: null,
    onBack: jest.fn(),
    onRestore: jest.fn(),
    onDeleteForever: jest.fn(),
    onEmpty: jest.fn(),
    ...over,
  };
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <RecentlyDeletedScreen {...props} />
    </SafeAreaProvider>,
  );
  return props;
}

describe('RecentlyDeletedScreen', () => {
  it('shows the title as a header and the rows in the given order', async () => {
    await show();
    expect(screen.getByRole('header', { name: 'Recently Deleted' })).toBeTruthy();
    const titles = screen.getAllByText(/^(Alpha|Beta)$/).map((n) => n.props.children);
    expect(titles).toEqual(['Alpha', 'Beta']);
  });

  it('shows nothing while loading', async () => {
    await show({ notes: null });
    expect(screen.queryByTestId('deleted-list')).toBeNull();
    expect(screen.queryByText('Deleted notes will appear here.')).toBeNull();
  });

  it('shows the empty text and hint, and disables Empty', async () => {
    const p = await show({ notes: [] });
    expect(screen.getByText('Deleted notes will appear here.')).toBeTruthy();
    expect(screen.getByText('They stay here until you delete them forever.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Empty Recently Deleted'));
    expect(p.onEmpty).not.toHaveBeenCalled();
  });

  it('unreadable shows the message and disables every action', async () => {
    const p = await show({ indexStatus: 'unreadable' });
    expect(screen.getByText('Your notes could not be read. Nothing was changed.')).toBeTruthy();
    expect(screen.queryByLabelText('Restore Alpha')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Empty Recently Deleted'));
    expect(p.onEmpty).not.toHaveBeenCalled();
  });

  it('busy disables Empty and the row buttons', async () => {
    const p = await show({ busy: true });
    await fireEvent.press(screen.getByLabelText('Empty Recently Deleted'));
    await fireEvent.press(screen.getByLabelText('Restore Alpha'));
    await fireEvent.press(screen.getByLabelText('Delete Alpha forever'));
    expect(p.onEmpty).not.toHaveBeenCalled();
    expect(p.onRestore).not.toHaveBeenCalled();
    expect(p.onDeleteForever).not.toHaveBeenCalled();
  });

  it('renders the notice in a polite live region', async () => {
    await show({ notice: 'Restored' });
    const line = screen.getByText('Restored');
    expect(line.parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  it('has no notice line when null', async () => {
    await show();
    expect(screen.queryByText('Restored')).toBeNull();
  });

  it('wires back, restore, delete forever and empty', async () => {
    const p = await show();
    await fireEvent.press(screen.getByLabelText('Back to notes'));
    await fireEvent.press(screen.getByLabelText('Restore Beta'));
    await fireEvent.press(screen.getByLabelText('Delete Alpha forever'));
    await fireEvent.press(screen.getByLabelText('Empty Recently Deleted'));
    expect(p.onBack).toHaveBeenCalledTimes(1);
    expect(p.onRestore).toHaveBeenCalledWith('b');
    expect(p.onDeleteForever).toHaveBeenCalledWith('a');
    expect(p.onEmpty).toHaveBeenCalledTimes(1);
  });

  it('renders a large list without error', async () => {
    const many = Array.from({ length: 300 }, (_, i) => note(`n${i}`, `Note ${i}\nbody`));
    await show({ notes: many });
    expect(screen.getByTestId('deleted-list')).toBeTruthy();
    expect(screen.getByText('Note 0')).toBeTruthy();
  });
});
