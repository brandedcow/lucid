import { relativeTime } from './relativeTime';

const now = new Date(2026, 9, 18, 12, 0, 0).getTime();
const ago = (ms: number) => relativeTime(now - ms, now);
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe('relativeTime', () => {
  it.each([
    [0, 'Just now'],
    [999, 'Just now'],
    [1 * S, '1 second ago'],
    [2 * S, '2 seconds ago'],
    [59 * S, '59 seconds ago'],
    [60 * S, '1 minute ago'],
    [37 * M, '37 minutes ago'],
    [59 * M + 59 * S, '59 minutes ago'],
    [60 * M, '1 hour ago'],
    [5 * H, '5 hours ago'],
    [23 * H + 59 * M, '23 hours ago'],
    [24 * H, '1 day ago'],
    [3 * D, '3 days ago'],
    [6 * D + 23 * H, '6 days ago'],
  ])('%i ms ago is %s', (ms, label) => {
    expect(ago(ms)).toBe(label);
  });

  it('shows a short date from 7 days on', () => {
    expect(ago(7 * D)).toBe('Oct 11');
  });

  it('adds the year when it differs from now', () => {
    expect(relativeTime(new Date(2025, 8, 23, 9), now)).toBe('Sep 23, 2025');
  });

  it('says Just now for a time in the future', () => {
    expect(relativeTime(now + 5 * M, now)).toBe('Just now');
  });

  it('accepts Date, ISO string and number for either argument', () => {
    const t = now - 5 * M;
    expect(relativeTime(new Date(t), new Date(now))).toBe('5 minutes ago');
    expect(relativeTime(new Date(t).toISOString(), now)).toBe('5 minutes ago');
  });

  it('gives an empty string for invalid input', () => {
    expect(relativeTime('nope', now)).toBe('');
    expect(relativeTime(now, NaN)).toBe('');
  });
});
