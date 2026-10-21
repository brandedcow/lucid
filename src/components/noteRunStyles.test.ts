import { Platform } from 'react-native';
import { colors } from '../theme';
import {
  DEFAULT_BODY_FONT_SIZE,
  HEADING3_SCALE,
  STYLE_MAX_CHARS,
  noteRuns,
  type StyleLevel,
} from './noteRunStyles';

const LEVELS: StyleLevel[] = ['full', 'basic', 'tagsOnly', 'none'];
const BODIES = [
  '',
  'plain',
  '# Title #tag\n## Two\n- a\n* b\n1. c\n- [ ] d\n- [x] e #done\n> q',
  'a\r\nb **bold** *it*\r\n- [ ] c',
  'emoji 😀 **bo😀ld** #t😀',
  'unclosed **bold and *it',
  'mid#word and # not tag\n\n\n',
  'old mac\rline',
  '### H3 #t\n---\nuse `code` and ``a`b``\n```js\nlet x = [1](2)\n**not bold**\n```\nafter',
  '[web **bold** link](http://a.b) ![alt](http://i.png) [[Wiki Page]] [[x|y]]',
  '[`code link`](http://a) [unclosed](http://a `tick',
  '- [x](http://a) item\r\n```\r\nunclosed fence',
  '[😀 link](http://a/😀) `co😀de` [[Wiki 😀]]',
];

const find = (body: string, level: StyleLevel, text: string) =>
  noteRuns(body, level).find((r) => r.text === text);

