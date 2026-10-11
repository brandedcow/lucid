import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { VoiceAttachmentCard } from '../components/VoiceAttachmentCard';
import { stopAllPlayback } from './useRecordingPlayback';

// One distinct fake player per uri, as the real hook creates one per card.
const players: Record<string, { play: jest.Mock; pause: jest.Mock; seekTo: jest.Mock }> = {};
jest.mock('expo-audio', () => ({
  useAudioPlayer: (uri: string) => {
    players[uri] ??= { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
    return players[uri];
  },
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
}));

const A = 'file:///a.m4a';
const B = 'file:///b.m4a';

const Cards = ({ both = true }: { both?: boolean }) => (
  <>
    <VoiceAttachmentCard uri={A} durationMs={1000} index={1} count={2} onRemove={() => {}} />
    {both && <VoiceAttachmentCard uri={B} durationMs={2000} index={2} count={2} />}
  </>
);
const play = (label: string) =>
  act(async () => {
    fireEvent.press(screen.getByLabelText(label));
  });

beforeEach(() => {
  for (const k of Object.keys(players)) delete players[k];
  stopAllPlayback();
});

describe('one recording plays at a time', () => {
  it('starting card 2 pauses card 1, and card 1 is not paused by its own start', async () => {
    await render(<Cards />);
    await play('Play voice note 1 of 2');
    expect(players[A].play).toHaveBeenCalledTimes(1);
    expect(players[A].pause).not.toHaveBeenCalled();
    await play('Play voice note 2 of 2');
    expect(players[A].pause).toHaveBeenCalledTimes(1);
    expect(players[B].play).toHaveBeenCalledTimes(1);
    expect(players[B].pause).not.toHaveBeenCalled();
  });

  it('stopAllPlayback pauses the playing card', async () => {
    await render(<Cards />);
    await play('Play voice note 2 of 2');
    stopAllPlayback();
    expect(players[B].pause).toHaveBeenCalledTimes(1);
    expect(players[A].pause).not.toHaveBeenCalled();
  });

  it('a card that goes away stops its playback and is not paused again later', async () => {
    const view = await render(<Cards />);
    await play('Play voice note 1 of 2');
    await view.rerender(<Cards both={false} />);
    await view.unmount();
    expect(players[A].pause).toHaveBeenCalled();
    const calls = players[A].pause.mock.calls.length;
    stopAllPlayback();
    expect(players[A].pause.mock.calls.length).toBe(calls);
  });

  it('labels cards by place, and the close button too', async () => {
    await render(<Cards />);
    expect(screen.getByLabelText('Play voice note 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Play voice note 2 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Remove voice note 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Progress of voice note 2 of 2')).toBeTruthy();
  });
});

describe('playback guards', () => {
  it('a disabled card does not play, and plays again when re-enabled', async () => {
    const view = await render(<VoiceAttachmentCard uri={A} durationMs={1000} playDisabled />);
    expect(screen.getByLabelText('Play recording').props.accessibilityState.disabled).toBe(true);
    await play('Play recording');
    expect(players[A].play).not.toHaveBeenCalled();
    await view.rerender(<VoiceAttachmentCard uri={A} durationMs={1000} />);
    expect(screen.getByLabelText('Play recording').props.accessibilityState.disabled).toBe(false);
    await play('Play recording');
    expect(players[A].play).toHaveBeenCalledTimes(1);
  });

  it('a card unmounted while play was pending never plays', async () => {
    const audio = jest.requireMock('expo-audio');
    let release: () => void = () => {};
    audio.setAudioModeAsync.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const view = await render(<Cards />);
    const button = screen.getByLabelText('Play voice note 1 of 2');
    await act(async () => {
      fireEvent.press(button);
    });
    await view.unmount();
    await act(async () => {
      release();
    });
    expect(players[A].play).not.toHaveBeenCalled();
  });

  it('going to the background pauses the playing card', async () => {
    let handler: (s: string) => void = () => {};
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, h) => {
      handler = h as (s: string) => void;
      return { remove: jest.fn() } as never;
    });
    await render(<Cards />);
    await play('Play voice note 1 of 2');
    await act(async () => handler('background'));
    expect(players[A].pause).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
