import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Note } from '../services/notesStorage';
import { NoteListScreen } from './NoteListScreen';

// A stand-in Swipeable that renders the actions and records every instance, so tests can open and
// close rows by hand. The real Swipeable inside a FlatList is NOT exercised here (device check).
type Fake = {
  closeCount: number;
  open: () => void;
  props: { onSwipeableWillOpen?: () => void };
};
const mockRows: Fake[] = [];
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { Component } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: class FakeSwipeable extends Component<{
      children?: React.ReactNode;
      renderRightActions?: () => React.ReactNode;
      onSwipeableWillOpen?: () => void;
      onSwipeableClose?: () => void;
    }> {
      closeCount = 0;
      constructor(props: never) {
        super(props);
        mockRows.push(this as unknown as Fake);
      }
      open = () => this.props.onSwipeableWillOpen?.();
      close = () => {
        this.closeCount += 1;
        this.props.onSwipeableClose?.();
      };
      render() {
        return (
          <>
            {this.props.children}
            {this.props.renderRightActions?.()}
          </>
        );
      }
    },
  };
});

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
const hidden = { includeHiddenElements: true };

type Props = Partial<React.ComponentProps<typeof NoteListScreen>>;
function tree(over: Props = {}) {
  const props = {
    title: 'All Notes',
    notes: [note(1), note(2, { pinned: true })] as Note[],
    now: NOW,
    indexStatus: 'ok' as const,
    emptyKind: { kind: 'all' } as const,
    onOpenNote: jest.fn(),
    onNewNote: jest.fn(),
    onOpenMenu: jest.fn(),
    onPinNote: jest.fn(),
    onDeleteNote: jest.fn(),
    ...over,
  };
  return {
    props,
    ui: (
      <SafeAreaProvider initialMetrics={METRICS}>
        <NoteListScreen {...props} />
      </SafeAreaProvider>
    ),
  };
}

describe('NoteListScreen swipe', () => {
  beforeEach(() => (mockRows.length = 0));

  it('has no swipe actions without both handlers', async () => {
    const { ui } = tree({ onPinNote: undefined });
    await render(ui);
    expect(screen.queryByLabelText('Delete note', hidden)).toBeNull();
    expect(mockRows).toHaveLength(0);
  });

  it('pins, unpins and deletes by id', async () => {
    const { props, ui } = tree();
    await render(ui);
    const pins = screen.getAllByLabelText(/^(Pin|Unpin) note$/, hidden);
    expect(pins).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText('Pin note', hidden));
    expect(props.onPinNote).toHaveBeenCalledWith('n1', true);
    await fireEvent.press(screen.getByLabelText('Unpin note', hidden));
    expect(props.onPinNote).toHaveBeenCalledWith('n2', false);
    await fireEvent.press(screen.getAllByLabelText('Delete note', hidden)[1]);
    expect(props.onDeleteNote).toHaveBeenCalledWith('n2');
  });

  it('keeps one row open: opening a second closes the first', async () => {
    const { ui } = tree();
    await render(ui);
    await act(async () => {
      mockRows[0].open();
    });
    await act(async () => {
      mockRows[1].open();
    });
    expect(mockRows[0].closeCount).toBe(1);
    expect(mockRows[1].closeCount).toBe(0);
  });

  it('closes the open row when the list starts scrolling', async () => {
    const { ui } = tree();
    await render(ui);
    await act(async () => {
      mockRows[0].open();
    });
    await fireEvent(screen.getByTestId('note-list'), 'scrollBeginDrag');
    expect(mockRows[0].closeCount).toBe(1);
  });

  it('closes the open row when a note is opened', async () => {
    const { props, ui } = tree();
    await render(ui);
    await act(async () => {
      mockRows[0].open();
    });
    await fireEvent.press(screen.getByRole('button', { name: /^Note 1\./ }));
    expect(mockRows[0].closeCount).toBe(1);
    expect(props.onOpenNote).toHaveBeenCalledWith('n1');
  });

  it('closes the open row and goes inert when the drawer opens', async () => {
    const { props, ui } = tree();
    const view = await render(ui);
    await act(async () => {
      mockRows[0].open();
    });
    const next = tree({ ...props, drawerOpen: true });
    await view.rerender(next.ui);
    expect(mockRows[0].closeCount).toBeGreaterThanOrEqual(1);
    await fireEvent.press(screen.getAllByLabelText('Delete note', hidden)[0]);
    expect(props.onDeleteNote).not.toHaveBeenCalled();
  });

  it('is inert while swipeDisabled', async () => {
    const { props, ui } = tree({ swipeDisabled: true });
    await render(ui);
    await fireEvent.press(screen.getAllByLabelText('Delete note', hidden)[0]);
    await fireEvent.press(screen.getByLabelText('Pin note', hidden));
    expect(props.onDeleteNote).not.toHaveBeenCalled();
    expect(props.onPinNote).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /^Note 1\./ }).props.accessibilityActions,
    ).toBeUndefined();
  });

  it('exposes screen-reader actions on rows', async () => {
    const { props, ui } = tree();
    await render(ui);
    const btn = screen.getByRole('button', { name: /^Note 1\./ });
    await fireEvent(btn, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(props.onDeleteNote).toHaveBeenCalledWith('n1');
  });
});
