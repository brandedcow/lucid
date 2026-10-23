import { Platform, StyleSheet, type TextStyle } from 'react-native';
import { colors, spacing } from '../theme';
import type { BlockKind } from '../utils/markdownBlocks';
import type { MarkdownRun } from '../utils/markdownLines';
import {
  DEFAULT_BODY_FONT_SIZE,
  HEADING1_SCALE,
  HEADING2_SCALE,
  HEADING3_SCALE,
} from './noteRunStyles';

/** Styles of the reading view (rendered markdown). Sizes follow the editor's heading scales. */

export const BODY_SIZE = DEFAULT_BODY_FONT_SIZE;
export const BODY_LINE_HEIGHT = 24;
export const INDENT_PER_DEPTH = 20;
export const CHECKBOX_HIT = 44;
export const IMAGE_FIXED_HEIGHT = 200;
export const IMAGE_MAX_HEIGHT = 480;

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const HEADING_SCALES = {
  heading1: HEADING1_SCALE,
  heading2: HEADING2_SCALE,
  heading3: HEADING3_SCALE,
} as const;

/** Text style of a heading block. */
export function headingStyle(kind: 'heading1' | 'heading2' | 'heading3'): TextStyle {
  const size = BODY_SIZE * HEADING_SCALES[kind];
  return { fontSize: size, lineHeight: size * 1.3, fontWeight: '700', color: colors.text };
}

export type WikiState = 'exists' | 'missing' | 'invalid';

export interface RunStyleContext {
  kind: BlockKind;
  checked?: boolean;
  /** Web link that can be pressed (safe, and links are not disabled). */
  webLive: boolean;
  wikiState?: WikiState;
  linksDisabled: boolean;
}

/** Style of one non-marker run, or undefined for plain text. */
export function readingRunStyle(run: MarkdownRun, ctx: RunStyleContext): TextStyle | undefined {
  const style: TextStyle = {};
  if (run.bold) style.fontWeight = '700';
  if (run.italic) style.fontStyle = 'italic';
  if (run.code) {
    style.fontFamily = MONO;
    style.backgroundColor = colors.surface;
  }
  let decoration = '';
  if (ctx.kind === 'checkbox' && ctx.checked) {
    style.color = colors.muted;
    decoration = 'line-through';
  } else if (ctx.kind === 'quote') {
    style.color = colors.muted;
  }
  const link = run.link;
  if (link?.kind === 'image') {
    style.color = colors.muted;
  } else if (link?.kind === 'web' && ctx.webLive) {
    style.color = colors.accent;
    decoration = decoration ? 'underline line-through' : 'underline';
  } else if (link?.kind === 'wiki' && !ctx.linksDisabled && ctx.wikiState === 'exists') {
    style.color = colors.accent;
    decoration = decoration ? 'underline line-through' : 'underline';
  } else if (link?.kind === 'wiki' && !ctx.linksDisabled && ctx.wikiState === 'missing') {
    style.color = colors.accent;
    style.fontStyle = 'italic';
  }
  if (decoration) style.textDecorationLine = decoration as TextStyle['textDecorationLine'];
  return Object.keys(style).length > 0 ? style : undefined;
}

export const readingStyles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: spacing.sm },
  fill: { flexGrow: 1, minHeight: 48 },
  placeholder: { fontSize: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, color: colors.faint },
  text: { fontSize: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, color: colors.text },
  listRow: { flexDirection: 'row', alignItems: 'flex-start' },
  glyph: {
    width: 24,
    fontSize: BODY_SIZE,
    lineHeight: BODY_LINE_HEIGHT,
    color: colors.muted,
  },
  numberGlyph: {
    minWidth: 28,
    paddingRight: spacing.xs,
    fontSize: BODY_SIZE,
    lineHeight: BODY_LINE_HEIGHT,
    color: colors.muted,
  },
  listText: { flex: 1 },
  checkboxHit: {
    minWidth: CHECKBOX_HIT,
    minHeight: CHECKBOX_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkMark: { fontSize: 14, lineHeight: 16, fontWeight: '700', color: colors.accentDark },
  checkboxLabel: { flex: 1, paddingTop: (CHECKBOX_HIT - BODY_LINE_HEIGHT) / 2 },
  quoteRow: { flexDirection: 'row' },
  quoteBar: { width: 3, borderRadius: 2, backgroundColor: colors.border, marginRight: spacing.sm },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 12 },
  blank: { height: BODY_LINE_HEIGHT / 2 },
  codeSurface: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.sm,
    marginVertical: spacing.xs,
  },
  codeSurfaceEmpty: { minHeight: BODY_LINE_HEIGHT + spacing.sm * 2 },
  codeLine: {
    fontFamily: MONO,
    fontSize: BODY_SIZE - 1,
    lineHeight: BODY_LINE_HEIGHT,
    minHeight: BODY_LINE_HEIGHT,
    color: colors.text,
  },
  imageBox: { marginVertical: spacing.xs },
  imagePlaceholder: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    justifyContent: 'center',
  },
  imageAlt: { fontSize: BODY_SIZE, lineHeight: BODY_LINE_HEIGHT, color: colors.text },
  imageNote: { fontSize: 14, lineHeight: 20, color: colors.muted },
  imageFixed: { width: '100%', height: IMAGE_FIXED_HEIGHT, borderRadius: 8 },
  imageSized: { width: '100%', maxHeight: IMAGE_MAX_HEIGHT, borderRadius: 8 },
});
