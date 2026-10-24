import {
  INDENT_WIDTH,
  indentWidth,
  listIndentDepths,
  markdownLineKinds,
  markdownLines,
  parentIndentWidths,
  parseListPrefix,
  plainLineText,
  type LineKind,
  type MarkdownRun,
} from './markdownLines';
import { scanTags } from './inlineTags';
import { excludedRanges } from './markdownSpans';

const texts = (body: string) => markdownLines(body).map((l) => l.runs.map((r) => r.text));
const rebuild = (body: string) =>
  markdownLines(body)
    .map((l) => l.runs.map((r) => r.text).join('') + l.eol)
    .join('');

describe('markdownLines line kinds', () => {
  it('recognizes headings 1 and 2 with a dimmed marker', () => {
    const [h1, h2] = markdownLines('# Big\n## Medium');
    expect(h1.kind).toBe('heading1');
    expect(h1.runs).toEqual([{ text: '# ', marker: true }, { text: 'Big' }]);
    expect(h2.kind).toBe('heading2');
    expect(h2.runs[0]).toEqual({ text: '## ', marker: true });
  });

  it('does not treat ####, #word or a bare # as headings', () => {
    expect(markdownLines('#### four')[0].kind).toBe('plain');
    expect(markdownLines('#word')[0].kind).toBe('plain');
    expect(markdownLines('#')[0].kind).toBe('plain');
    expect(markdownLines('#word')[0].runs).toEqual([{ text: '#word', tag: true }]);
  });

  it('recognizes bullets with - and *', () => {
    expect(markdownLines('- one')[0]).toMatchObject({ kind: 'bullet' });
    expect(markdownLines('* one')[0].runs[0]).toEqual({ text: '* ', marker: true });
  });

  it('recognizes numbered lists', () => {
    const [l] = markdownLines('12. step');
    expect(l.kind).toBe('numbered');
    expect(l.runs).toEqual([{ text: '12. ', marker: true }, { text: 'step' }]);
  });

  it('recognizes checkboxes and their state', () => {
    const [a, b, c] = markdownLines('- [ ] open\n- [x] done\n* [X] done too');
    expect(a).toMatchObject({ kind: 'checkbox', checked: false });
    expect(a.runs[0]).toEqual({ text: '- [ ] ', marker: true });
    expect(b).toMatchObject({ kind: 'checkbox', checked: true });
    expect(c).toMatchObject({ kind: 'checkbox', checked: true });
  });

  it('keeps indentation as an unstyled run before the marker', () => {
    const [l] = markdownLines('  - [ ] sub');
    expect(l.runs).toEqual([{ text: '  ' }, { text: '- [ ] ', marker: true }, { text: 'sub' }]);
  });

  it('recognizes quotes', () => {
    const [l] = markdownLines('> said');
    expect(l.kind).toBe('quote');
    expect(l.runs).toEqual([{ text: '> ', marker: true }, { text: 'said' }]);
  });

  it('does not treat "-x" or "1.x" as lists', () => {
    expect(markdownLines('-x')[0].kind).toBe('plain');
    expect(markdownLines('1.x')[0].kind).toBe('plain');
  });
});

