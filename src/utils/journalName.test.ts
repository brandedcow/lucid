import { validateJournalName, normalizeJournalName, JOURNAL_NAME_MAX } from './journalName';
import { BUILT_IN_JOURNALS } from './journals';

const mine = [{ id: 'j_a', name: 'Gratitude' }];
const all = [...BUILT_IN_JOURNALS, ...mine];

describe('normalizeJournalName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeJournalName('  Big \t  ideas \n ')).toBe('Big ideas');
  });
});

describe('validateJournalName', () => {
  it('accepts and returns the normalized name', () => {
    expect(validateJournalName('  Work   log ', all)).toEqual({ ok: true, name: 'Work log' });
  });
  it.each(['', '   ', '\n\t'])('rejects empty %j', (raw) => {
    expect(validateJournalName(raw, all)).toEqual({ ok: false, reason: 'empty' });
  });
  it('allows exactly the maximum length and rejects one more', () => {
    expect(validateJournalName('a'.repeat(JOURNAL_NAME_MAX), all).ok).toBe(true);
    expect(validateJournalName('a'.repeat(JOURNAL_NAME_MAX + 1), all)).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });
  it('measures length after normalization', () => {
    expect(validateJournalName(`  ${'a'.repeat(JOURNAL_NAME_MAX)}  `, all).ok).toBe(true);
    expect(validateJournalName('a  b', [])).toEqual({ ok: true, name: 'a b' });
  });
  it('rejects duplicates case-insensitively, including built-in names', () => {
    for (const raw of ['gratitude', 'GRATITUDE ', 'dreams', 'LIFE', ' Life ']) {
      expect(validateJournalName(raw, all)).toEqual({ ok: false, reason: 'duplicate' });
    }
  });
  it('counts characters, not UTF-16 units', () => {
    const emoji = '\u{1F319}';
    expect(validateJournalName(emoji.repeat(JOURNAL_NAME_MAX), []).ok).toBe(true);
    expect(validateJournalName(emoji.repeat(JOURNAL_NAME_MAX + 1), [])).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });
  it('treats names differing only by inner whitespace as duplicates', () => {
    expect(validateJournalName('Big   ideas', [{ id: 'j_b', name: 'big ideas' }])).toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });
  it('skips the excluded id, so a journal can keep or recase its own name', () => {
    expect(validateJournalName('GRATITUDE', all, 'j_a')).toEqual({ ok: true, name: 'GRATITUDE' });
    expect(validateJournalName('life', all, 'j_a')).toEqual({ ok: false, reason: 'duplicate' });
  });
  it('accepts prototype-like names', () => {
    expect(validateJournalName('toString', all).ok).toBe(true);
    expect(validateJournalName('__proto__', all).ok).toBe(true);
  });
});
