import { memo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MarkdownBlock } from '../utils/markdownBlocks';
import type { MarkdownRun } from '../utils/markdownLines';
import { safeWebUrl } from '../utils/safeUrl';
import { ReadingImage } from './ReadingImage';
import {
  INDENT_PER_DEPTH,
  headingStyle,
  readingRunStyle,
  readingStyles as s,
  type WikiState,
} from './readingStyles';

export type ReadingBlockRowProps = {
  block: MarkdownBlock;
  /** Stable id of the top-level row (or code group) this block sits in; passed back to `onEdit`. */
  rowId: string;
  /** Caret goes to `offset` (the end of the tapped source line). */
  onEdit: (offset: number, rowId: string) => void;
  onToggleCheckbox: (offset: number) => void;
  onOpenWeb: (url: string) => void;
  onOpenNote: (target: string) => void;
  noteLinkState: (target: string) => WikiState;
  imagesEnabled: boolean;
  linksDisabled: boolean;
};

const EDIT_HINT = 'Double tap to edit.';

/** The runs that are shown: no markers, and no indent or prefix run of list items and quotes. */
function visibleRuns(block: MarkdownBlock): MarkdownRun[] {
  const { kind, runs } = block;
  if (kind === 'codeLine') return runs;
  let start = 0;
  if (kind === 'bullet' || kind === 'numbered' || kind === 'checkbox' || kind === 'quote') {
    const i = runs.findIndex((r) => r.marker);
    start = i === -1 ? 0 : i;
  }
  return runs.slice(start);
}

/** The text of the line as a screen reader should hear it (markers and URLs left out). */
function plainText(block: MarkdownBlock): string {
  return visibleRuns(block)
    .filter((r) => !r.marker)
    .map((r) => r.text)
    .join('');
}

function numberMarker(block: MarkdownBlock): string {
  const first = block.runs.find((r) => r.marker);
  const m = first ? first.text.match(/^\s*(\d+\.)/) : null;
  return m ? m[1] : '';
}

function hasWiki(block: MarkdownBlock): boolean {
  return block.runs.some((r) => r.link?.kind === 'wiki');
}

function runsEqual(a: MarkdownRun[], b: MarkdownRun[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.text !== y.text ||
      !!x.marker !== !!y.marker ||
      !!x.bold !== !!y.bold ||
      !!x.italic !== !!y.italic ||
      !!x.tag !== !!y.tag ||
      !!x.code !== !!y.code ||
      x.link?.kind !== y.link?.kind ||
      x.link?.target !== y.link?.target
    ) {
      return false;
    }
  }
  return true;
}

function sameProps(a: ReadingBlockRowProps, b: ReadingBlockRowProps): boolean {
  const x = a.block;
  const y = b.block;
  return (
    x.kind === y.kind &&
    x.startOffset === y.startOffset &&
    x.endOffset === y.endOffset &&
    x.depth === y.depth &&
    x.checked === y.checked &&
    x.alt === y.alt &&
    x.url === y.url &&
    runsEqual(x.runs, y.runs) &&
    a.rowId === b.rowId &&
    a.onEdit === b.onEdit &&
    a.onToggleCheckbox === b.onToggleCheckbox &&
    a.onOpenWeb === b.onOpenWeb &&
    a.onOpenNote === b.onOpenNote &&
    a.imagesEnabled === b.imagesEnabled &&
    a.linksDisabled === b.linksDisabled &&
    (!hasWiki(x) || a.noteLinkState === b.noteLinkState)
  );
}

