import { tagsByUse, viewTitle } from './noteViewLabels';
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
