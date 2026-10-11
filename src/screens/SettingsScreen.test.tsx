import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen } from './SettingsScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

async function setup(autoOpenDreamCapture = true) {
  const onChange = jest.fn();
  const onBack = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SettingsScreen
        autoOpenDreamCapture={autoOpenDreamCapture}
        onChangeAutoOpenDreamCapture={onChange}
        onBack={onBack}
      />
    </SafeAreaProvider>,
  );
  return { onChange, onBack };
}

describe('SettingsScreen', () => {
  it('shows the title, label and helper line', async () => {
    await setup();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Open dream capture on launch')).toBeTruthy();
    expect(screen.getByText('When off, the app opens to Today.')).toBeTruthy();
  });

  it('reflects the prop on the switch', async () => {
    await setup(true);
    expect(screen.getByRole('switch', { name: 'Open dream capture on launch' }).props.value).toBe(
      true,
    );
    await screen.unmount();
    await setup(false);
    expect(screen.getByRole('switch', { name: 'Open dream capture on launch' }).props.value).toBe(
      false,
    );
  });

  it('exposes switch role, checked state and label', async () => {
    await setup(true);
    const sw = screen.getByRole('switch', { name: 'Open dream capture on launch' });
    expect(sw.props.accessibilityState).toEqual({ checked: true });
    expect(sw.props.accessibilityLabel).toBe('Open dream capture on launch');
  });

  it('calls the callback with the new value when toggled', async () => {
    const { onChange } = await setup(true);
    await fireEvent(screen.getByRole('switch'), 'valueChange', false);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('back arrow fires onBack', async () => {
    const { onBack } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Today' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
