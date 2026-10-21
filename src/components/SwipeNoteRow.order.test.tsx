import { fireEvent, render, screen } from '@testing-library/react-native';
import { NoteRowData } from '../utils/noteRow';
import { SwipeNoteRow } from './SwipeNoteRow';

// A stand-in Swipeable that records close(), to check the order: close first, then the callback.
const mockCalls: string[] = [];
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { Component } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: class FakeSwipeable extends Component<{
      children?: React.ReactNode;
      renderRightActions?: () => React.ReactNode;
    }> {
      close = () => mockCalls.push('close');
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

const row: NoteRowData = {
  id: 'n1',
  title: 'Flying',
  preview: '',
  tags: [],
  tagLine: '',
  voiceCount: 0,
  pinned: false,
  time: '',
  a11yLabel: 'Flying.',
};

describe('SwipeNoteRow action order', () => {
  beforeEach(() => (mockCalls.length = 0));
  const setup = () =>
    render(
      <SwipeNoteRow
        row={row}
        onOpen={jest.fn()}
        onPin={() => mockCalls.push('pin')}
        onDelete={() => mockCalls.push('delete')}
        onRowWillOpen={jest.fn()}
        onRowClosed={jest.fn()}
      />,
    );

  it('closes the row before Delete', async () => {
    await setup();
    await fireEvent.press(screen.getByLabelText('Delete note', { includeHiddenElements: true }));
    expect(mockCalls).toEqual(['close', 'delete']);
  });

  it('closes the row before Pin', async () => {
    await setup();
    await fireEvent.press(screen.getByLabelText('Pin note', { includeHiddenElements: true }));
    expect(mockCalls).toEqual(['close', 'pin']);
  });

  const hidden = { includeHiddenElements: true };
  const LABEL = 'Flying.';
  const setupWith = async (over: Partial<NoteRowData>, disabled = false) => {
    const p = { onPin: jest.fn(), onDelete: jest.fn() };
    await render(
      <SwipeNoteRow
        row={{ ...row, ...over }}
        onOpen={jest.fn()}
        disabled={disabled}
        onRowWillOpen={jest.fn()}
        onRowClosed={jest.fn()}
        {...p}
      />,
    );
    return p;
  };

  it('exposes Pin and Delete as screen-reader actions and runs them', async () => {
    const p = await setupWith({});
    const btn = screen.getByLabelText(LABEL, hidden);
    expect(btn.props.accessibilityActions).toEqual([
      { name: 'pin', label: 'Pin' },
      { name: 'delete', label: 'Delete' },
    ]);
    await fireEvent(btn, 'accessibilityAction', { nativeEvent: { actionName: 'pin' } });
    expect(p.onPin).toHaveBeenCalledWith('n1', true);
    await fireEvent(btn, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(p.onDelete).toHaveBeenCalledWith('n1');
  });

  it('names the screen-reader action Unpin for a pinned note', async () => {
    await setupWith({ pinned: true });
    const btn = screen.getByLabelText(LABEL, hidden);
    expect(btn.props.accessibilityActions[0]).toEqual({ name: 'pin', label: 'Unpin' });
  });

  it('is inert when disabled: no actions fire and no screen-reader actions', async () => {
    const p = await setupWith({}, true);
    await fireEvent.press(screen.getByLabelText('Delete note', hidden));
    await fireEvent.press(screen.getByLabelText('Pin note', hidden));
    expect(p.onDelete).not.toHaveBeenCalled();
    expect(p.onPin).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL, hidden).props.accessibilityActions).toBeUndefined();
  });
});
