import { fireEvent, render, screen } from '@testing-library/react-native';
import { IdleView } from './IdleView';

const props = { onStart: jest.fn(), onSkip: jest.fn(), onWrite: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe('IdleView back arrow', () => {
  it('renders no arrow without onBack', async () => {
    await render(<IdleView {...props} />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders one arrow labelled Back by default and calls onBack', async () => {
    const onBack = jest.fn();
    await render(<IdleView {...props} onBack={onBack} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('←')).toHaveLength(1);
  });

  it('uses a custom label', async () => {
    await render(<IdleView {...props} onBack={jest.fn()} backLabel="No dream, go to Today" />);
    expect(screen.getByRole('button', { name: 'No dream, go to Today' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});