describe('noteRuns', () => {
  it.each(LEVELS)('run texts join back to the body at level %s', (level) => {
    for (const body of BODIES) {
      expect(
        noteRuns(body, level)
          .map((r) => r.text)
          .join(''),
      ).toBe(body);
    }
  });

  it('keys are unique', () => {
    for (const level of LEVELS) {
      for (const body of BODIES) {
        const keys = noteRuns(body, level).map((r) => r.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it('sizes headings in full: bold, 1.5x and 1.25x body size, a line height that fits', () => {
    const [marker1, text1] = noteRuns('# One\n## Two', 'full');
    expect(marker1.text).toBe('# ');
    expect(text1.style).toMatchObject({
      fontWeight: '700',
      color: colors.text,
      fontSize: DEFAULT_BODY_FONT_SIZE * 1.5,
    });
    expect(text1.style?.lineHeight).toBeGreaterThan(DEFAULT_BODY_FONT_SIZE * 1.5);
    const two = find('# One\n## Two', 'full', 'Two')!;
    expect(two.style?.fontSize).toBe(DEFAULT_BODY_FONT_SIZE * 1.25);
    // The marker keeps the heading size but is dimmed.
    expect(marker1.style).toMatchObject({
      color: colors.muted,
      fontSize: DEFAULT_BODY_FONT_SIZE * 1.5,
    });
  });

  it('scales heading sizes from the base size given', () => {
    expect(noteRuns('# One', 'full', 24)[1].style?.fontSize).toBe(36);
  });

  it('basic headings are bold only, at body size and without line height', () => {
    const style = find('# One', 'basic', 'One')?.style;
    expect(style).toMatchObject({ fontWeight: '700', color: colors.text });
    expect(style).not.toHaveProperty('fontSize');
    expect(style).not.toHaveProperty('lineHeight');
  });

  it('bold, italic and both combine', () => {
    expect(find('**b**', 'full', 'b')?.style).toMatchObject({ fontWeight: '700' });
    expect(find('*i*', 'full', 'i')?.style).toMatchObject({ fontStyle: 'italic' });
    const both = noteRuns('**a *b* c**', 'full').find((r) => r.text === 'b')!;
    expect(both.style).toMatchObject({ fontWeight: '700', fontStyle: 'italic' });
  });

  it('dims markers with the muted colour, not the placeholder colour', () => {
    for (const m of ['**', '- ']) {
      const marker = noteRuns(m === '**' ? '**b**' : '- a', 'full')[0];
      expect(marker.text).toBe(m);
      expect(marker.style?.color).toBe(colors.muted);
      expect(marker.style?.color).not.toBe(colors.faint);
    }
  });

  it('colours an unchecked checkbox marker with the accent and a checked one muted', () => {
    expect(find('- [ ] a', 'full', '- [ ] ')?.style?.color).toBe(colors.accent);
    expect(find('- [x] a', 'full', '- [x] ')?.style?.color).toBe(colors.muted);
  });

  it('strikes through checked items only in full', () => {
    expect(find('- [x] done', 'full', 'done')?.style).toMatchObject({
      color: colors.muted,
      textDecorationLine: 'line-through',
    });
    expect(find('- [x] done', 'basic', 'done')?.style).toBeUndefined();
    expect(find('- [ ] open', 'full', 'open')?.style).toBeUndefined();
  });

  it('styles tags found by scanTags, not a # inside a word or a heading marker', () => {
    const tagged = (body: string) =>
      noteRuns(body, 'full')
        .filter((r) => r.style?.backgroundColor === colors.emotionChipBg)
        .map((r) => r.text);
    expect(tagged('a #water b')).toEqual(['#water']);
    expect(tagged('mid#word')).toEqual([]);
    expect(tagged('# Title')).toEqual([]);
    expect(tagged('# Title #tag')).toEqual(['#tag']);
    expect(find('a #water', 'full', '#water')?.style).toMatchObject({ color: colors.accent });
  });

  it('tagsOnly styles tag runs and nothing else', () => {
    const runs = noteRuns('# Head **b** #tag\n- [x] c', 'tagsOnly');
    const styled = runs.filter((r) => r.style);
    expect(styled.map((r) => r.text)).toEqual(['#tag']);
  });

  it('leaves quote lines unstyled', () => {
    const runs = noteRuns('> quoted', 'full');
    expect(runs.every((r) => r.style === undefined)).toBe(true);
  });

  it('puts each eol in its own unstyled run', () => {
    const runs = noteRuns('# A\r\nb', 'full');
    const eol = runs.find((r) => r.text === '\r\n')!;
    expect(eol.style).toBeUndefined();
    expect(eol.key).toMatch(/eol/);
    expect(runs.filter((r) => r.text.includes('\n'))).toHaveLength(1);
  });

  it('is a single unstyled run at level none and for an over-long body', () => {
    expect(noteRuns('# a\n- b', 'none')).toEqual([{ key: 'all', text: '# a\n- b' }]);
    const long = '# h\n' + 'x'.repeat(STYLE_MAX_CHARS);
    const runs = noteRuns(long, 'full');
    expect(runs).toHaveLength(1);
    expect(runs[0].style).toBeUndefined();
    expect(runs[0].text).toBe(long);
  });

  it('is empty for an empty body', () => {
    expect(noteRuns('', 'full')).toEqual([]);
  });

  describe('new markdown tokens', () => {
    const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
    const styleOf = (body: string, level: StyleLevel, text: string) =>
      find(body, level, text)?.style;

    it('sizes H3 at 1.125x body in full and leaves it at body size in basic', () => {
      expect(styleOf('### Three', 'full', 'Three')).toMatchObject({
        fontWeight: '700',
        color: colors.text,
        fontSize: DEFAULT_BODY_FONT_SIZE * HEADING3_SCALE,
      });
      expect(noteRuns('### Three', 'full')[0].style).toMatchObject({ color: colors.muted });
      const basic = styleOf('### Three', 'basic', 'Three');
      expect(basic).toMatchObject({ fontWeight: '700' });
      expect(basic).not.toHaveProperty('fontSize');
      expect(styleOf('### Three', 'tagsOnly', 'Three')).toBeUndefined();
      expect(styleOf('### Three', 'none', '### Three')).toBeUndefined();
    });

    it('dims rule lines and fence lines at full and basic only', () => {
      for (const body of ['---', '```\n```']) {
        const first = body.split('\n')[0];
        expect(styleOf(body, 'full', first)).toEqual({ color: colors.muted });
        expect(styleOf(body, 'basic', first)).toEqual({ color: colors.muted });
        expect(styleOf(body, 'tagsOnly', first)).toBeUndefined();
        expect(styleOf(body, 'none', body)).toBeUndefined();
      }
      expect(styleOf('```js\nx\n```', 'full', '```js')).toEqual({ color: colors.muted });
      expect(styleOf('```js\nx\n```', 'full', '```')).toEqual({ color: colors.muted });
    });

    it('styles inline code and code lines as monospace on a muted background', () => {
      const inline = styleOf('a `code` b', 'full', 'code');
      expect(inline).toEqual({ fontFamily: mono, backgroundColor: colors.tagChipBg });
      expect(styleOf('a `code` b', 'full', '`')).toEqual({ color: colors.muted });
      expect(styleOf('```\n**x** [a](b)\n```', 'full', '**x** [a](b)')).toEqual({
        fontFamily: mono,
        backgroundColor: colors.tagChipBg,
      });
      for (const level of ['basic', 'tagsOnly', 'none'] as const) {
        expect(styleOf('a `code` b', level, 'code')).toBeUndefined();
        expect(styleOf('```\nx\n```', level, 'x')).toBeUndefined();
      }
    });

    it('code never sets lineHeight and keeps the body font size', () => {
      for (const body of ['a `code` b', '```\ncode line\n```']) {
        for (const size of [undefined, 24]) {
          const runs = noteRuns(body, 'full', size).filter((r) => r.style?.fontFamily);
          expect(runs.length).toBeGreaterThan(0);
          for (const r of runs) {
            expect(r.style).not.toHaveProperty('lineHeight');
            expect(r.style).not.toHaveProperty('fontSize');
          }
        }
      }
    });

    it('styles web link, image alt and wikilink text with the accent, underlined only in full', () => {
      for (const [body, text] of [
        ['[site](http://a.b)', 'site'],
        ['![pic](http://a.b/i.png)', 'pic'],
        ['[[Wiki Page]]', 'Wiki Page'],
      ]) {
        expect(styleOf(body, 'full', text)).toEqual({
          color: colors.accent,
          textDecorationLine: 'underline',
        });
        expect(styleOf(body, 'basic', text)).toEqual({ color: colors.accent });
        expect(styleOf(body, 'tagsOnly', text)).toBeUndefined();
        expect(styleOf(body, 'none', body)).toBeUndefined();
      }
    });

    it('dims bracket and destination markers but not markers inside link text', () => {
      const runs = noteRuns('[a **b** c](http://x)', 'full');
      const bracket = runs.find((r) => r.text === '[')!;
      const dest = runs.find((r) => r.text === '](http://x)')!;
      expect(bracket.style).toEqual({ color: colors.muted });
      expect(dest.style).toEqual({ color: colors.muted });
      const stars = runs.filter((r) => r.text === '**');
      expect(stars).toHaveLength(2);
      for (const r of stars) {
        expect(r.style).toMatchObject({ color: colors.accent, textDecorationLine: 'underline' });
      }
      expect(runs.find((r) => r.text === 'b')!.style).toMatchObject({
        fontWeight: '700',
        color: colors.accent,
      });
    });

    it('composes code and link styles on a run that has both', () => {
      const style = styleOf('[`both`](http://a)', 'full', 'both');
      expect(style).toEqual({
        fontFamily: mono,
        backgroundColor: colors.tagChipBg,
        color: colors.accent,
        textDecorationLine: 'underline',
      });
    });

    it('keeps the strike-through on a checked item whose text is a link', () => {
      expect(styleOf('- [x] [a](http://u)', 'full', 'a')).toEqual({
        color: colors.accent,
        textDecorationLine: 'underline line-through',
      });
      expect(styleOf('- [x] [a](http://u)', 'basic', 'a')).toEqual({ color: colors.accent });
      expect(styleOf('- [x] [a](http://u)', 'tagsOnly', 'a')).toBeUndefined();
      expect(styleOf('- [ ] [a](http://u)', 'full', 'a')).toEqual({
        color: colors.accent,
        textDecorationLine: 'underline',
      });
      expect(styleOf('- [x] plain', 'full', 'plain')).toEqual({
        color: colors.muted,
        textDecorationLine: 'line-through',
      });
    });

    it('inline code in a heading keeps the heading size and sets none of its own', () => {
      const head = styleOf('# Head `c` x', 'full', 'Head ');
      const code = styleOf('# Head `c` x', 'full', 'c');
      expect(code).toMatchObject({ fontFamily: mono, fontSize: head?.fontSize });
      expect(code?.lineHeight).toBe(head?.lineHeight);
      expect(head?.fontSize).toBeGreaterThan(DEFAULT_BODY_FONT_SIZE);
    });

    it('does not style the wikilink by whether the note exists', () => {
      expect(styleOf('[[Nope]]', 'full', 'Nope')).toEqual(styleOf('[[Other]]', 'full', 'Other'));
    });
  });

  describe('text invariance', () => {
    it.each(LEVELS)('joins back to the body for every sample at level %s', (level) => {
      for (const body of BODIES) {
        for (const size of [undefined, 30]) {
          expect(
            noteRuns(body, level, size)
              .map((r) => r.text)
              .join(''),
          ).toBe(body);
        }
      }
    });

    it('holds for 600 seeded random bodies at every level, with unique keys', () => {
      const alphabet = ['`', '[', ']', '(', ')', '*', '#', '-', '!', ' ', 'a', '\n', '\r'];
      let seed = 12345;
      const next = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < 600; i += 1) {
        const len = Math.floor(next() * 40);
        let body = '';
        for (let j = 0; j < len; j += 1) body += alphabet[Math.floor(next() * alphabet.length)];
        for (const level of LEVELS) {
          const runs = noteRuns(body, level);
          expect(runs.map((r) => r.text).join('')).toBe(body);
          expect(new Set(runs.map((r) => r.key)).size).toBe(runs.length);
        }
      }
    });
  });
});
