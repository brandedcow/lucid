import { Alert, Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen } from './SettingsScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

async function setup(autoOpenNewNote = true, onlineTranscription = false) {
  const onChange = jest.fn();
  const onChangeOnline = jest.fn();
  const onBack = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SettingsScreen
        autoOpenNewNote={autoOpenNewNote}
        onChangeAutoOpenNewNote={onChange}
        onlineTranscription={onlineTranscription}
        onChangeOnlineTranscription={onChangeOnline}
        onBack={onBack}
      />
    </SafeAreaProvider>,
  );
  return { onChange, onChangeOnline, onBack };
}

describe('SettingsScreen', () => {
  it('shows the title, label and helper line', async () => {
    await setup();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Open a new note on launch')).toBeTruthy();
    expect(screen.getByText('When off, the app opens to the note list.')).toBeTruthy();
  });

  it('reflects the prop on the switch', async () => {
    await setup(true);
    expect(screen.getByRole('switch', { name: 'Open a new note on launch' }).props.value).toBe(
      true,
    );
    await screen.unmount();
    await setup(false);
    expect(screen.getByRole('switch', { name: 'Open a new note on launch' }).props.value).toBe(
      false,
    );
  });

  it('exposes switch role, checked state and label', async () => {
    await setup(true);
    const sw = screen.getByRole('switch', { name: 'Open a new note on launch' });
    expect(sw.props.accessibilityState).toEqual({ checked: true });
    expect(sw.props.accessibilityLabel).toBe('Open a new note on launch');
  });

  it('calls the callback with the new value when toggled', async () => {
    const { onChange } = await setup(true);
    await fireEvent(
      screen.getByRole('switch', { name: 'Open a new note on launch' }),
      'valueChange',
      false,
    );
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('back arrow fires onBack', async () => {
    const { onBack } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to notes' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  describe('online transcription row', () => {
    const LABEL = 'Transcribe voice notes online';
    let alert: jest.SpyInstance;
    beforeEach(() => {
      alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });
    afterEach(() => alert.mockRestore());
    const os = (value: 'ios' | 'android') => {
      const r = jest.replaceProperty(Platform, 'OS', value);
      return () => r.restore();
    };
    const buttons = () => alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];

    it('shows the label and the helper, naming Apple on iOS and Google on Android', async () => {
      let restore = os('ios');
      await setup();
      expect(screen.getByText(LABEL)).toBeTruthy();
      expect(screen.getByText(/sent to Apple to be transcribed/)).toBeTruthy();
      restore();
      await screen.unmount();
      restore = os('android');
      await setup();
      expect(screen.getByText(/sent to Google to be transcribed/)).toBeTruthy();
      restore();
    });

    it('exposes switch role, label and checked state', async () => {
      await setup(true, false);
      const sw = screen.getByRole('switch', { name: LABEL });
      expect(sw.props.accessibilityState).toEqual({ checked: false });
      expect(sw.props.value).toBe(false);
      await screen.unmount();
      await setup(true, true);
      expect(screen.getByRole('switch', { name: LABEL }).props.accessibilityState).toEqual({
        checked: true,
      });
    });

    it('turning ON asks first, naming the provider, and saves nothing until Turn on', async () => {
      const restore = os('ios');
      const { onChangeOnline } = await setup(true, false);
      await fireEvent(screen.getByRole('switch', { name: LABEL }), 'valueChange', true);
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert.mock.calls[0][0]).toBe('Allow online transcription?');
      expect(alert.mock.calls[0][1]).toMatch(/Apple's speech service/);
      expect(buttons().map((b) => b.text)).toEqual(['Cancel', 'Turn on']);
      expect(onChangeOnline).not.toHaveBeenCalled();
      buttons()[1].onPress?.();
      expect(onChangeOnline).toHaveBeenCalledTimes(1);
      expect(onChangeOnline).toHaveBeenCalledWith(true);
      restore();
    });

    it('Cancel leaves it off and calls nothing', async () => {
      const { onChangeOnline } = await setup(true, false);
      await fireEvent(screen.getByRole('switch', { name: LABEL }), 'valueChange', true);
      expect(buttons()[0].onPress).toBeUndefined();
      expect(onChangeOnline).not.toHaveBeenCalled();
    });

    it('names Google on Android', async () => {
      const restore = os('android');
      try {
        await setup(true, false);
        await fireEvent(screen.getByLabelText(LABEL), 'valueChange', true);
        expect(alert.mock.calls[0][1]).toMatch(/Google's speech service/);
      } finally {
        restore();
      }
    });

    it('turning OFF is immediate with no Alert', async () => {
      const { onChangeOnline } = await setup(true, true);
      await fireEvent(screen.getByRole('switch', { name: LABEL }), 'valueChange', false);
      expect(alert).not.toHaveBeenCalled();
      expect(onChangeOnline).toHaveBeenCalledWith(false);
    });
  });
});