function ReadingBlockRowImpl(props: ReadingBlockRowProps) {
  const {
    block,
    rowId,
    onEdit,
    onToggleCheckbox,
    onOpenWeb,
    onOpenNote,
    noteLinkState,
    imagesEnabled,
    linksDisabled,
  } = props;
  const edit = () => onEdit(block.endOffset, rowId);

  const renderRuns = (): ReactNode[] => {
    const out: ReactNode[] = [];
    visibleRuns(block).forEach((run, i) => {
      if (run.marker) {
        // An inline image with empty alt text leaves only its markers; show the fallback label.
        if (run.text.indexOf('![](') !== -1) {
          out.push(
            <Text
              key={i}
              style={readingRunStyle({ text: '', link: { kind: 'image', target: '' } }, ctx())}
            >
              Image
            </Text>,
          );
        }
        return;
      }
      const link = run.link;
      if (link?.kind === 'web') {
        const safe = linksDisabled ? null : safeWebUrl(link.target);
        out.push(
          <Text
            key={i}
            style={readingRunStyle(run, { ...ctx(), webLive: safe !== null })}
            onPress={safe !== null ? () => onOpenWeb(safe) : undefined}
            accessibilityRole={safe !== null ? 'link' : undefined}
          >
            {run.text}
          </Text>,
        );
      } else if (link?.kind === 'wiki') {
        const state = noteLinkState(link.target);
        const live = !linksDisabled && state !== 'invalid';
        out.push(
          <Text
            key={i}
            style={readingRunStyle(run, { ...ctx(), wikiState: state })}
            onPress={live ? () => onOpenNote(link.target) : undefined}
            accessibilityRole={live ? 'link' : undefined}
            accessibilityHint={
              live
                ? state === 'exists'
                  ? 'Opens the note.'
                  : 'Creates a note with this title.'
                : undefined
            }
          >
            {run.text}
          </Text>,
        );
      } else {
        out.push(
          <Text key={i} style={readingRunStyle(run, ctx())}>
            {run.text}
          </Text>,
        );
      }
    });
    return out;
  };

  function ctx() {
    return {
      kind: block.kind,
      checked: block.checked,
      webLive: false,
      linksDisabled,
    };
  }

  const lineText = (style: object, extra: object = {}) => (
    <Text style={[s.text, style]} onPress={edit} accessibilityHint={EDIT_HINT} {...extra}>
      {renderRuns()}
    </Text>
  );

  switch (block.kind) {
    case 'fence':
      return null;
    case 'codeLine':
      return (
        <Text style={s.codeLine} onPress={edit} accessibilityHint={EDIT_HINT}>
          {block.runs.map((r) => r.text).join('')}
        </Text>
      );
    case 'heading1':
    case 'heading2':
    case 'heading3':
      return lineText(headingStyle(block.kind), { accessibilityRole: 'header' });
    case 'bullet':
      return (
        <View style={[s.listRow, { paddingLeft: block.depth * INDENT_PER_DEPTH }]}>
          <Text style={s.glyph} accessible={false}>
            {block.depth === 0 ? '•' : '◦'}
          </Text>
          {lineText(s.listText)}
        </View>
      );
    case 'numbered':
      return (
        <View style={[s.listRow, { paddingLeft: block.depth * INDENT_PER_DEPTH }]}>
          <Text style={s.numberGlyph} accessible={false}>
            {numberMarker(block)}
          </Text>
          {lineText(s.listText)}
        </View>
      );
    case 'checkbox': {
      const checked = block.checked === true;
      return (
        <View style={[s.listRow, { paddingLeft: block.depth * INDENT_PER_DEPTH }]}>
          <Pressable
            onPress={() => onToggleCheckbox(block.startOffset)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={plainText(block)}
            style={s.checkboxHit}
          >
            <View style={[s.checkboxBox, checked && s.checkboxBoxChecked]}>
              {checked ? <Text style={s.checkMark}>✓</Text> : null}
            </View>
          </Pressable>
          <Text style={[s.text, s.checkboxLabel]} onPress={edit} accessibilityHint={EDIT_HINT}>
            {renderRuns()}
          </Text>
        </View>
      );
    }
    case 'quote':
      return (
        <View style={s.quoteRow}>
          <View style={s.quoteBar} accessible={false} />
          {lineText(s.listText)}
        </View>
      );
    case 'rule':
      return <View style={s.rule} accessible={false} />;
    case 'blank':
      return <Pressable testID="reading-blank" style={s.blank} onPress={edit} accessible={false} />;
    case 'image':
      return (
        <ReadingImage
          alt={block.alt ?? ''}
          url={block.url ?? ''}
          imagesEnabled={imagesEnabled}
          linksDisabled={linksDisabled}
          onEdit={edit}
        />
      );
    default:
      return lineText({});
  }
}

export const ReadingBlockRow = memo(ReadingBlockRowImpl, sameProps);
