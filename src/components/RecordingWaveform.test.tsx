import { render, screen } from '@testing-library/react-native';
import { RECORDING_WAVEFORM_BARS, RecordingWaveform } from './RecordingWaveform';

describe('RecordingWaveform', () => {
  it('is a flat dotted line when idle, even if levels are passed', async () => {
    await render(<RecordingWaveform recording={false} levels={[0.9, 0.5]} />);
    expect(screen.getByTestId('recording-waveform-idle')).toBeTruthy();
    expect(screen.getAllByTestId('idle-dot')).toHaveLength(RECORDING_WAVEFORM_BARS);
    expect(screen.queryByTestId('live-bar')).toBeNull();
  });

  it('draws red bars scaled by the newest levels while recording, padded with minimum bars', async () => {
    await render(<RecordingWaveform recording levels={[0.5, 1]} />);
    const bars = screen.getAllByTestId('live-bar');
    expect(bars).toHaveLength(RECORDING_WAVEFORM_BARS);
    const heights = bars.map((b) => (b.props.style as { height: number }[]).flat().at(-1)?.height);
    expect(heights.at(-1)).toBe(48);
    expect(heights.at(-2)).toBe(24);
    expect(heights[0]).toBe(3);
  });

  it('keeps only the newest bars and clamps bad values', async () => {
    const levels = [...Array(60).fill(0.1), Number.NaN, 5, -1];
    await render(<RecordingWaveform recording levels={levels} />);
    const heights = screen
      .getAllByTestId('live-bar')
      .map((b) => (b.props.style as { height: number }[]).flat().at(-1)?.height);
    expect(heights).toHaveLength(RECORDING_WAVEFORM_BARS);
    expect(heights.slice(-3)).toEqual([3, 48, 3]);
  });
});
