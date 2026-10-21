import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { markdownBlocks, type MarkdownBlock } from '../utils/markdownBlocks';
import { ReadingBlockRow } from './ReadingBlockRow';
import { readingStyles as s, type WikiState } from './readingStyles';

export type NoteReadingViewProps = {
  body: string;
  /** Caret goes to the END of the tapped source line; `y` is the tapped row's top in this view. */
  onEdit: (offset: number, y: number) => void;
  /** `offset` is the checkbox block's startOffset. */
  onToggleCheckbox: (offset: number) => void;
  /** Receives a `safeWebUrl` result. */
  onOpenWeb: (url: string) => void;
  /** Receives the trimmed wikilink target. */
  onOpenNote: (target: string) => void;
  noteLinkState: (target: string) => WikiState;
  imagesEnabled: boolean;
  /** Locked or recording: links, wikilinks and tap-to-load render inert. */
  linksDisabled: boolean;
  placeholder: string;
};

type Item =
  | { type: 'block'; key: string; block: MarkdownBlock }
  | { type: 'code'; key: string; blocks: MarkdownBlock[] };

/** Top-level rows: consecutive fence / code lines form one group. Image keys are `url#n`. */
function buildItems(blocks: MarkdownBlock[]): Item[] {
  const items: Item[] = [];
  const seen = new Map<string, number>();
  blocks.forEach((block, i) => {
    if (block.kind === 'fence' || block.kind === 'codeLine') {
      const last = items[items.length - 1];
      if (last && last.type === 'code') last.blocks.push(block);
      else items.push({ type: 'code', key: `code${i}`, blocks: [block] });
      return;
    }
    let key = `l${i}`;
    if (block.kind === 'image') {
      const url = block.url ?? '';
      const n = seen.get(url) ?? 0;
      seen.set(url, n + 1);
      key = `${url}#${n}`;
    }
    items.push({ type: 'block', key, block });
  });
  return items;
}

/** The rendered-markdown view of a Body, shown when the keyboard is hidden. */
export function NoteReadingView(props: NoteReadingViewProps) {
  const { body, noteLinkState, imagesEnabled, linksDisabled, placeholder } = props;
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const ys = useRef(new Map<string, number>());

  const blocks = useMemo(() => markdownBlocks(body), [body]);
  const items = useMemo(() => buildItems(blocks), [blocks]);

  const onEdit = useCallback((offset: number, rowId: string) => {
    latest.current.onEdit(offset, ys.current.get(rowId) ?? 0);
  }, []);
  const onToggleCheckbox = useCallback((o: number) => latest.current.onToggleCheckbox(o), []);
  const onOpenWeb = useCallback((u: string) => latest.current.onOpenWeb(u), []);
  const onOpenNote = useCallback((t: string) => latest.current.onOpenNote(t), []);

  const layout = (key: string) => (e: LayoutChangeEvent) => {
    ys.current.set(key, e.nativeEvent.layout.y);
  };

  if (body.trim() === '') {
    return (
      <View style={s.container}>
        <Pressable onPress={() => props.onEdit(0, 0)} accessibilityHint="Double tap to edit.">
          <Text style={s.placeholder}>{placeholder}</Text>
        </Pressable>
      </View>
    );
  }

  const row = (block: MarkdownBlock, rowId: string): ReactNode => (
    <ReadingBlockRow
      block={block}
      rowId={rowId}
      onEdit={onEdit}
      onToggleCheckbox={onToggleCheckbox}
      onOpenWeb={onOpenWeb}
      onOpenNote={onOpenNote}
      noteLinkState={noteLinkState}
      imagesEnabled={imagesEnabled}
      linksDisabled={linksDisabled}
    />
  );

  return (
    <View style={s.container}>
      {items.map((item) =>
        item.type === 'code' ? (
          <View
            key={item.key}
            onLayout={layout(item.key)}
            style={[
              s.codeSurface,
              item.blocks.every((b) => b.kind === 'fence') && s.codeSurfaceEmpty,
            ]}
          >
            {item.blocks.map((b) => (
              <View key={b.startOffset}>{row(b, item.key)}</View>
            ))}
          </View>
        ) : (
          <View key={item.key} testID="reading-row" onLayout={layout(item.key)}>
            {row(item.block, item.key)}
          </View>
        ),
      )}
    </View>
  );
}
