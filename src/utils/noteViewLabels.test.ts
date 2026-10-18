import { emptyText, tagsByUse, viewTitle } from './noteViewLabels';
import { NoteView } from './noteViews';

const views: NoteView[] = [
  { kind: 'all' },
  { kind: 'today' },
  { kind: 'todo' },
  { kind: 'untagged' },
  { kind: 'pinned' },
  { kind: 'tag', tag: 'dream' },
  { kind: 'trash' },
];

describe('viewTitle', () => {
  it('names every view', () => {
    expect(views.map(viewTitle)).toEqual([
      'All Notes',
      'Today',
      'Todo',
      'Untagged',
      'Pinned',
      '#dream',
      'Recently Deleted',
    ]);
  });
});

describe('emptyText', () => {
  it('has non-empty text for every view', () => {
    for (const v of views) expect(emptyText(v).length).toBeGreaterThan(0);
  });
  it('uses the agreed wording', () => {
    expect(emptyText({ kind: 'all' })).toBe('No notes yet. Tap + to write one.');
    expect(emptyText({ kind: 'today' })).toBe('Nothing written today.');
    expect(emptyText({ kind: 'todo' })).toBe('No notes with checkboxes.');
    expect(emptyText({ kind: 'untagged' })).toBe('No untagged notes.');
    expect(emptyText({ kind: 'pinned' })).toBe('No pinned notes.');
    expect(emptyText({ kind: 'tag', tag: 'dream' })).toBe('No notes with #dream.');
  });
});

describe('tagsByUse', () => {
  it('orders by count descending, then alphabetical', () => {
    const input = [
      { tag: 'b', count: 2 },
      { tag: 'z', count: 5 },
      { tag: 'a', count: 2 },
      { tag: 'm', count: 1 },
    ];
    expect(tagsByUse(input).map((t) => t.tag)).toEqual(['z', 'a', 'b', 'm']);
  });
  it('does not mutate its input and handles empty', () => {
    const input = [
      { tag: 'b', count: 1 },
      { tag: 'a', count: 2 },
    ];
    tagsByUse(input);
    expect(input[0].tag).toBe('b');
    expect(tagsByUse([])).toEqual([]);
  });
});
