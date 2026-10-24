import { markdownBlocks, type BlockKind } from './markdownBlocks';

const kinds = (body: string): BlockKind[] => markdownBlocks(body).map((b) => b.kind);

describe('markdownBlocks kinds', () => {
  const table: [string, string, BlockKind][] = [
    ['h1', '# T', 'heading1'],
    ['h2', '## T', 'heading2'],
    ['h3', '### T', 'heading3'],
    ['four hashes', '#### T', 'paragraph'],
    ['bullet -', '- a', 'bullet'],
    ['bullet *', '* a', 'bullet'],
    ['numbered', '12. a', 'numbered'],
    ['checkbox', '- [ ] a', 'checkbox'],
    ['quote', '> a', 'quote'],
    ['rule', '---', 'rule'],
    ['rule spaced', '* * *', 'rule'],
    ['paragraph', 'hello', 'paragraph'],
    ['empty', '', 'blank'],
    ['spaces only', '   ', 'blank'],
    ['image', '![a](https://x/y.png)', 'image'],
  ];
  it.each(table)('%s', (_n, body, kind) => {
    expect(kinds(body)).toEqual([kind]);
  });

  it('empty body is one blank block', () => {
    expect(markdownBlocks('')).toEqual([
      { kind: 'blank', startOffset: 0, endOffset: 0, depth: 0, runs: [] },
    ]);
  });

  it('keeps the marker flag on runs', () => {
    const [b] = markdownBlocks('## Hi **x**');
    expect(b.runs[0]).toEqual({ text: '## ', marker: true });
    expect(b.runs.map((r) => r.text).join('')).toBe('## Hi **x**');
  });

  it('blank lines between paragraphs', () => {
    expect(kinds('a\n\nb\n')).toEqual(['paragraph', 'blank', 'paragraph', 'blank']);
  });
});

describe('lists', () => {
  it('computes relative depth for a regular 2-space note', () => {
    const body = '- a\n  - b\n    1. c\n      - [x] d\n  - e';
    expect(markdownBlocks(body).map((b) => [b.kind, b.depth])).toEqual([
      ['bullet', 0],
      ['bullet', 1],
      ['numbered', 2],
      ['checkbox', 3],
      ['bullet', 1],
    ]);
  });
  it('odd widths and a tab (4 columns) nest relative to the stack', () => {
    // widths 0,2,4,6,3,tab(4): the 3 pops to 2 and pushes (depth 2); the tab (4) is deeper than 3 and pushes (depth 3).
    const body = '- a\n  - b\n    1. c\n      - [x] d\n   - e\n\t- f';
    expect(markdownBlocks(body).map((b) => b.depth)).toEqual([0, 1, 2, 3, 2, 3]);
  });
  it.each([
    ['0/2/4 spaces', '- a\n  - b\n    - c', [0, 1, 2]],
    ['0/4/8 spaces', '- a\n    - b\n        - c', [0, 1, 2]],
    ['mixed 0/2/6', '- a\n  - b\n      - c', [0, 1, 2]],
    ['lone first item at 2', '  - a', [1]],
    ['lone first item at 4', '    - a', [1]],
    ['skipped level 0 then 6', '- a\n      - b', [0, 1]],
    ['tab nest', '- a\n\t- b\n\t\t- c', [0, 1, 2]],
    ['tab then 4 spaces equal', '- a\n\t- b\n    - c', [0, 1, 1]],
    ['tab plus 2 spaces', '- a\n\t- b\n\t  - c', [0, 1, 2]],
    ['paragraph resets', '- a\n    - b\ntext\n    - c', [0, 1, 0, 1]],
    ['blank resets', '- a\n    - b\n\n    - c', [0, 1, 0, 1]],
    ['heading resets', '- a\n    - b\n# H\n    - c', [0, 1, 0, 1]],
    ['fence resets', '- a\n    - b\n```\n    - x\n```\n    - c', [0, 1, 0, 0, 0, 1]],
    ['quote resets', '- a\n    - b\n> q\n    - c', [0, 1, 0, 1]],
    ['rule resets', '- a\n    - b\n---\n    - c', [0, 1, 0, 1]],
  ])('depths: %s', (_n, body, expected) => {
    expect(markdownBlocks(body).map((b) => b.depth)).toEqual(expected);
  });
  it('bullets, numbers and checkboxes share the same depths', () => {
    const body = '- a\n    1. b\n        - [ ] c\n    2. d';
    expect(markdownBlocks(body).map((b) => [b.kind, b.depth])).toEqual([
      ['bullet', 0],
      ['numbered', 1],
      ['checkbox', 2],
      ['numbered', 1],
    ]);
  });
  it('checked, unchecked and uppercase X', () => {
    const blocks = markdownBlocks('- [ ] a\n- [x] b\n- [X] c\n- a');
    expect(blocks.map((b) => b.checked)).toEqual([false, true, true, undefined]);
    expect('checked' in blocks[3]).toBe(false);
  });
  it('non-list blocks have depth 0 and no checked', () => {
    for (const b of markdownBlocks('# a\n  text\n---')) {
      expect(b.depth).toBe(0);
      expect(b.checked).toBeUndefined();
    }
  });
});

