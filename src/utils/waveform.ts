/** How many bars a recording's waveform has. */
export const WAVEFORM_BARS = 56;
/** The most peaks a stored waveform may hold; anything longer is treated as damaged. */
export const MAX_WAVEFORM_LENGTH = 128;

/**
 * True for a usable stored waveform: a non-empty array of at most MAX_WAVEFORM_LENGTH finite
 * numbers, each between 0 and 1. Anything else (a string, a ragged array, NaN, out-of-range
 * values) is not.
 */
export function isValidWaveform(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_WAVEFORM_LENGTH &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)
  );
}

/** The waveform when it is valid, otherwise undefined (an invalid one is dropped, never repaired). */
export function sanitizeWaveform(value: unknown): number[] | undefined {
  return isValidWaveform(value) ? value : undefined;
}

/**
 * Reduces level samples (0..1, taken at a steady rate while recording) to `bars` peaks: each bar
 * is the loudest sample in its slice, so a short recording is stretched and a long one squeezed.
 * Samples are clamped to 0..1 and non-numbers count as 0. Returns undefined when there are no
 * samples.
 */
export function downsamplePeaks(
  samples: readonly number[],
  bars = WAVEFORM_BARS,
): number[] | undefined {
  if (samples.length === 0 || bars < 1) return undefined;
  const clean = samples.map((s) => (Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 0));
  const peaks: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.min(clean.length - 1, Math.floor((i * clean.length) / bars));
    const end = Math.max(start + 1, Math.floor(((i + 1) * clean.length) / bars));
    let peak = 0;
    for (let k = start; k < end && k < clean.length; k++) peak = Math.max(peak, clean[k]);
    peaks.push(Math.round(peak * 1000) / 1000);
  }
  return peaks;
}
