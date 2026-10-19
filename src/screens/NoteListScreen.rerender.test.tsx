import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Note } from '../services/notesStorage';
import { NoteListScreen } from './NoteListScreen';

const mockRowRenders = jest.fn();
jest.mock('../components/NoteRow', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    NoteRow: (p: { row: { id: string } }) => {
      mockRowRenders(p.row.id);
      return <Text>{`row-${p.row.id}`}</Text>;
    },
  };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};
const NOW = new Date('2026-10-18T12:00:00');
const notes: Note[] = [1, 2, 3].map((i) => ({
  id: `n${i}`,
  createdAt: '2026-10-18T09:00:00',
  updatedAt: '2026-10-18T09:00:00',
  body: `Note ${i}`,
}));
const fns = { onOpenNote: jest.fn(), onNewNote: jest.fn(), onOpenMenu: jest.fn() };
const ui = (over: Partial<React.ComponentProps<typeof NoteListScreen>> = {}) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <NoteListScreen
      title="All Notes"
      notes={notes}
      now={NOW}
      indexStatus="ok"
      emptyKind={{ kind: 'all' }}
      {...fns}
      {...over}
    />
  </SafeAreaProvider>
);

describe('NoteListScreen re-rendering', () => {
  beforeEach(() => mockRowRenders.mockClear());

  it('re-rendering with the same data, clock and flags does not re-render the rows', async () => {
    const view = await render(ui());
    expect(screen.getByText('row-n1')).toBeTruthy();
    const first = mockRowRenders.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    await view.rerender(ui({ title: 'Other title' }));
    expect(mockRowRenders.mock.calls.length).toBe(first);
  });

  it('a new clock value does re-render the rows', async () => {
    const view = await render(ui());
    const first = mockRowRenders.mock.calls.length;
    await view.rerender(ui({ now: new Date('2026-10-18T12:01:00') }));
    expect(mockRowRenders.mock.calls.length).toBeGreaterThan(first);
  });
});
