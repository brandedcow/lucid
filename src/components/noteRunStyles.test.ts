import { colors } from '../theme';
import {
  DEFAULT_BODY_FONT_SIZE,
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
});