describe('markdownLines inline styles', () => {
  it('styles bold with dimmed markers', () => {
    expect(markdownLines('a **b** c')[0].runs).toEqual([
      { text: 'a ' },
      { text: '**', marker: true },
      { text: 'b', bold: true },
      { text: '**', marker: true },
      { text: ' c' },
    ]);
  });

  it('styles italic with dimmed markers', () => {
    expect(markdownLines('a *b* c')[0].runs).toEqual([
      { text: 'a ' },
      { text: '*', marker: true },
      { text: 'b', italic: true },
      { text: '*', marker: true },
      { text: ' c' },
    ]);
  });

  it('styles tags via inlineTags rules', () => {
    expect(markdownLines('go #Dream now')[0].runs).toEqual([
      { text: 'go ' },
      { text: '#Dream', tag: true },
      { text: ' now' },
    ]);
  });

  it('does not style "#" without a word, digits-only tokens or mid-word hashes', () => {
    expect(markdownLines('a # b')[0].runs).toEqual([{ text: 'a # b' }]);
    expect(markdownLines('#123')[0].runs).toEqual([{ text: '#123' }]);
    expect(markdownLines('a#b')[0].runs).toEqual([{ text: 'a#b' }]);
  });

  it('leaves unclosed ** and * as plain text', () => {
    expect(markdownLines('a **b')[0].runs).toEqual([{ text: 'a **b' }]);
    expect(markdownLines('a *b')[0].runs).toEqual([{ text: 'a *b' }]);
  });

  it('does not style when whitespace sits inside the markers', () => {
    expect(markdownLines('2 * 3 * 4')[0].runs).toEqual([{ text: '2 * 3 * 4' }]);
    expect(markdownLines('** x **')[0].runs).toEqual([{ text: '** x **' }]);
  });

  it('nests italic inside bold and bold inside italic', () => {
    expect(markdownLines('**a *b* c**')[0].runs).toEqual([
      { text: '**', marker: true },
      { text: 'a ', bold: true },
      { text: '*', marker: true, bold: true },
      { text: 'b', bold: true, italic: true },
      { text: '*', marker: true, bold: true },
      { text: ' c', bold: true },
      { text: '**', marker: true },
    ]);
  });

  it('styles a tag inside bold, but not one glued to the marker', () => {
    expect(markdownLines('**a #idea**')[0].runs).toEqual([
      { text: '**', marker: true },
      { text: 'a ', bold: true },
      { text: '#idea', bold: true, tag: true },
      { text: '**', marker: true },
    ]);
    // inlineTags needs whitespace or an opener before "#", so "**#idea**" has no tag.
    expect(markdownLines('**#idea**')[0].runs.some((r) => r.tag)).toBe(false);
  });

  it('combines a line prefix with inline styles', () => {
    const [l] = markdownLines('## **Hi** #x');
    expect(l.kind).toBe('heading2');
    expect(plainLineText(l)).toBe('Hi #x');
  });

  it('handles unicode', () => {
    const [l] = markdownLines('**日本語** 😀 #夢');
    expect(l.runs.map((r) => r.text)).toEqual(['**', '日本語', '**', ' 😀 ', '#夢']);
    expect(l.runs[4]).toEqual({ text: '#夢', tag: true });
  });
});

describe('markdownLines structure', () => {
  it('gives one empty line for an empty body', () => {
    expect(markdownLines('')).toEqual([{ kind: 'plain', runs: [], eol: '' }]);
  });

  it('keeps empty lines', () => {
    expect(texts('a\n\nb')).toEqual([['a'], [], ['b']]);
  });

  it('splits CRLF, LF and CR and records the terminator', () => {
    expect(markdownLines('a\r\nb\nc\rd').map((l) => l.eol)).toEqual(['\r\n', '\n', '\r', '']);
  });

  it('does not leave a stray \\r in runs', () => {
    for (const l of markdownLines('# a\r\n- b\r\n')) {
      expect(l.runs.some((r) => r.text.includes('\r'))).toBe(false);
    }
  });

  it('round-trips awkward inputs', () => {
    const samples = [
      '',
      '\n',
      '# t\r\n- [ ] a **b *c* d** #e\r\n> q\r\n12. n\n\n   \n***x***\n**\n*\n* *\n#\n## \n- [x]\n- [ ]x',
      '**a** **b',
      '😀 *é* #日本 **',
      '   #tag   ',
    ];
    for (const s of samples) expect(rebuild(s)).toBe(s);
  });

  it('round-trips random strings', () => {
    const alphabet = [
      '*',
      '**',
      '#',
      ' ',
      '-',
      '[',
      ']',
      'x',
      'a',
      '1',
      '.',
      '>',
      '\n',
      '\r\n',
      '😀',
      '_',
    ];
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 500; i++) {
      let s = '';
      const n = Math.floor(rnd() * 20);
      for (let k = 0; k < n; k++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      expect(rebuild(s)).toBe(s);
    }
  });
});

