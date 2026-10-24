import { inlineSpans } from './markdownSpans';
import {
  activeWikiToken,
  buildTitleIndex,
  completeWikiToken,
  matchTitles,
  resolveWikilink,
  titleKey,
} from './noteLinks';

type N = { id: string; body: string; updatedAt?: string; deletedAt?: string };
const n = (id: string, body: string, updatedAt?: string, deletedAt?: string): N => ({
  id,
  body,
  updatedAt,
  deletedAt,
});
const d = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`;
const caret = (text: string) => {
  const i = text.indexOf('|');
  return { text: text.replace('|', ''), sel: { start: i, end: i } };
};
const tok = (marked: string) => {
  const { text, sel } = caret(marked);
  return activeWikiToken(text, sel);
};

describe('titleKey', () => {
  it.each([
    ['Foo', 'foo'],
    ['  Foo   Bar ', 'foo bar'],
    ['Foo\t Bar', 'foo bar'],
    ['CAFÉ', 'café'],
  ])('%j -> %j', (a, b) => expect(titleKey(a)).toBe(b));
  it('does not fold diacritics', () => expect(titleKey('Cafe')).not.toBe(titleKey('Café')));
});

describe('buildTitleIndex', () => {
  it('indexes live notes by folded key and drops Untitled and trashed ones', () => {
    const idx = buildTitleIndex([
      n('a', '# Trip  Plan\nbody', d(1)),
      n('b', '#tag #other', d(2)),
      n('c', 'Gone', d(3), d(4)),
      n('d', '', d(5)),
    ]);
    expect([...idx.byKey.keys()]).toEqual(['trip plan']);
    expect(idx.byKey.get('trip plan')).toEqual({
      key: 'trip plan',
      id: 'a',
      title: 'Trip  Plan',
      updatedAt: d(1),
    });
    expect(idx.entries.map((e) => e.id)).toEqual(['a']);
  });

  it('keeps the display title as written', () => {
    const idx = buildTitleIndex([n('a', 'Big IDEA', d(1))]);
    expect(idx.entries[0].title).toBe('Big IDEA');
    expect(idx.entries[0].key).toBe('big idea');
  });

  it('newest updatedAt wins a duplicate title', () => {
    const idx = buildTitleIndex([n('a', 'Foo', d(1)), n('b', 'foo', d(3)), n('c', 'FOO', d(2))]);
    expect(idx.byKey.get('foo')?.id).toBe('b');
    expect(idx.entries).toHaveLength(1);
  });

  it('sorts an invalid or missing date last', () => {
    const idx = buildTitleIndex([n('a', 'Foo', 'garbage'), n('b', 'Foo', d(1)), n('c', 'Foo')]);
    expect(idx.byKey.get('foo')?.id).toBe('b');
    const only = buildTitleIndex([n('z', 'Foo', 'garbage'), n('y', 'Foo')]);
    expect(only.byKey.get('foo')?.id).toBe('y'); // tie: smaller id
  });

  it('breaks an exact tie by smaller id, whatever the input order', () => {
    const a = buildTitleIndex([n('b', 'Foo', d(1)), n('a', 'Foo', d(1))]);
    const b = buildTitleIndex([n('a', 'Foo', d(1)), n('b', 'Foo', d(1))]);
    expect(a.byKey.get('foo')?.id).toBe('a');
    expect(b.byKey.get('foo')?.id).toBe('a');
  });

  it('orders entries newest first, invalid dates last', () => {
    const idx = buildTitleIndex([
      n('a', 'A', d(1)),
      n('b', 'B', d(5)),
      n('c', 'C', 'nope'),
      n('d', 'D', d(3)),
    ]);
    expect(idx.entries.map((e) => e.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('uses the unsaved body of the current note', () => {
    const notes = [n('a', 'Old title', d(1)), n('b', 'Other', d(2))];
    const idx = buildTitleIndex(notes, { id: 'a', body: 'New title\nmore' });
    expect(idx.byKey.has('old title')).toBe(false);
    expect(idx.byKey.get('new title')?.id).toBe('a');
    expect(idx.byKey.get('new title')?.updatedAt).toBe(d(1));
    // The input is not mutated.
    expect(notes[0].body).toBe('Old title');
  });

  it('an unsaved edit that empties the title drops the note', () => {
    const idx = buildTitleIndex([n('a', 'Title', d(1))], { id: 'a', body: '' });
    expect(idx.entries).toEqual([]);
  });

  it('adds a new unsaved current note, but ignores a trashed one', () => {
    const fresh = buildTitleIndex([n('b', 'Other', d(2))], { id: 'new', body: 'Draft' });
    expect(fresh.byKey.get('draft')).toMatchObject({ id: 'new', updatedAt: undefined });
    const trashed = buildTitleIndex([n('a', 'Gone', d(1), d(2))], { id: 'a', body: 'Back' });
    expect(trashed.entries).toEqual([]);
  });

  it('handles CRLF bodies', () => {
    const idx = buildTitleIndex([n('a', 'Line one\r\nline two', d(1))]);
    expect(idx.entries[0].title).toBe('Line one');
  });
});

describe('resolveWikilink', () => {
  const idx = buildTitleIndex([n('a', 'Trip Plan', d(1)), n('b', '**Bold** Idea', d(2))]);
  it.each([
    ['Trip Plan', { kind: 'existing', id: 'a', title: 'Trip Plan' }],
    ['trip   plan', { kind: 'existing', id: 'a', title: 'Trip Plan' }],
    ['TRIP PLAN', { kind: 'existing', id: 'a', title: 'Trip Plan' }],
    ['Bold Idea', { kind: 'existing', id: 'b', title: 'Bold Idea' }],
    ['Nowhere', { kind: 'missing', title: 'Nowhere' }],
    ['  Padded  ', { kind: 'missing', title: 'Padded' }],
  ])('%j', (target, expected) => expect(resolveWikilink(idx, target)).toEqual(expected));

  it.each([[''], ['   '], ['#x'], ['#a #b']])('%j is invalid', (target) =>
    expect(resolveWikilink(idx, target)).toEqual({ kind: 'invalid' }),
  );

  it('[[#x]] is invalid because a note whose first line is "#x" is Untitled, so it could never be created or found', () => {
    const body = '[[#x]]';
    const span = inlineSpans(body)[0];
    expect(span.kind).toBe('wiki');
    expect(resolveWikilink(idx, (span as { target: string }).target)).toEqual({ kind: 'invalid' });
  });

  it('a self-link is existing with the current id', () => {
    expect(resolveWikilink(idx, 'Trip Plan', 'a')).toEqual({
      kind: 'existing',
      id: 'a',
      title: 'Trip Plan',
    });
  });

  it('does not resolve a trashed note', () => {
    const i = buildTitleIndex([n('a', 'Gone', d(1), d(2))]);
    expect(resolveWikilink(i, 'Gone')).toEqual({ kind: 'missing', title: 'Gone' });
  });

  it('finds a title with an emoji', () => {
    const i = buildTitleIndex([n('a', 'Plans 🎉 2026', d(1))]);
    expect(resolveWikilink(i, 'plans 🎉 2026')).toMatchObject({ kind: 'existing', id: 'a' });
  });
});

describe('activeWikiToken', () => {
  it.each([
    ['[[|', { start: 0, end: 2, query: '' }],
    ['[[Fo|', { start: 0, end: 4, query: 'Fo' }],
    ['see [[Fo|', { start: 4, end: 8, query: 'Fo' }],
    ['[[ Fo|', { start: 0, end: 5, query: 'Fo' }],
    ['[[Foo |', { start: 0, end: 6, query: 'Foo ' }],
    ['[[Fo|]]', { start: 0, end: 6, query: 'Fo' }],
    ['[[|]]', { start: 0, end: 4, query: '' }],
    ['[[Fo|o]]', { start: 0, end: 7, query: 'Fo' }],
    ['[[Fo| rest', { start: 0, end: 4, query: 'Fo' }],
    ['line\n[[Fo|', { start: 5, end: 9, query: 'Fo' }],
    ['line\r\n[[Fo|\r\nnext', { start: 6, end: 10, query: 'Fo' }],
    ['[[🎉 |', { start: 0, end: 5, query: '🎉 ' }],
    ['- [ ] [[Fo|', { start: 6, end: 10, query: 'Fo' }],
  ])('%j', (marked, expected) => expect(tok(marked)).toEqual(expected));

  it.each([
    ['|[[Foo'],
    ['[|[Foo'],
    ['[[Foo]]|'],
    ['[[Foo]|]'],
    ['[[Foo] |'],
    ['[Fo|'],
    ['[[a [b|'],
    ['[[Fo\n|o'],
    ['[[Fo\r|o'],
    ['[[[Fo|'],
    ['plain text|'],
    ['`[[Fo|`'],
    ['`[[Fo`|'],
    ['```\n[[Fo|\n```'],
    ['```\n[[Fo|'],
    ['[a](u[[Fo|)'],
  ])('is null for %j', (marked) => expect(tok(marked)).toBeNull());

  it('is null for a ranged selection and out-of-range carets', () => {
    expect(activeWikiToken('[[Foo', { start: 2, end: 4 })).toBeNull();
    expect(activeWikiToken('[[Foo', { start: 9, end: 9 })).toBeNull();
    expect(activeWikiToken('[[Foo', { start: -1, end: -1 })).toBeNull();
  });

  it('is null with the caret inside a surrogate pair', () => {
    const text = '[[a🎉b';
    expect(activeWikiToken(text, { start: 4, end: 4 })).toBeNull();
    expect(activeWikiToken(text, { start: 5, end: 5 })).toMatchObject({ query: 'a🎉' });
  });

  it('works after code that closed earlier on the line', () => {
    expect(tok('`x` [[Fo|')).toEqual({ start: 4, end: 8, query: 'Fo' });
  });

  it('works after a closed fence', () => {
    expect(tok('```\ncode\n```\n[[Fo|')).toMatchObject({ query: 'Fo' });
  });

  it('keeps leading whitespace out of the query but not trailing', () => {
    expect(tok('[[  \tFo |')?.query).toBe('Fo ');
  });
});

describe('completeWikiToken', () => {
  const run = (marked: string, title: string) => {
    const { text, sel } = caret(marked);
    const token = activeWikiToken(text, sel)!;
    return completeWikiToken(text, token, title);
  };

  it.each([
    ['[[Fo|', 'Foo', '[[Foo]]', 7],
    ['see [[Fo| there', 'Foo', 'see [[Foo]] there', 11],
    ['[[Fo|]]', 'Foo', '[[Foo]]', 7],
    ['[[|]]', 'Foo', '[[Foo]]', 7],
    ['[[Fo|o]]', 'Foo', '[[Foo]]', 7],
    ['[[Fo|]] and [[x]]', 'Foo', '[[Foo]] and [[x]]', 7],
    ['a\r\n[[Fo|\r\nb', 'Foo', 'a\r\n[[Foo]]\r\nb', 10],
    ['[[Fo|', 'Plans 🎉', '[[Plans 🎉]]', 12],
    ['[[Fo|', '  Padded  ', '[[Padded]]', 10],
  ])('%j with %j', (marked, title, expected, pos) => {
    const out = run(marked, title);
    expect(out.text).toBe(expected);
    expect(out.selection).toEqual({ start: pos, end: pos });
  });

  it('does not double an existing ]]', () => {
    expect(run('[[Fo|]]', 'Foo').text).not.toContain(']]]]');
  });

  it.each([['a[b'], ['a]b'], ['a\nb'], ['a\rb'], [''], ['   '], ['x'.repeat(201)]])(
    'rejects %j and returns the text unchanged',
    (title) => {
      const out = run('[[Fo|', title);
      expect(out).toEqual({ text: '[[Fo', selection: null });
    },
  );

  it('accepts a title of exactly the maximum length', () => {
    const out = run('[[Fo|', 'x'.repeat(200));
    expect(out.selection).not.toBeNull();
  });
});

describe('matchTitles', () => {
  const idx = buildTitleIndex([
    n('1', 'Alpha trip', d(1)),
    n('2', 'Trip to Rome', d(5)),
    n('3', 'Triple', d(3)),
    n('4', 'My trip notes', d(4)),
    n('5', 'Trip to Rome', d(2)),
    n('6', 'Bracket [x] title', d(6)),
    n('7', 'Untitled', d(7)),
    n('8', '#tag', d(8)),
    n('9', 'Cafe', d(9)),
    n('10', 'Gone trip', d(10), d(11)),
  ]);
  const ids = (q: string, limit = 10, cur?: string) =>
    matchTitles(idx, q, limit, cur).map((e) => e.id);

  it('empty query: most recently edited first, no brackets, Untitled or trashed', () => {
    expect(ids('')).toEqual(['9', '2', '4', '3', '1']);
    expect(ids('   ')).toEqual(['9', '2', '4', '3', '1']);
  });

  it('prefix matches first, then substring, each newest first', () => {
    expect(ids('tri')).toEqual(['2', '3', '4', '1']);
    expect(ids('TRIP')).toEqual(['2', '3', '4', '1']);
    expect(ids('trip to')).toEqual(['2']);
  });

  it('one row per distinct title: the newest note', () => {
    expect(ids('rome')).toEqual(['2']);
  });

  it('honours limit', () => {
    expect(ids('', 2)).toEqual(['9', '2']);
    expect(ids('', 0)).toEqual([]);
    expect(ids('', -3)).toEqual([]);
    expect(ids('', NaN)).toEqual([]);
    expect(ids('tri', 1.9)).toEqual(['2']);
  });

  it('excludes the current note', () => {
    expect(ids('tri', 10, '2')).toEqual(['3', '4', '1']);
  });

  it('does not match through a title with brackets', () => {
    expect(ids('bracket')).toEqual([]);
  });

  it('is case-insensitive and whitespace tolerant', () => {
    expect(ids('  MY   Trip ')).toEqual(['4']);
    expect(ids('no match')).toEqual([]);
  });

  it('leaves out titles over the wikilink limit but keeps 200 characters', () => {
    const long = 'x'.repeat(201);
    const edge = 'y'.repeat(200);
    const i = buildTitleIndex([n('l', long, d(2)), n('e', edge, d(1))]);
    expect(matchTitles(i, '', 10).map((e) => e.id)).toEqual(['e']);
    expect(matchTitles(i, 'xxx', 10)).toEqual([]);
    expect(matchTitles(i, 'yyy', 10).map((e) => e.id)).toEqual(['e']);
  });

  it('a long raw title still resolves by its collapsed key', () => {
    const raw = 'a' + ' '.repeat(3) + 'b'.repeat(197);
    expect(raw.length).toBe(201);
    const i = buildTitleIndex([n('w', raw, d(1))]);
    expect(matchTitles(i, '', 10)).toEqual([]);
    expect(resolveWikilink(i, 'a ' + 'b'.repeat(197))).toMatchObject({ kind: 'existing', id: 'w' });
  });

  it('does not fold diacritics', () => {
    const i = buildTitleIndex([n('a', 'Café', d(1))]);
    expect(matchTitles(i, 'cafe', 5)).toEqual([]);
    expect(matchTitles(i, 'caf', 5)).toHaveLength(1);
  });
});

describe('complete then reparse (seeded property test)', () => {
  let seed = 20261021;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const word = () =>
    pick(['a', 'Foo', 'bar baz', '🎉', 'Café', 'x y  z', '日本', '#t', '*i*', '(p)', 'a😀b', ' ']);
  const make = (n: number) => Array.from({ length: n }, word).join('');
  const PRES = ['', 'see ', 'line\n', 'a\r\nb ', '- [ ] ', '> ', 'x(y) ', '`c` ', '```\nc\n```\n'];
  const POSTS = ['', ']]', ' tail', 'cd]]', '\nnext', ']] and [[z]]', ' ]] ', '\r\nlast'];

  it('yields a valid wikilink whose target is the title', () => {
    let cases = 0;
    for (let k = 0; k < 800; k += 1) {
      const pre = pick(PRES);
      const q = make(Math.floor(rnd() * 3)).replace(/[[\]]/g, '');
      const post = pick(POSTS);
      const title = make(1 + Math.floor(rnd() * 3));
      if (title.trim() === '') continue;
      const text = pre + '[[' + q + post;
      const at = pre.length + 2 + q.length;
      const token = activeWikiToken(text, { start: at, end: at });
      expect(token).not.toBeNull();
      const out = completeWikiToken(text, token!, title);
      expect(out.selection).not.toBeNull();
      const pos = out.selection!.start;
      expect(pos).toBe(pre.length + 4 + title.trim().length);
      expect(out.text.slice(0, pre.length)).toBe(pre);
      expect(out.text.slice(pos)).toBe(text.slice(token!.end));
      // Reparse the line that holds the link.
      const lineStart = Math.max(
        out.text.lastIndexOf('\n', pre.length + 1),
        out.text.lastIndexOf('\r', pre.length + 1),
      );
      const ls = lineStart + 1;
      let le = out.text.length;
      for (const c of ['\n', '\r']) {
        const j = out.text.indexOf(c, pre.length);
        if (j !== -1 && j < le) le = j;
      }
      const span = inlineSpans(out.text.slice(ls, le)).find(
        (s) => s.kind === 'wiki' && s.start === pre.length - ls,
      );
      expect(span).toBeDefined();
      if (span && span.kind === 'wiki') {
        expect(span.target.trim()).toBe(title.trim());
        expect(ls + span.end).toBe(pos);
      }
      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(500);
  });
});
