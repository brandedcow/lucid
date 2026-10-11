import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SwipeActionRow } from './SwipeActionRow';

// A stand-in Swipeable that records close(), to check that disabling an open row closes it.
const mockClose = jest.fn();
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { Component } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: class FakeSwipeable extends Component<{ children?: React.ReactNode }> {
      close = mockClose;
      render() {
        return this.props.children;
      }
    },
  };
});

const props = {
  actions: [{ key: 'delete', label: 'Delete', accessibilityLabel: 'Delete', onPress: jest.fn() }],
  onRowWillOpen: jest.fn(),
  onRowClosed: jest.fn(),
};

describe('SwipeActionRow disabling', () => {
  beforeEach(() => mockClose.mockClear());

  it('closes the row when it becomes disabled', async () => {
    const view = await render(<SwipeActionRow {...props}>{<Text>c</Text>}</SwipeActionRow>);
    expect(mockClose).not.toHaveBeenCalled();
    await view.rerender(
      <SwipeActionRow {...props} disabled>
        {<Text>c</Text>}
      </SwipeActionRow>,
    );
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('does not close an enabled row', async () => {
    const view = await render(<SwipeActionRow {...props}>{<Text>c</Text>}</SwipeActionRow>);
    await view.rerender(<SwipeActionRow {...props}>{<Text>d</Text>}</SwipeActionRow>);
    expect(mockClose).not.toHaveBeenCalled();
  });
});
