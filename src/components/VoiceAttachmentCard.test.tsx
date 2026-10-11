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
    expect(screen.getByLabelText('Recording progress').props.accessibilityValue).toMatchObject({
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
    expect(screen.getByLabelText('Recording progress')).toBeTruthy();
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
    expect(screen.getByRole('progressbar', { name: 'Recording progress' })).toBeTruthy();
  });

  it('stops playback when the card is removed', async () => {
    const view = await render(
      <VoiceAttachmentCard uri="file:///a.m4a" durationMs={4000} waveform={PEAKS} />,
    );
    await view.unmount();
    expect(mockPlayer.pause).toHaveBeenCalled();
  });
});