describe('fences', () => {
  it('open, content, close', () => {
    const body = '```js\n# not heading\n- not list\n```\n# after';
    expect(kinds(body)).toEqual(['fence', 'codeLine', 'codeLine', 'fence', 'heading1']);
  });
  it('code lines stay separate, blank code line is a codeLine with no runs', () => {
    const blocks = markdownBlocks('```\na\n\nb\n```');
    expect(blocks.map((b) => b.kind)).toEqual([
      'fence',
      'codeLine',
      'codeLine',
      'codeLine',
      'fence',
    ]);
    expect(blocks[2].runs).toEqual([]);
  });
  it('unclosed fence runs to the end', () => {
    expect(kinds('```\na\n![a](https://x/y)')).toEqual(['fence', 'codeLine', 'codeLine']);
  });
  it('an image inside a fence is code', () => {
    expect(markdownBlocks('```\n![a](https://x/y)\n```')[1].alt).toBeUndefined();
  });
});

describe('image blocks', () => {
  it('own-line image gives alt and url', () => {
    const [b] = markdownBlocks('![cat](https://x.com/c.png)');
    expect(b).toMatchObject({ kind: 'image', alt: 'cat', url: 'https://x.com/c.png' });
  });
  it('tolerates leading and trailing spaces and keeps offsets of the full line', () => {
    const body = '  ![cat](https://x/c.png)   ';
    const [b] = markdownBlocks(body);
    expect(b).toMatchObject({ kind: 'image', alt: 'cat', url: 'https://x/c.png' });
    expect([b.startOffset, b.endOffset]).toEqual([0, body.length]);
  });
  it('empty alt (tokenizer makes no link run)', () => {
    for (const body of ['![](u)', '  ![](u)  ', '![](https://x/y.png)']) {
      const [b] = markdownBlocks(body);
      expect(b.kind).toBe('image');
      expect(b.alt).toBe('');
      expect(b.url).toBe(body.trim().slice(4, -1));
      expect(b.runs.some((r) => r.link)).toBe(false);
    }
  });
  it('a title-like extra after the URL is not an image (whitespace in url)', () => {
    expect(kinds('![a](https://x/y "title")')).toEqual(['paragraph']);
  });
  it('trailing text makes it a paragraph; the alt run stays link-styled', () => {
    const [b] = markdownBlocks('![cat](https://x/c.png) after');
    expect(b.kind).toBe('paragraph');
    expect(b.runs.find((r) => r.link)).toMatchObject({ text: 'cat', link: { kind: 'image' } });
  });
  it('leading text, two images, and image in a list are not image blocks', () => {
    expect(kinds('see ![a](u)')).toEqual(['paragraph']);
    expect(kinds('![a](u)![b](v)')).toEqual(['paragraph']);
    expect(kinds('- ![a](u)')).toEqual(['bullet']);
    expect(kinds('# ![a](u)')).toEqual(['heading1']);
  });
  it('a link or non-image is not an image', () => {
    expect(kinds('[a](https://x)')).toEqual(['paragraph']);
    expect(kinds('!(u)')).toEqual(['paragraph']);
  });
  it('alt containing a code span', () => {
    const [b] = markdownBlocks('![a `b` c](u)');
    expect(b).toMatchObject({ kind: 'image', alt: 'a `b` c', url: 'u' });
  });
  it('url with one level of parentheses', () => {
    expect(markdownBlocks('![a](http://x/(y))')[0]).toMatchObject({
      kind: 'image',
      url: 'http://x/(y)',
    });
  });
});

describe('offsets', () => {
  it('CRLF, CR and LF', () => {
    const body = 'ab\r\ncd\r\r\nef\n';
    expect(markdownBlocks(body).map((b) => [b.startOffset, b.endOffset])).toEqual([
      [0, 2],
      [4, 6],
      [7, 7],
      [9, 11],
      [12, 12],
    ]);
  });
  it('emoji count as two UTF-16 units', () => {
    const body = '😀 a\n- 👍🏽 b\n![😀](https://x/y)';
    const blocks = markdownBlocks(body);
    for (const b of blocks)
      expect(b.runs.map((r) => r.text).join('')).toBe(body.slice(b.startOffset, b.endOffset));
    expect(blocks[0].endOffset).toBe(4);
    expect(blocks[1].startOffset).toBe(5);
    expect(blocks[2].alt).toBe('😀');
  });

  function rebuild(body: string): string {
    const blocks = markdownBlocks(body);
    let out = '';
    blocks.forEach((b, i) => {
      out += body.slice(b.startOffset, b.endOffset);
      if (i + 1 < blocks.length) out += body.slice(b.endOffset, blocks[i + 1].startOffset);
    });
    return out;
  }

  it('block ranges plus eols rebuild the body (seeded random bodies)', () => {
    const alphabet = [
      '`',
      '[',
      ']',
      '(',
      ')',
      '*',
      '#',
      '-',
      '!',
      ' ',
      'a',
      '\n',
      '\r',
      '1',
      '2',
      '.',
    ];
    let seed = 20261021;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let n = 0; n < 800; n++) {
      const len = Math.floor(rnd() * 40);
      let body = '';
      for (let i = 0; i < len; i++) body += alphabet[Math.floor(rnd() * alphabet.length)];
      const blocks = markdownBlocks(body);
      expect(rebuild(body)).toBe(body);
      expect(blocks[0].startOffset).toBe(0);
      expect(blocks[blocks.length - 1].endOffset).toBe(body.length);
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        expect(b.runs.map((r) => r.text).join('')).toBe(body.slice(b.startOffset, b.endOffset));
        if (i + 1 < blocks.length) {
          expect(['\n', '\r\n', '\r']).toContain(
            body.slice(b.endOffset, blocks[i + 1].startOffset),
          );
        }
        if (b.kind === 'image') {
          expect(b.url).toBeTruthy();
          expect(b.alt).toBeDefined();
        }
      }
    }
  });
});
