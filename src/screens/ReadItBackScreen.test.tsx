import { fireEvent, render, screen } from '@testing-library/react-native';
import { ComponentProps } from 'react';
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
    expect(screen.getByText('Read it back')).toBeTruthy();
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
});
