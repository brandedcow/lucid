import { Note } from '../services/notesStorage';
import { dayDone, searchNotes, selectNotes, tagCounts } from './noteViews';

const T = '2026-10-18';
const at = (y: number, mo: number, d: number, h = 12, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).toISOString();

let n = 0;
function note(body: string, extra: Partial<Note> = {}): Note {
  n += 1;
  return {
    id: String(n),
    createdAt: at(2026, 10, 18),
    updatedAt: at(2026, 10, 18),
    body,
    ...extra,
  };
}
const ids = (list: Note[]) => list.map((x) => x.id);

describe('selectNotes', () => {
  it('returns [] for an empty list in every view', () => {
    for (const kind of ['all', 'today', 'todo', 'untagged', 'pinned', 'trash'] as const) {
      expect(selectNotes([], { kind }, T)).toEqual([]);
    }
    expect(selectNotes([], { kind: 'tag', tag: 'x' }, T)).toEqual([]);
  });

  it('all: live notes only, order kept, input untouched', () => {
    const a = note('a');
    const b = note('b', { deletedAt: at(2026, 10, 18) });
    const c = note('c');
    const input = [a, b, c];
    expect(ids(selectNotes(input, { kind: 'all' }, T))).toEqual([a.id, c.id]);
    expect(input).toEqual([a, b, c]);
  });

  it('today: created today, near midnight both sides, invalid dates are not today', () => {
    const both = (d: string, extra: Partial<Note> = {}) => ({
      createdAt: d,
      updatedAt: d,
      ...extra,
    });
    const late = note('late', both(at(2026, 10, 18, 23, 59)));
    const early = note('early', both(at(2026, 10, 18, 0, 0)));
    const yesterday = note('y', both(at(2026, 10, 17, 23, 59)));
    const tomorrow = note('t', both(at(2026, 10, 19, 0, 0)));
    const bad = note('bad', both('nope'));
    const missing = note('m', {
      createdAt: undefined as unknown as string,
      updatedAt: undefined as unknown as string,
    });
    const trashed = note('d', { deletedAt: at(2026, 10, 18) });
    const list = [late, early, yesterday, tomorrow, bad, missing, trashed];
    expect(ids(selectNotes(list, { kind: 'today' }, T))).toEqual([late.id, early.id]);
  });

  it('today: includes a note created yesterday and updated today', () => {
    const edited = note('edited', { createdAt: at(2026, 10, 17), updatedAt: at(2026, 10, 18, 8) });
    expect(ids(selectNotes([edited], { kind: 'today' }, T))).toEqual([edited.id]);
  });

  it('today: excludes a note created and updated yesterday, or edited yesterday only', () => {
    const old = note('old', { createdAt: at(2026, 10, 10), updatedAt: at(2026, 10, 17, 23, 59) });
    expect(selectNotes([old], { kind: 'today' }, T)).toEqual([]);
  });

  it('today: a missing or invalid updatedAt falls back to createdAt', () => {
    const missing = note('m', {
      createdAt: at(2026, 10, 18, 9),
      updatedAt: undefined as unknown as string,
    });
    const invalid = note('i', { createdAt: at(2026, 10, 18, 10), updatedAt: 'nope' });
    const olderThanCreated = note('o', {
      createdAt: at(2026, 10, 18, 11),
      updatedAt: at(2026, 10, 1),
    });
    const oldInvalid = note('x', { createdAt: at(2026, 10, 1), updatedAt: 'nope' });
    expect(
      ids(selectNotes([missing, invalid, olderThanCreated, oldInvalid], { kind: 'today' }, T)),
    ).toEqual([missing.id, invalid.id, olderThanCreated.id]);
  });

  it('today: excludes a trashed note even if updated today; keeps the input order', () => {
    const trashed = note('t', { createdAt: at(2026, 10, 1), deletedAt: at(2026, 10, 18) });
    const a = note('a', { updatedAt: at(2026, 10, 18, 15) });
    const b = note('b', { updatedAt: at(2026, 10, 18, 9) });
    expect(ids(selectNotes([a, trashed, b], { kind: 'today' }, T))).toEqual([a.id, b.id]);
  });

  it('todo: live notes with a checkbox line', () => {
    const a = note('- [ ] buy milk');
    const b = note('plain');
    const c = note('- [x] done', { deletedAt: at(2026, 10, 18) });
    expect(ids(selectNotes([a, b, c], { kind: 'todo' }, T))).toEqual([a.id]);
  });

  it('untagged: live notes without an inline tag', () => {
    const a = note('has #tag');
    const b = note('none');
    const c = note('none trashed', { deletedAt: at(2026, 10, 18) });
    expect(ids(selectNotes([a, b, c], { kind: 'untagged' }, T))).toEqual([b.id]);
  });

  it('pinned: live pinned notes, in edit order (pin does not reorder)', () => {
    const a = note('a');
    const b = note('b', { pinned: true });
    const c = note('c', { pinned: true });
    const d = note('d', { pinned: true, deletedAt: at(2026, 10, 18) });
    expect(ids(selectNotes([a, b, c, d], { kind: 'pinned' }, T))).toEqual([b.id, c.id]);
  });

  it('tag: exact normalised match on live notes', () => {
    const a = note('x #Dream y');
    const b = note('x #dreams');
    const c = note('x #dream', { deletedAt: at(2026, 10, 18) });
    expect(ids(selectNotes([a, b, c], { kind: 'tag', tag: 'dream' }, T))).toEqual([a.id]);
  });

  it('trash: only trashed notes, newest deletion first', () => {
    const live = note('live');
    const old = note('old', { deletedAt: at(2026, 10, 1) });
    const recent = note('recent', { deletedAt: at(2026, 10, 17) });
    expect(ids(selectNotes([live, old, recent], { kind: 'trash' }, T))).toEqual([
      recent.id,
      old.id,
    ]);
  });
});