describe('parseListPrefix', () => {
  const cases: [string, object | null][] = [
    ['- a', { kind: 'bullet', indent: '', marker: '- ', bullet: '-', length: 2 }],
    ['* a', { kind: 'bullet', indent: '', marker: '* ', bullet: '*', length: 2 }],
    ['  - a', { kind: 'bullet', indent: '  ', marker: '- ', bullet: '-', length: 4 }],
    ['- ', { kind: 'bullet', indent: '', marker: '- ', bullet: '-', length: 2 }],
    ['12. a', { kind: 'numbered', indent: '', marker: '12. ', number: 12, length: 4 }],
    ['1. ', { kind: 'numbered', indent: '', marker: '1. ', number: 1, length: 3 }],
    ['\t3. a', { kind: 'numbered', indent: '\t', marker: '3. ', number: 3, length: 4 }],
    [
      '- [ ] a',
      { kind: 'checkbox', indent: '', marker: '- [ ] ', bullet: '-', checked: false, length: 6 },
    ],
    [
      '- [x] a',
      { kind: 'checkbox', indent: '', marker: '- [x] ', bullet: '-', checked: true, length: 6 },
    ],
    [
      '- [X] a',
      { kind: 'checkbox', indent: '', marker: '- [X] ', bullet: '-', checked: true, length: 6 },
    ],
    [
      '* [ ]',
      { kind: 'checkbox', indent: '', marker: '* [ ]', bullet: '*', checked: false, length: 5 },
    ],
    [
      '  - [x]',
      { kind: 'checkbox', indent: '  ', marker: '- [x]', bullet: '-', checked: true, length: 7 },
    ],
    ['-a', null],
    ['-', null],
    ['*italic* text', null],
    ['**bold** text', null],
    ['1.a', null],
    ['# Heading', null],
    ['## Heading', null],
    ['> quote', null],
    ['plain', null],
    ['', null],
    ['---', null],
    ['- - -', null],
    ['* * *', null],
    ['___', null],
    ['- [x](http://a)', { kind: 'bullet', indent: '', marker: '- ', bullet: '-', length: 2 }],
    ['- [[Foo]]', { kind: 'bullet', indent: '', marker: '- ', bullet: '-', length: 2 }],
    ['1. [a](b)', { kind: 'numbered', indent: '', marker: '1. ', number: 1, length: 3 }],
  ];
  it.each(cases)('%j', (line, expected) => {
    expect(parseListPrefix(line)).toEqual(expected);
  });
});

describe('parseListPrefix with a line kind', () => {
  it('returns null for rule, fence and code lines whatever they look like', () => {
    expect(parseListPrefix('- [ ] a', 'code')).toBeNull();
    expect(parseListPrefix('- a', 'code')).toBeNull();
    expect(parseListPrefix('```', 'fence')).toBeNull();
    expect(parseListPrefix('* * *', 'rule')).toBeNull();
    expect(parseListPrefix('- a', 'bullet')).toMatchObject({ kind: 'bullet' });
    expect(parseListPrefix('- a', 'plain')).toMatchObject({ kind: 'bullet' });
  });

  it('agrees with the tokenizer on every line of a mixed body', () => {
    const body = '- a\n```\n- [ ] b\n1. c\n```\n---\n* * *\n1. d\n- [x](u)';
    const lines = markdownLines(body);
    const kinds = markdownLineKinds(body);
    const texts = body.split('\n');
    texts.forEach((t, i) => {
      const p = parseListPrefix(t, kinds[i]);
      const listy = ['bullet', 'numbered', 'checkbox'].includes(lines[i].kind);
      expect(p !== null).toBe(listy);
      if (p) expect(p.kind).toBe(lines[i].kind);
    });
  });
});

const kindsOf = (body: string): LineKind[] => markdownLines(body).map((l) => l.kind);
const run = (text: string, extra: Partial<MarkdownRun> = {}): MarkdownRun => ({ text, ...extra });

describe('markdownLines headings and rules', () => {
  it.each([
    ['# a', 'heading1'],
    ['## a', 'heading2'],
    ['### a', 'heading3'],
    ['#### a', 'plain'],
    ['###a', 'plain'],
    ['###', 'plain'],
  ])('%j is %s', (line, kind) => {
    expect(markdownLines(line)[0].kind).toBe(kind);
  });

  it('gives heading 3 a dimmed marker', () => {
    expect(markdownLines('### Small')[0].runs).toEqual([
      run('### ', { marker: true }),
      run('Small'),
    ]);
  });

  it.each(['---', '***', '___', '----', '- - -', '* * *', '_ _ _', '  ---', '-- -', '*  *  *  '])(
    '%j is a rule made of one marker run',
    (line) => {
      const [l] = markdownLines(line);
      expect(l.kind).toBe('rule');
      expect(l.runs).toEqual([run(line, { marker: true })]);
    },
  );

  it.each(['--', '**', '__', '- -', '-*-', '--- x', '    ---', '- a - -', '---a'])(
    '%j is not a rule',
    (line) => {
      expect(markdownLines(line)[0].kind).not.toBe('rule');
    },
  );

  it('keeps "- - -" a rule, not a bullet, and "- -" a bullet', () => {
    expect(kindsOf('- - -\n- -')).toEqual(['rule', 'bullet']);
  });
});

