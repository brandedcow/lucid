import { Platform, type TextStyle } from 'react-native';
import { colors } from '../theme';
import { markdownLines, type MarkdownLine, type MarkdownRun } from '../utils/markdownLines';

/**
 * How much of the note's markdown the editor shows styled. The device spike (chunk 6c) decides the
 * shipped values of the constants below; see the fallback ladder in the chunk 6 architect report.
 * - full: sized headings, bold / italic, dimmed markers, strike-through on checked items, tags,
 *   monospace code on a muted background, underlined accent links.
 * - basic: as full, but headings are bold + heading colour at body size (no fontSize / lineHeight),
 *   links are accent colour only, and code is not styled.
 * - tagsOnly: only `#tag` runs are styled.
 * - none: one plain run.
 */
export type StyleLevel = 'full' | 'basic' | 'tagsOnly' | 'none';

export const STYLE_LEVEL: StyleLevel = 'full';
/** Above this many characters the input renders one plain run (tuned in the spike). */
export const STYLE_MAX_CHARS = 20000;
export const EDIT_MODE: 'remount' | 'inPlace' = 'remount';
export const LIST_CONTINUE = true;

/** The body font size of the add-entry body input, used when the caller's style gives none. */
export const DEFAULT_BODY_FONT_SIZE = 17;
export const HEADING1_SCALE = 1.5;
export const HEADING2_SCALE = 1.25;
export const HEADING3_SCALE = 1.125;
const HEADING_LINE_HEIGHT_SCALE = 1.3;

export type RunSpec = { key: string; text: string; style?: TextStyle };

// Code keeps the body font size and sets no lineHeight (a per-child lineHeight in a TextInput is risky).
const CODE_STYLE: TextStyle = {
  fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  backgroundColor: colors.tagChipBg,
};

// Same look as the tag runs of the shipped TaggedBodyInput (copied, not imported: chunk 8 deletes it).
const TAG_STYLE: TextStyle = {
  color: colors.accent,
  fontWeight: '600',
  backgroundColor: colors.emotionChipBg,
  borderRadius: 6,
};

function runStyle(
  line: MarkdownLine,
  run: MarkdownRun,
  level: StyleLevel,
  baseSize: number,
): TextStyle | undefined {
  const style: TextStyle = {};
  const markdown = level === 'full' || level === 'basic';
  if (markdown) {
    const heading =
      line.kind === 'heading1' || line.kind === 'heading2' || line.kind === 'heading3';
    if (heading) {
      style.fontWeight = '700';
      style.color = colors.text;
      if (level === 'full') {
        const scale =
          line.kind === 'heading1'
            ? HEADING1_SCALE
            : line.kind === 'heading2'
              ? HEADING2_SCALE
              : HEADING3_SCALE;
        const size = baseSize * scale;
        style.fontSize = size;
        style.lineHeight = size * HEADING_LINE_HEIGHT_SCALE;
      }
    }
    if (run.bold) style.fontWeight = '700';
    if (run.italic) style.fontStyle = 'italic';
    // Quotes are outside the supported syntax: their marker is not dimmed.
    if (run.marker && line.kind !== 'quote') {
      style.color =
        line.kind === 'checkbox' && !line.checked && /^[-*] \[/.test(run.text)
          ? colors.accent
          : colors.muted;
    } else if (line.kind === 'checkbox' && line.checked && level === 'full') {
      style.color = colors.muted;
      style.textDecorationLine = 'line-through';
    }
    // After the marker styling: link text (and markers inside it, which carry `link`) takes the
    // accent; the brackets and destination do not carry `link` and stay dimmed.
    if (run.link) {
      style.color = colors.accent;
      if (level === 'full') {
        // A checked item keeps its strike-through: RN accepts the combined value on nested Text.
        style.textDecorationLine =
          style.textDecorationLine === 'line-through' ? 'underline line-through' : 'underline';
      }
    }
    if (run.code && level === 'full') Object.assign(style, CODE_STYLE);
  }
  if (run.tag) {
    Object.assign(style, TAG_STYLE);
    if (markdown && (run.bold || line.kind.startsWith('heading'))) {
      style.fontWeight = '700';
    }
    if (markdown && line.kind === 'checkbox' && line.checked && level === 'full') {
      style.textDecorationLine = 'line-through';
    }
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

/**
 * The note body as styled text runs for the editor's nested <Text> children. Pure. The run texts
 * always join back to `body` exactly (each line's eol is its own unstyled run), whatever the level.
 * `baseSize` is the body font size that heading sizes scale from.
 */
export function noteRuns(
  body: string,
  level: StyleLevel,
  baseSize: number = DEFAULT_BODY_FONT_SIZE,
): RunSpec[] {
  if (body === '') return [];
  if (level === 'none' || body.length > STYLE_MAX_CHARS) return [{ key: 'all', text: body }];
  const out: RunSpec[] = [];
  markdownLines(body).forEach((line, li) => {
    line.runs.forEach((run, ri) => {
      const spec: RunSpec = { key: `${li}-${ri}`, text: run.text };
      const style = runStyle(line, run, level, baseSize);
      if (style) spec.style = style;
      out.push(spec);
    });
    if (line.eol !== '') out.push({ key: `${li}-eol`, text: line.eol });
  });
  return out;
}
