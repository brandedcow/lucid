import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import { VoiceAttachmentCard } from './VoiceAttachmentCard';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
let mockStatus = { playing: false, currentTime: 0, duration: 0 };

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
  setAudioModeAsync: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = { playing: false, currentTime: 0, duration: 0 };
});

const PEAKS = [0.2, 0.9, 0.5, 0.7];
const filled = () =>
  screen
    .getAllByTestId('wave-bar')
    .map((bar) => StyleSheet.flatten(bar.props.style).backgroundColor === colors.accent);

describe('VoiceAttachmentCard', () => {
  it('shows the length at rest and plays from the button', async () => {
    await render(<VoiceAttachmentCard uri="file:///a.m4a" durationMs={34000} waveform={PEAKS} />);
    expect(screen.getByText('0:34')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Play recording'));
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('shows Pause and elapsed / total while playing, and pauses', async () => {
    mockStatus = { playing: true, currentTime: 12.4, duration: 34 };
    await render(<VoiceAttachmentCard uri="file:///a.m4a" durationMs={34000} waveform={PEAKS} />);
    expect(screen.getByText('0:12 / 0:34')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Pause recording'));
    });
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('draws one bar per peak, none filled before playback', async () => {
    await render(<VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />);
    expect(filled()).toEqual([false, false, false, false]);
  });

  it('fills bars left to right as playback advances', async () => {
    const view = await render(
      <VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />,
    );
    mockStatus = { playing: true, currentTime: 2, duration: 4 };
    await view.rerender(
      <VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />,
    );
    expect(filled()).toEqual([true, true, false, false]);
    expect(screen.getByLabelText('Recording position').props.accessibilityValue).toMatchObject({
      now: 50,
    });
    mockStatus = { playing: false, currentTime: 4, duration: 4 };
    await view.rerender(
      <VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />,
    );
    expect(filled()).toEqual([true, true, true, true]);
  });

  it('makes taller bars for louder peaks', async () => {
    await render(<VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />);
    const heights = screen
      .getAllByTestId('wave-bar')
      .map((bar) => StyleSheet.flatten(bar.props.style).height as number);
    expect(heights[1]).toBeGreaterThan(heights[0]);
  });

  it.each([
    ['missing', undefined],
    ['invalid', [5, 'x'] as unknown as number[]],
    ['empty', []],
  ])('falls back to a plain progress bar when the waveform is %s', async (_n, waveform) => {
    mockStatus = { playing: true, currentTime: 1, duration: 4 };
    await render(<VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={waveform} />);
    expect(screen.queryAllByTestId('wave-bar')).toHaveLength(0);
    expect(StyleSheet.flatten(screen.getByTestId('progress-fill').props.style).width).toBe('25%');
    expect(screen.getByLabelText('Recording position')).toBeTruthy();
  });

  it('has a close button only when it can be removed, and reports the tap', async () => {
    const onRemove = jest.fn();
    const view = await render(
      <VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />,
    );
    expect(screen.queryByLabelText('Remove recording')).toBeNull();
    await view.rerender(
      <VoiceAttachmentCard
        uri="file:///a.m4a"
        durationMs={4000}
        waveform={PEAKS}
        onRemove={onRemove}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Remove recording'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('labels its parts for screen readers', async () => {
    await render(<VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />);
    expect(screen.getByRole('button', { name: 'Play recording' })).toBeTruthy();
    expect(screen.getByRole('adjustable', { name: 'Recording position' })).toBeTruthy();
  });

  it('stops playback when the card is removed', async () => {
    const view = await render(
      <VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />,
    );
    await view.unmount();
    expect(mockPlayer.pause).toHaveBeenCalled();
  });
});

describe('VoiceAttachmentCard seeking', () => {
  const press = (x: number) =>
    fireEvent.press(screen.getByTestId('seek-press'), { nativeEvent: { locationX: x } });
  const measure = () =>
    fireEvent(screen.getByTestId('seek-press'), 'layout', {
      nativeEvent: { layout: { width: 200, height: 40 } },
    });

  it('a tap on the waveform of a paused note seeks and does not play', async () => {
    mockStatus = { playing: false, currentTime: 0, duration: 4 };
    await render(<VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />);
    await measure();
    await act(async () => press(100));
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(2);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('a tap on a note with no waveform seeks the plain bar', async () => {
    mockStatus = { playing: false, currentTime: 0, duration: 4 };
    await render(<VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} />);
    await measure();
    await act(async () => press(50));
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(1);
  });

  it('a tap before the length is known waits and uses the stored length', async () => {
    const view = await render(
      <VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />,
    );
    await measure();
    await act(async () => press(100));
    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
    expect(filled()).toEqual([true, true, false, false]);
    mockStatus = { playing: false, currentTime: 0, duration: 4 };
    await view.rerender(
      <VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />,
    );
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(2);
  });

  it('is blocked while play is disabled', async () => {
    mockStatus = { playing: false, currentTime: 0, duration: 4 };
    await render(
      <VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} playDisabled />,
    );
    await measure();
    await act(async () => press(100));
    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  });

  it('names its position for screen readers and steps with increment and decrement', async () => {
    mockStatus = { playing: false, currentTime: 12, duration: 48 };
    await render(
      <VoiceAttachmentCard
        uri="file:///a.m4a"
        durationMs={48000}
        waveform={PEAKS}
        index={2}
        count={3}
      />,
    );
    const bar = screen.getByLabelText('Position of voice note 2 of 3');
    expect(bar.props.accessibilityRole).toBe('adjustable');
    expect(bar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 25,
      text: '0:12 of 0:48',
    });
    await act(async () =>
      bar.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }),
    );
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(17);
    await act(async () =>
      bar.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }),
    );
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(7);
  });

  const drag = async () => {
    await fireEvent(screen.getByTestId('seek-press'), 'layout', {
      nativeEvent: { layout: { width: 200, height: 40 } },
    });
    const bar = screen.getByTestId('seek-bar');
    const t = (x: number, n: number) => ({
      nativeEvent: { locationX: x, touches: [{}], changedTouches: [{}], timestamp: n },
      touchHistory: {
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: n,
        numberActiveTouches: 1,
        touchBank: [
          {
            touchActive: true,
            startPageX: 20,
            startPageY: 0,
            startTimeStamp: 0,
            currentPageX: x,
            currentPageY: 0,
            currentTimeStamp: n,
            previousPageX: n === 1 ? 20 : 50,
            previousPageY: 0,
            previousTimeStamp: n - 1,
          },
        ],
      },
    });
    await act(async () => bar.props.onResponderGrant(t(50, 1)));
    await act(async () => bar.props.onResponderMove(t(100, 2)));
  };

  it('shows m:ss / m:ss following the finger during a drag', async () => {
    mockStatus = { playing: true, currentTime: 1, duration: 4 };
    await render(<VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />);
    expect(screen.getByText('0:01 / 0:04')).toBeTruthy();
    await drag();
    expect(screen.getByText('0:02 / 0:04')).toBeTruthy();
  });
});
