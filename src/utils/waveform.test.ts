import {
  MAX_WAVEFORM_LENGTH,
  WAVEFORM_BARS,
  downsamplePeaks,
  isValidWaveform,
  sanitizeWaveform,
} from './waveform';

describe('isValidWaveform', () => {
  it('accepts a list of numbers from 0 to 1', () => {
    expect(isValidWaveform([0, 0.5, 1])).toBe(true);
    expect(isValidWaveform(Array(MAX_WAVEFORM_LENGTH).fill(0.2))).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'abc'],
    ['an object', { 0: 1 }],
    ['an empty list', []],
    ['a too long list', Array(MAX_WAVEFORM_LENGTH + 1).fill(0.1)],
    ['a string item', [0.1, '0.2']],
    ['NaN', [0.1, NaN]],
    ['Infinity', [Infinity]],
    ['a negative value', [-0.1]],
    ['a value above 1', [1.1]],
    ['a null item', [0.1, null]],
  ])('rejects %s', (_name, value) => {
    expect(isValidWaveform(value)).toBe(false);
  });
});

describe('sanitizeWaveform', () => {
  it('keeps a valid waveform and drops an invalid one', () => {
    expect(sanitizeWaveform([0.1, 0.2])).toEqual([0.1, 0.2]);
    expect(sanitizeWaveform([2])).toBeUndefined();
    expect(sanitizeWaveform('x')).toBeUndefined();
  });
});

describe('downsamplePeaks', () => {
  it('returns undefined for no samples', () => {
    expect(downsamplePeaks([])).toBeUndefined();
  });

  it('takes the loudest sample of each slice', () => {
    expect(downsamplePeaks([0.1, 0.9, 0.2, 0.3, 0.8, 0.4], 3)).toEqual([0.9, 0.3, 0.8]);
  });

  it('stretches a short recording to the full bar count', () => {
    const peaks = downsamplePeaks([0.2, 0.6]) ?? [];
    expect(peaks).toHaveLength(WAVEFORM_BARS);
    expect(peaks.slice(0, WAVEFORM_BARS / 2).every((p) => p === 0.2)).toBe(true);
    expect(peaks.slice(WAVEFORM_BARS / 2).every((p) => p === 0.6)).toBe(true);
  });

  it('clamps to 0..1 and treats bad samples as silence, and the result is always valid', () => {
    const peaks = downsamplePeaks([5, -3, NaN], 3);
    expect(peaks).toEqual([1, 0, 0]);
    expect(
      isValidWaveform(downsamplePeaks(Array.from({ length: 1234 }, (_, i) => (i % 7) / 7))),
    ).toBe(true);
  });
});
