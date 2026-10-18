import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RecentlyDeletedScreen } from './RecentlyDeletedScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

describe('RecentlyDeletedScreen (stub)', () => {
  it('shows the title as a header and the placeholder line', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <RecentlyDeletedScreen onBack={jest.fn()} />
      </SafeAreaProvider>,
    );
    expect(screen.getByRole('header', { name: 'Recently Deleted' })).toBeTruthy();
    expect(screen.getByText('Deleted notes will appear here.')).toBeTruthy();
  });

  it('the back arrow calls onBack', async () => {
    const onBack = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <RecentlyDeletedScreen onBack={onBack} />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByLabelText('Back to notes'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