describe('markdownLines inline code', () => {
  it('splits an inline code span into backtick markers and a code run', () => {
    expect(markdownLines('a `b` c')[0].runs).toEqual([
      run('a '),
      run('`', { marker: true }),
      run('b', { code: true }),
      run('`', { marker: true }),
      run(' c'),
    ]);
  });

  it('closes a run of n backticks only at a run of exactly n', () => {
    expect(markdownLines('``a ` b``')[0].runs).toEqual([
      run('``', { marker: true }),
      run('a ` b', { code: true }),
      run('``', { marker: true }),
    ]);
    expect(markdownLines('`a``b`')[0].runs[1]).toEqual(run('a``b', { code: true }));
  });

  it('does not style bold, italic or tags inside code', () => {
    const runs = markdownLines('`**a** *b* #c`')[0].runs;
    expect(runs).toEqual([
      run('`', { marker: true }),
      run('**a** *b* #c', { code: true }),
      run('`', { marker: true }),
    ]);
  });

  it('keeps an unclosed backtick literal', () => {
    expect(markdownLines('a `b')[0].runs).toEqual([run('a `b')]);
    expect(markdownLines('``a`')[0].runs).toEqual([run('``a`')]);
  });

  it('does not let bold or italic close inside code', () => {
    expect(markdownLines('**a `b**` c')[0].runs.some((r) => r.bold)).toBe(false);
    expect(markdownLines('*a `b*` c')[0].runs.some((r) => r.italic)).toBe(false);
  });

  it('lets bold wrap a code span', () => {
    expect(markdownLines('**a `b` c**')[0].runs).toEqual([
      run('**', { marker: true }),
      run('a ', { bold: true }),
      run('`', { marker: true, bold: true }),
      run('b', { code: true, bold: true }),
      run('`', { marker: true, bold: true }),
      run(' c', { bold: true }),
      run('**', { marker: true }),
    ]);
  });

  it('keeps a tag glued to code out of the tag run', () => {
    expect(markdownLines('#a`b`')[0].runs.some((r) => r.tag)).toBe(false);
  });
});

describe('markdownLines fenced code', () => {
  it('turns lines between fences into code and fence lines into markers', () => {
    const lines = markdownLines('```js\n# not heading\n- [ ] not todo\n```\n# after');
    expect(lines.map((l) => l.kind)).toEqual(['fence', 'code', 'code', 'fence', 'heading1']);
    expect(lines[0].runs).toEqual([run('```js', { marker: true })]);
    expect(lines[1].runs).toEqual([run('# not heading', { code: true })]);
    expect(lines[2].runs).toEqual([run('- [ ] not todo', { code: true })]);
    expect(lines[3].runs).toEqual([run('```', { marker: true })]);
  });

  it('does not tag, bold or link inside code lines', () => {
    const [, c] = markdownLines('```\n#tag **b** [a](b) `x`\n```');
    expect(c.runs).toEqual([run('#tag **b** [a](b) `x`', { code: true })]);
  });

  it('gives an empty code line no runs', () => {
    expect(markdownLines('```\n\n```')[1]).toEqual({ kind: 'code', runs: [], eol: '\n' });
  });

  it('closes with a longer fence but not a shorter one or one with text', () => {
    expect(kindsOf('````\na\n```\nb\n`````\nc')).toEqual([
      'fence',
      'code',
      'code',
      'code',
      'fence',
      'plain',
    ]);
    expect(kindsOf('```\na\n``` x\nb')).toEqual(['fence', 'code', 'code', 'code']);
  });

  it('runs an unclosed fence to the end of the body', () => {
    expect(kindsOf('a\n```\n# b\n- c')).toEqual(['plain', 'fence', 'code', 'code']);
  });

  it('allows up to three spaces of indent on fences and closes with trailing spaces', () => {
    expect(kindsOf('   ```\na\n  ```  \nb')).toEqual(['fence', 'code', 'fence', 'plain']);
    expect(kindsOf('    ```\na')).toEqual(['plain', 'plain']);
  });

  it('does not open a fence when the info string has a backtick', () => {
    expect(kindsOf('```a`b\nc')).toEqual(['plain', 'plain']);
    // Three backticks on one line are inline code, not a fence.
    expect(markdownLines('```x```')[0].runs[1]).toEqual(run('x', { code: true }));
  });

  it('does not support ~~~', () => {
    expect(kindsOf('~~~\na\n~~~')).toEqual(['plain', 'plain', 'plain']);
  });

  it('works with CRLF and CR line endings', () => {
    expect(kindsOf('```\r\n# a\r\n```\r# b')).toEqual(['fence', 'code', 'fence', 'heading1']);
    expect(markdownLines('```\r\na\r\n```').map((l) => l.eol)).toEqual(['\r\n', '\r\n', '']);
  });

  it('markdownLineKinds matches markdownLines', () => {
    const body = '# a\n```\n- [ ] x\n```\n---\n- [x](u)\n> q\n1. n\n### h\n```\nopen';
    expect(markdownLineKinds(body)).toEqual(kindsOf(body));
  });
});

