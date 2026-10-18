import { markdownLines, plainLineText } from './markdownLines';

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

  it('does not treat ###, #word or a bare # as headings', () => {
    expect(markdownLines('### three')[0].kind).toBe('plain');
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
