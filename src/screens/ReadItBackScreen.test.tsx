import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ComponentProps } from 'react';
import { Keyboard, Platform } from 'react-native';
import { BUILT_IN_JOURNALS } from '../utils/journals';
import { ReadItBackScreen } from './ReadItBackScreen';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
}));

const audio = { uri: 'file:///cache/r.m4a', durationMs: 4000 };

async function setup(props: Partial<ComponentProps<typeof ReadItBackScreen>> = {}) {
  const onChangeText = jest.fn();
  const onContinue = jest.fn();
  const onBack = jest.fn();
  await render(
    <ReadItBackScreen
      text=""
      onChangeText={onChangeText}
      autoFocus={false}
      onContinue={onContinue}
      onBack={onBack}
      date="Tuesday, October 6"
      {...props}
    />,
  );
  return { onChangeText, onContinue, onBack };
}

describe('ReadItBackScreen', () => {
  it('shows the heading and the text it is given', async () => {
    await setup({ text: 'I was flying' });
    expect(screen.getByLabelText('Dream text').props.value).toBe('I was flying');
  });

  it('reports edits through onChangeText', async () => {
    const { onChangeText } = await setup({ text: 'a' });
    await fireEvent.changeText(screen.getByLabelText('Dream text'), 'ab');
    expect(onChangeText).toHaveBeenCalledWith('ab');
  });

  it('disables Continue for blank text with no audio', async () => {
    const { onContinue } = await setup({ text: '  \n' });
    await fireEvent.press(screen.getByText('Continue'));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('enables Continue for non-blank text', async () => {
    const { onContinue } = await setup({ text: 'x' });
    await fireEvent.press(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('enables Continue with audio even when the text is empty, and shows the player', async () => {
    const { onContinue } = await setup({ audio });
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('has no player without audio', async () => {
    await setup({ text: 'x' });
    expect(screen.queryByLabelText('Play recording')).toBeNull();
  });

  it('passes autoFocus to the text box', async () => {
    await setup({ autoFocus: true });
    expect(screen.getByLabelText('Dream text').props.autoFocus).toBe(true);
  });

  it('calls onBack from the back arrow', async () => {
    const { onBack } = await setup();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows the heading, subtitle and dated header', async () => {
    await setup();
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(
      screen.getByText('Fix anything that came out wrong, and add what comes back to you.'),
    ).toBeTruthy();
    expect(screen.getByText('Dream · Tuesday, October 6')).toBeTruthy();
  });

  it('shows a placeholder when the text is empty', async () => {
    await setup({ audio });
    expect(screen.getByPlaceholderText('Type what you remember')).toBeTruthy();
  });

  it('labels the recording card with its length', async () => {
    await setup({ audio });
    expect(screen.getByText('Original recording · 0:04 · always kept')).toBeTruthy();
  });

  it('hides the recording card while the keyboard is showing', async () => {
    const handlers: Record<string, () => void> = {};
    const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      handlers[event] = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    await setup({ audio });
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    // jest-expo runs as iOS, so the will-show/will-hide events are the ones used.
    await act(async () => handlers.keyboardWillShow());
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    await act(async () => handlers.keyboardWillHide());
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    add.mockRestore();
  });

  it('hides the recording card when mounted while the keyboard is already showing', async () => {
    const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    await setup({ audio });
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    visible.mockRestore();
  });

  it('uses the did-show and did-hide events on Android', async () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    const handlers: Record<string, () => void> = {};
    const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      handlers[event] = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    try {
      await setup({ audio });
      expect(Object.keys(handlers).sort()).toEqual(['keyboardDidHide', 'keyboardDidShow']);
      await act(async () => handlers.keyboardDidShow());
      expect(screen.queryByLabelText('Play recording')).toBeNull();
      await act(async () => handlers.keyboardDidHide());
      expect(screen.getByLabelText('Play recording')).toBeTruthy();
    } finally {
      add.mockRestore();
      Platform.OS = original;
    }
  });

  it('removes its keyboard listeners when it unmounts', async () => {
    // KeyboardAvoidingView listens too, so only this screen's show/hide events are checked.
    const removers: Record<string, jest.Mock> = {};
    const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string) => {
      removers[event] = jest.fn();
      return { remove: removers[event] };
    }) as unknown as typeof Keyboard.addListener);
    const view = await render(
      <ReadItBackScreen
        text=""
        onChangeText={jest.fn()}
        autoFocus={false}
        onContinue={jest.fn()}
        onBack={jest.fn()}
        date="Tuesday, October 6"
      />,
    );
    expect(removers.keyboardWillShow).toBeDefined();
    expect(removers.keyboardWillHide).toBeDefined();
    expect(removers.keyboardWillShow).not.toHaveBeenCalled();
    await view.unmount();
    expect(removers.keyboardWillShow).toHaveBeenCalledTimes(1);
    expect(removers.keyboardWillHide).toHaveBeenCalledTimes(1);
    add.mockRestore();
  });

  it('dismisses the keyboard on Continue', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const { onContinue } = await setup({ text: 'x' });
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it('shows "Hide keyboard" only while the keyboard is showing, and it dismisses the keyboard', async () => {
    const handlers: Record<string, () => void> = {};
    const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      handlers[event] = handler;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await setup({ audio });
    expect(screen.queryByRole('button', { name: 'Hide keyboard' })).toBeNull();
    await act(async () => handlers.keyboardWillShow());
    const button = screen.getByRole('button', { name: 'Hide keyboard' });
    expect(button.props.style).toEqual(expect.objectContaining({ minHeight: 44 }));
    await fireEvent.press(button);
    expect(dismiss).toHaveBeenCalledTimes(1);
    await act(async () => handlers.keyboardWillHide());
    expect(screen.queryByRole('button', { name: 'Hide keyboard' })).toBeNull();
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    add.mockRestore();
    dismiss.mockRestore();
  });
});

describe('ReadItBackScreen for the Life journal', () => {
  const LIFE = BUILT_IN_JOURNALS[1];

  it('shows "Life · date" with no title', async () => {
    await setup({ journal: LIFE, text: 'hi' });
    expect(screen.getByText('Life · Tuesday, October 6')).toBeTruthy();
    expect(screen.queryByText(/dream/i)).toBeNull();
    expect(screen.getByLabelText('Entry text')).toBeTruthy();
  });

  it('keeps "Dream · date" for Dreams', async () => {
    await setup();
    expect(screen.getByText('Dream · Tuesday, October 6')).toBeTruthy();
    expect(screen.getByLabelText('Dream text')).toBeTruthy();
  });
});
