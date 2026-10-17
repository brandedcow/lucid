import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { WaveformIcon } from './WaveformIcon';

describe('WaveformIcon', () => {
  it('draws five bars in the given color', async () => {
    await render(<WaveformIcon color="#123456" />);
    expect(screen.getByTestId('waveform-icon')).toBeTruthy();
    const bars = screen.getAllByTestId('waveform-bar');
    expect(bars).toHaveLength(5);
    for (const bar of bars)
      expect(StyleSheet.flatten(bar.props.style).backgroundColor).toBe('#123456');
  });

  it('scales bar heights with size', async () => {
    await render(<WaveformIcon color="#000" size={56} />);
    const heights = screen
      .getAllByTestId('waveform-bar')
      .map((b) => StyleSheet.flatten(b.props.style).height);
    expect(heights).toEqual([16, 32, 48, 28, 16]);
  });
});