describe('markdownLines links, images and wikilinks', () => {
  it('splits a link into markers and linked text', () => {
    expect(markdownLines('see [site](http://a.b/c) now')[0].runs).toEqual([
      run('see '),
      run('[', { marker: true }),
      run('site', { link: { kind: 'web', target: 'http://a.b/c' } }),
      run('](http://a.b/c)', { marker: true }),
      run(' now'),
    ]);
  });

  it('splits an image, with and without alt', () => {
    expect(markdownLines('![pic](u.png)')[0].runs).toEqual([
      run('![', { marker: true }),
      run('pic', { link: { kind: 'image', target: 'u.png' } }),
      run('](u.png)', { marker: true }),
    ]);
    expect(markdownLines('![](u.png)')[0].runs).toEqual([run('![](u.png)', { marker: true })]);
  });

  it('splits a wikilink and trims its target', () => {
    expect(markdownLines('[[ Foo bar ]]')[0].runs).toEqual([
      run('[[', { marker: true }),
      run(' Foo bar ', { link: { kind: 'wiki', target: 'Foo bar' } }),
      run(']]', { marker: true }),
    ]);
  });

  it('allows one level of balanced parentheses in the url', () => {
    const runs = markdownLines('[a](http://x/(b)c)')[0].runs;
    expect(runs[1]).toEqual(run('a', { link: { kind: 'web', target: 'http://x/(b)c' } }));
    expect(runs[2]).toEqual(run('](http://x/(b)c)', { marker: true }));
    // Two levels deep is not a link.
    expect(markdownLines('[a](x(y(z)))')[0].runs.some((r) => r.link)).toBe(false);
  });

  it.each([
    '[](u)',
    '[a]()',
    '[a](b c)',
    '[a](b',
    '[a] (b)',
    '[a[b]](c)',
    '[a',
    '[[',
    '[[]]',
    '[[  ]]',
    '[[a[b]]',
    '[[a]',
    '![a](',
    '[a]b(c)',
  ])('%j is not a link', (line) => {
    const [l] = markdownLines(line);
    expect(l.runs.some((r) => r.link)).toBe(false);
    expect(l.runs.map((r) => r.text).join('')).toBe(line);
  });

  it('limits a wikilink target to 200 characters', () => {
    const ok = `[[${'a'.repeat(200)}]]`;
    const long = `[[${'a'.repeat(201)}]]`;
    expect(markdownLines(ok)[0].runs.some((r) => r.link?.kind === 'wiki')).toBe(true);
    expect(markdownLines(long)[0].runs.some((r) => r.link)).toBe(false);
  });

  it('does not tag a #anchor in a url and keeps ** in a url literal', () => {
    const runs = markdownLines('[a](http://x/#anchor**b**)')[0].runs;
    expect(runs.some((r) => r.tag || r.bold)).toBe(false);
  });

  it('does not tag inside a wikilink body', () => {
    expect(markdownLines('[[#foo]]')[0].runs.some((r) => r.tag)).toBe(false);
  });

  it('styles bold and tags inside link text', () => {
    expect(markdownLines('[**a** #b](u)')[0].runs).toEqual([
      run('[', { marker: true }),
      run('**', { marker: true, link: { kind: 'web', target: 'u' } }),
      run('a', { bold: true, link: { kind: 'web', target: 'u' } }),
      run('**', { marker: true, link: { kind: 'web', target: 'u' } }),
      run(' ', { link: { kind: 'web', target: 'u' } }),
      run('#b', { tag: true, link: { kind: 'web', target: 'u' } }),
      run('](u)', { marker: true }),
    ]);
  });

  it('keeps an inline code span inside link text', () => {
    const runs = markdownLines('[`a`](u)')[0].runs;
    expect(runs.some((r) => r.code && r.text === 'a')).toBe(true);
  });

  it('does not let a ** inside a link close a bold from outside', () => {
    const runs = markdownLines('**a [b**](u)')[0].runs;
    expect(runs.some((r) => r.bold)).toBe(false);
    expect(runs.some((r) => r.link?.target === 'u')).toBe(true);
  });

  it('wraps a link in bold', () => {
    const runs = markdownLines('**[a](u)**')[0].runs;
    expect(runs.find((r) => r.link)).toEqual(
      run('a', { bold: true, link: { kind: 'web', target: 'u' } }),
    );
  });

  it('keeps - [x](url) a bullet with a link, not a checkbox', () => {
    const [l] = markdownLines('- [x](http://a)');
    expect(l.kind).toBe('bullet');
    expect(l.checked).toBeUndefined();
    expect(l.runs.find((r) => r.link)).toEqual(
      run('x', { link: { kind: 'web', target: 'http://a' } }),
    );
  });

  it('still reads "- [x] (note)" as a checkbox', () => {
    expect(markdownLines('- [x] (note)')[0]).toMatchObject({ kind: 'checkbox', checked: true });
  });

  it('reads "- [[Foo]]" as a bullet with a wikilink', () => {
    const [l] = markdownLines('- [[Foo]]');
    expect(l.kind).toBe('bullet');
    expect(l.runs.find((r) => r.link)).toEqual(
      run('Foo', { link: { kind: 'wiki', target: 'Foo' } }),
    );
  });

  it('reads "1. [a](b)" as a numbered item with a link', () => {
    const [l] = markdownLines('1. [a](b)');
    expect(l.kind).toBe('numbered');
    expect(l.runs.some((r) => r.link?.target === 'b')).toBe(true);
  });

  it('does not merge adjacent runs that differ only in code or link', () => {
    const runs = markdownLines('[a](u)[b](v)')[0].runs.filter((r) => r.link);
    expect(runs.map((r) => r.link?.target)).toEqual(['u', 'v']);
    expect(markdownLines('a`b`')[0].runs.map((r) => !!r.code)).toEqual([false, false, true, false]);
  });

  it('round-trips unicode and emoji around spans', () => {
    const s = '😀 [日本](http://x/😀) `é` [[夢]] #タグ';
    expect(rebuild(s)).toBe(s);
    expect(markdownLines(s)[0].runs.some((r) => r.tag && r.text === '#タグ')).toBe(true);
  });
});

