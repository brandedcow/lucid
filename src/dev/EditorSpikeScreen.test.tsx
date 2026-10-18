import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { bodyText } from '../test/bodyText';
import { colors } from '../theme';
import { EditorSpikeScreen, SPIKE_SEED, sizedBody } from './EditorSpikeScreen';

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 800 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => (
      <actual.SafeAreaProvider initialMetrics={metrics}>{children}</actual.SafeAreaProvider>
    ),
  };
});

const body = () => screen.getByTestId('spike-body');

describe('EditorSpikeScreen', () => {
  it('renders the seed text, with headings sized at the full level', async () => {
    await render(<EditorSpikeScreen />);
    expect(bodyText(body())).toBe(SPIKE_SEED);
    expect(screen.getByText('Heading one').props.style).toMatchObject({ fontSize: 25.5 });
  });

  it('switching the style level restyles without losing text', async () => {
    await render(<EditorSpikeScreen />);
    await fireEvent.changeText(body(), 'typed # **x**');
    for (const level of ['basic', 'tagsOnly', 'none', 'full']) {
      await fireEvent.press(screen.getByText(level));
      expect(bodyText(body())).toBe('typed # **x**');
    }
    await fireEvent.press(screen.getByText('none'));
    expect(screen.queryByText('x')).toBeNull();
  });

  it('size presets load a body of that size', async () => {
    await render(<EditorSpikeScreen />);
    await fireEvent.press(screen.getByText('5k'));
    expect(bodyText(body())).toBe(sizedBody('5k'));
    expect(sizedBody('5k').length).toBeGreaterThanOrEqual(5000);
    expect(sizedBody('300 lines').split('\n')).toHaveLength(300);
  });

  it('the checkbox button labels follow the caret line and toggle it', async () => {
    await render(<EditorSpikeScreen />);
    await fireEvent.changeText(body(), '- [ ] task');
    await fireEvent(body(), 'selectionChange', {
      nativeEvent: { selection: { start: 8, end: 8 } },
    });
    await fireEvent.press(screen.getByLabelText('Check item'));
    expect(bodyText(body())).toBe('- [x] task');
    expect(screen.getByLabelText('Uncheck item')).toBeTruthy();
    expect(colors.text).toBeDefined();
  });

  it('logs changes', async () => {
    await render(<EditorSpikeScreen />);
    await act(async () => {});
    await fireEvent.changeText(body(), 'abc');
    expect(screen.getByText(/change typing len=3/)).toBeTruthy();
  });
});
