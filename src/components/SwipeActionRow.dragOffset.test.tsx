import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { CLOSED_DRAG_OFFSET, OPEN_DRAG_OFFSET, SwipeActionRow } from './SwipeActionRow';

// A stand-in Swipeable that records the props the row passes, so the drag offset can be read.
type Fake = {
  props: {
    dragOffsetFromLeftEdge?: number;
    onSwipeableWillOpen?: () => void;
    onSwipeableClose?: () => void;
  };
};
const mockRows: Fake[] = [];
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { Component } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: class FakeSwipeable extends Component<{ children?: React.ReactNode }> {
      constructor(props: never) {
        super(props);
        mockRows.push(this as unknown as Fake);
      }
      close = () => {};
      render() {
        return this.props.children;
      }
    },
  };
});

describe('SwipeActionRow drag offset', () => {
  beforeEach(() => (mockRows.length = 0));

  it('ignores a rightward drag while closed and takes it once revealed', async () => {
    await render(
      <SwipeActionRow actions={[]} onRowWillOpen={jest.fn()} onRowClosed={jest.fn()}>
        <Text>content</Text>
      </SwipeActionRow>,
    );
    const row = mockRows[0];
    expect(row.props.dragOffsetFromLeftEdge).toBe(CLOSED_DRAG_OFFSET);
    expect(CLOSED_DRAG_OFFSET).toBeGreaterThan(1000);
    await act(async () => row.props.onSwipeableWillOpen?.());
    expect(row.props.dragOffsetFromLeftEdge).toBe(OPEN_DRAG_OFFSET);
    expect(OPEN_DRAG_OFFSET).toBe(10);
    await act(async () => row.props.onSwipeableClose?.());
    expect(row.props.dragOffsetFromLeftEdge).toBe(CLOSED_DRAG_OFFSET);
  });
});
