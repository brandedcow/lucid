import { entriesFor, journalOf } from './journals';

describe('journalOf', () => {
  it('defaults an absent journalId to dreams', () => {
    expect(journalOf({})).toBe('dreams');
  });
  it('returns an explicit dreams id', () => {
    expect(journalOf({ journalId: 'dreams' })).toBe('dreams');
  });
  it('returns life', () => {
    expect(journalOf({ journalId: 'life' })).toBe('life');
  });
  it('returns an unknown id as is', () => {
    expect(journalOf({ journalId: 'future' })).toBe('future');
  });
});

const rec = (id: string, journalId?: string) => ({ id, ...(journalId ? { journalId } : {}) });

describe('entriesFor', () => {
  const all = [rec('1'), rec('2', 'dreams'), rec('3', 'life'), rec('4', 'future')];

  it('treats a record without journalId as Dreams', () => {
    expect(entriesFor(all, 'dreams').map((r) => r.id)).toEqual(['1', '2']);
  });
  it('matches by equality and hides unknown journals from the built-ins', () => {
    expect(entriesFor(all, 'life').map((r) => r.id)).toEqual(['3']);
    expect(entriesFor(all, 'future').map((r) => r.id)).toEqual(['4']);
  });
  it('does not change its input', () => {
    entriesFor(all, 'life');
    expect(all).toHaveLength(4);
  });
});