describe('markdownLines edge cases', () => {
  it('leaves unclosed markers as text', () => {
    for (const s of ['**a', '`a', '[a', '[[a', '![a', '[a](', '```', '* ']) {
      expect(rebuild(s)).toBe(s);
    }
    expect(markdownLines('a **b `c')[0].runs).toEqual([run('a **b `c')]);
  });

  it('keeps code with # and * as code', () => {
    expect(markdownLines('`# a * b`')[0].runs[1]).toEqual(run('# a * b', { code: true }));
  });
});

describe('markdownLines properties', () => {
  const alphabet = ['`', '[', ']', '(', ')', '*', '#', '-', '!', ' ', 'a', '\n', '\r'];
  let seed = 20261021;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  it('rebuilds the body and keeps excludedRanges valid for random bodies', () => {
    for (let i = 0; i < 1500; i++) {
      let s = '';
      const n = Math.floor(rnd() * 30);
      for (let k = 0; k < n; k++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      const lines = markdownLines(s);
      expect(lines.map((l) => l.runs.map((r) => r.text).join('') + l.eol).join('')).toBe(s);
      expect(markdownLineKinds(s)).toEqual(lines.map((l) => l.kind));
      let prevEnd = 0;
      for (const [a, b] of excludedRanges(s)) {
        expect(a).toBeGreaterThanOrEqual(prevEnd);
        expect(b).toBeGreaterThan(a);
        expect(b).toBeLessThanOrEqual(s.length);
        prevEnd = b;
      }
    }
  });

  const tagRuns = (body: string) => {
    const out: { text: string; at: number }[] = [];
    let at = 0;
    for (const l of markdownLines(body)) {
      for (const r of l.runs) {
        if (r.tag) out.push({ text: r.text, at });
        at += r.text.length;
      }
      at += l.eol.length;
    }
    return out;
  };
  const scanned = (body: string) =>
    scanTags(body).map((m) => ({ text: body.slice(m.start, m.end), at: m.start }));

  it.each([
    '[#x](u)',
    '[link](#anchor)',
    '[[#x]]',
    '`#x`',
    '```\n#x\n```',
    '```\n#x',
    '#a`c`',
    '#a `c` #b',
    '- [ ] #a [l](#b) `#c`',
    '> #q\r\n```\r\n#x\r\n```\r\n#y',
  ])('tag runs equal scanTags for %j', (body) => {
    expect(tagRuns(body)).toEqual(scanned(body));
  });

  it('tag runs equal scanTags(body) for random bodies', () => {
    for (let i = 0; i < 1500; i++) {
      let s = '';
      const n = Math.floor(rnd() * 30);
      for (let k = 0; k < n; k++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      expect(tagRuns(s)).toEqual(scanned(s));
    }
  });
});

describe('indentWidth and listIndentDepths', () => {
  const depths = (lines: string[]) => listIndentDepths(lines.map((l) => parseListPrefix(l)));
  it('counts a tab as INDENT_WIDTH columns and anything else as 1', () => {
    expect(INDENT_WIDTH).toBe(4);
    expect(indentWidth('')).toBe(0);
    expect(indentWidth('  ')).toBe(2);
    expect(indentWidth('\t')).toBe(4);
    expect(indentWidth('\t  ')).toBe(6);
    expect(indentWidth(' \t')).toBe(5);
  });
  it('gives relative depths', () => {
    expect(depths(['- a', '  - b', '    - c'])).toEqual([0, 1, 2]);
    expect(depths(['- a', '    - b', '        - c'])).toEqual([0, 1, 2]);
    expect(depths(['- a', '  - b', '      - c'])).toEqual([0, 1, 2]);
    expect(depths(['  - a'])).toEqual([1]);
    expect(depths(['    1. a'])).toEqual([1]);
    expect(depths(['- a', '      - b'])).toEqual([0, 1]);
  });
  it('pops back to a shallower level and never below the base', () => {
    expect(depths(['- a', '    - b', '        - c', '    - d', '- e'])).toEqual([0, 1, 2, 1, 0]);
    expect(depths(['    - a', '- b'])).toEqual([1, 0]);
  });
  it('a non-list line resets the stack', () => {
    expect(depths(['- a', '    - b', 'text', '    - c'])).toEqual([0, 1, 0, 1]);
  });
  it('mixes tabs and spaces', () => {
    expect(depths(['- a', '\t- b', '\t\t- c', '    - d'])).toEqual([0, 1, 2, 1]);
  });
  it('is empty for no lines', () => {
    expect(listIndentDepths([])).toEqual([]);
  });
});

describe('parentIndentWidths', () => {
  const widths = (body: string) =>
    parentIndentWidths(body.split('\n').map((l) => parseListPrefix(l)));

  it('gives the nearest shallower indent in the list block', () => {
    expect(widths('- a\n  - b\n      - c\n    - d')).toEqual([0, 0, 2, 2]);
    expect(widths('- a\n    - b\n        - c')).toEqual([0, 0, 4]);
    expect(widths('        - a')).toEqual([0]);
    expect(widths('- a\n  - b\n\nplain\n    - c')).toEqual([0, 0, 0, 0, 0]);
  });
});
