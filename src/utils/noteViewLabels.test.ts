import { sortTags, tagsByUse, viewTitle } from './noteViewLabels';
import { NoteView, tagCounts } from './noteViews';

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

describe('sortTags', () => {
  const input = [
    { tag: 'b', count: 2 },
    { tag: 'z', count: 5 },
    { tag: 'a', count: 2 },
    { tag: 'm', count: 1 },
  ];
  it('alpha sorts by tag', () => {
    expect(sortTags(input, 'alpha').map((t) => t.tag)).toEqual(['a', 'b', 'm', 'z']);
  });
  it('count sorts by count descending, ties alphabetical', () => {
    expect(sortTags(input, 'count').map((t) => t.tag)).toEqual(['z', 'a', 'b', 'm']);
  });
  it('handles empty and a single tag', () => {
    expect(sortTags([], 'alpha')).toEqual([]);
    expect(sortTags([], 'count')).toEqual([]);
    expect(sortTags([{ tag: 'x', count: 1 }], 'count')).toEqual([{ tag: 'x', count: 1 }]);
  });
  it('does not mutate its input, in either order', () => {
    const copy = input.map((t) => ({ ...t }));
    sortTags(input, 'alpha');
    sortTags(input, 'count');
    expect(input).toEqual(copy);
  });
  it('alpha equals the tagCounts order', () => {
    const notes = [
      { body: '#pear #apple', status: 'active' },
      { body: '#zed #apple', status: 'active' },
    ];
    const expected = tagCounts(notes as never);
    expect(sortTags([...expected].reverse(), 'alpha')).toEqual(expected);
  });
});
