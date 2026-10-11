import { useEffect } from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { VoiceAttachmentCard } from '../components/VoiceAttachmentCard';
import { stopAllPlayback, useRecordingPlayback } from './useRecordingPlayback';

let mockStatus = { playing: false, currentTime: 0, duration: 0 };

// One distinct fake player per uri, as the real hook creates one per card.
const players: Record<string, { play: jest.Mock; pause: jest.Mock; seekTo: jest.Mock }> = {};
jest.mock('expo-audio', () => ({
  useAudioPlayer: (uri: string) => {
    players[uri] ??= { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
    return players[uri];
  },
  useAudioPlayerStatus: () => mockStatus,
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
  mockStatus = { playing: false, currentTime: 0, duration: 0 };
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
    expect(screen.getByLabelText('Position of voice note 2 of 2')).toBeTruthy();
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

describe('seeking and scrubbing', () => {
  type Result = ReturnType<typeof useRecordingPlayback>;
  const latest: { current: Result | null } = { current: null };
  const hook = new Proxy({} as Result, {
    get: (_t, key) => latest.current![key as keyof Result],
  });
  const Harness = ({ ms = 4000, disabled = false }: { ms?: number; disabled?: boolean }) => {
    const value = useRecordingPlayback(A, ms, disabled);
    useEffect(() => {
      latest.current = value;
    });
    return null;
  };
  const run = (fn: () => void | Promise<void>) => act(async () => void (await fn()));
  const loaded = { playing: false, currentTime: 0, duration: 4 };

  it('seekTo seeks to the fraction of the length, clamped just under the end', async () => {
    mockStatus = loaded;
    await render(<Harness />);
    await run(() => hook.seekTo(0.25));
    expect(players[A].seekTo).toHaveBeenLastCalledWith(1);
    await run(() => hook.seekTo(0.5));
    expect(players[A].seekTo).toHaveBeenLastCalledWith(2);
    await run(() => hook.seekTo(1));
    expect(players[A].seekTo).toHaveBeenLastCalledWith(3.95);
    await run(() => hook.seekTo(-1));
    expect(players[A].seekTo).toHaveBeenLastCalledWith(0);
  });

  it('a seek never plays and never registers the card as active', async () => {
    mockStatus = loaded;
    await render(<Harness />);
    await run(() => hook.seekTo(0.5));
    expect(players[A].play).not.toHaveBeenCalled();
    // Nothing is registered, so stopping all playback does not touch this card.
    stopAllPlayback();
    expect(players[A].pause).not.toHaveBeenCalled();
  });

  it('before the length is known the seek waits, shows its position, and applies later', async () => {
    const view = await render(<Harness />);
    await run(() => hook.seekTo(0.5));
    expect(players[A].seekTo).not.toHaveBeenCalled();
    expect(hook.displayProgress).toBe(0.5);
    mockStatus = { playing: false, currentTime: 0, duration: 8 };
    await view.rerender(<Harness />);
    expect(players[A].seekTo).toHaveBeenCalledTimes(1);
    expect(players[A].seekTo).toHaveBeenCalledWith(4);
    expect(hook.displayProgress).toBe(0);
  });

  it('a drag previews locally and seeks once, on release', async () => {
    mockStatus = loaded;
    await render(<Harness />);
    await run(() => hook.scrub.begin(0.1));
    expect(hook.scrubbing).toBe(true);
    await run(() => hook.scrub.update(0.5));
    await run(() => hook.scrub.update(0.75));
    expect(hook.displayProgress).toBe(0.75);
    expect(hook.displayPosition).toBe(3);
    expect(players[A].seekTo).not.toHaveBeenCalled();
    await run(() => hook.scrub.end(0.75));
    expect(players[A].seekTo).toHaveBeenCalledTimes(1);
    expect(players[A].seekTo).toHaveBeenCalledWith(3);
    expect(hook.scrubbing).toBe(false);
    expect(players[A].play).not.toHaveBeenCalled();
  });

  it('a drag on a playing note pauses it and resumes it on release', async () => {
    mockStatus = { playing: true, currentTime: 1, duration: 4 };
    await render(<Harness />);
    await run(() => hook.scrub.begin(0.25));
    expect(players[A].pause).toHaveBeenCalledTimes(1);
    await run(() => hook.scrub.end(0.5));
    expect(players[A].seekTo).toHaveBeenCalledWith(2);
    expect(players[A].play).toHaveBeenCalledTimes(1);
    expect(players[A].seekTo.mock.invocationCallOrder[0]).toBeLessThan(
      players[A].play.mock.invocationCallOrder[0],
    );
  });

  it('resuming after a drag goes through the coordinator and pauses another card', async () => {
    await render(<Cards />);
    await play('Play voice note 2 of 2');
    expect(players[B].play).toHaveBeenCalledTimes(1);
    mockStatus = { playing: true, currentTime: 0, duration: 1 };
    await render(<Harness ms={1000} />);
    await run(() => hook.scrub.begin(0));
    await run(() => hook.scrub.end(0.5));
    expect(players[B].pause).toHaveBeenCalledTimes(1);
    expect(players[A].play).toHaveBeenCalledTimes(1);
  });

  it('a cancelled drag does not seek and resumes a playing note', async () => {
    mockStatus = { playing: true, currentTime: 1, duration: 4 };
    await render(<Harness />);
    await run(() => hook.scrub.begin(0.25));
    await run(() => hook.scrub.cancel());
    expect(players[A].seekTo).not.toHaveBeenCalled();
    expect(players[A].play).toHaveBeenCalledTimes(1);
    expect(hook.scrubbing).toBe(false);
  });

  it('seekBy steps by seconds and clamps', async () => {
    mockStatus = { playing: false, currentTime: 1, duration: 8 };
    await render(<Harness ms={8000} />);
    await run(() => hook.seekBy(5));
    expect(players[A].seekTo).toHaveBeenLastCalledWith(6);
    await run(() => hook.seekBy(-5));
    expect(players[A].seekTo).toHaveBeenLastCalledWith(0);
  });

  it('a disabled card cannot be scrubbed or seeked', async () => {
    mockStatus = loaded;
    await render(<Harness disabled />);
    await run(() => hook.scrub.begin(0.5));
    expect(hook.scrubbing).toBe(false);
    await run(() => hook.scrub.end(0.5));
    await run(() => hook.seekTo(0.5));
    await run(() => hook.seekBy(5));
    expect(players[A].seekTo).not.toHaveBeenCalled();
  });

  it('a recording starting mid-drag (disabled) does not resume on release or cancel', async () => {
    mockStatus = { playing: true, currentTime: 1, duration: 4 };
    const view = await render(<Harness />);
    await run(() => hook.scrub.begin(0.25));
    await view.rerender(<Harness disabled />);
    await run(() => hook.scrub.end(0.5));
    expect(players[A].play).not.toHaveBeenCalled();
    await run(() => hook.scrub.begin(0.25));
    await run(() => hook.scrub.cancel());
    expect(players[A].play).not.toHaveBeenCalled();
  });

  it('unmounting in the middle of a drag does not throw or play', async () => {
    mockStatus = { playing: true, currentTime: 1, duration: 4 };
    const view = await render(<Harness />);
    await run(() => hook.scrub.begin(0.5));
    const scrub = hook.scrub;
    await view.unmount();
    expect(() => {
      scrub.end(0.5);
      scrub.cancel();
    }).not.toThrow();
    expect(players[A].play).not.toHaveBeenCalled();
  });
});