describe('searchNotes', () => {
  it('ANDs terms, ignores case, and skips Recently Deleted', () => {
    const a = note('Walked the Dog in the park');
    const b = note('dog only');
    const c = note('dog park', { deletedAt: at(2026, 10, 18) });
    expect(ids(searchNotes([a, b, c], '  DOG   park '))).toEqual([a.id]);
  });

  it('a #tag term is a plain substring (finds tags and prefixes)', () => {
    const a = note('about #dream');
    const b = note('about #dreams');
    const c = note('about dream');
    expect(ids(searchNotes([a, b, c], '#dream'))).toEqual([a.id, b.id]);
  });

  it('a blank query returns []', () => {
    expect(searchNotes([note('a')], '')).toEqual([]);
    expect(searchNotes([note('a')], '   ')).toEqual([]);
  });
});

describe('tagCounts', () => {
  it('counts live notes once per tag, alphabetical', () => {
    const list = [
      note('#b #a'),
      note('#b #b again'),
      note('#c', { deletedAt: at(2026, 10, 18) }),
      note('none'),
    ];
    expect(tagCounts(list)).toEqual([
      { tag: 'a', count: 1 },
      { tag: 'b', count: 2 },
    ]);
  });

  it('is empty for no notes', () => {
    expect(tagCounts([])).toEqual([]);
  });
});

describe('dayDone', () => {
  it('is true for a live note created today', () => {
    expect(dayDone([note('a')], null, T)).toBe(true);
  });
  it('is true when today note is in Recently Deleted', () => {
    expect(dayDone([note('a', { deletedAt: at(2026, 10, 18) })], null, T)).toBe(true);
  });
  it('is true when the marker is today', () => {
    expect(dayDone([], T, T)).toBe(true);
  });
  it('is false for a marker of another day and no note today', () => {
    expect(dayDone([note('a', { createdAt: at(2026, 10, 17) })], '2026-10-17', T)).toBe(false);
  });
  it('counts created, not updated: false for a note created yesterday and updated today', () => {
    const edited = note('e', { createdAt: at(2026, 10, 17), updatedAt: at(2026, 10, 18, 8) });
    // The Today view lists it, the launch rule does not treat today as done.
    expect(ids(selectNotes([edited], { kind: 'today' }, T))).toEqual([edited.id]);
    expect(dayDone([edited], null, T)).toBe(false);
  });
  it('is false with only imported old notes', () => {
    const old = note('old', { createdAt: at(2025, 1, 1), updatedAt: at(2026, 10, 18) });
    expect(dayDone([old], null, T)).toBe(false);
  });
});
