import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NoteBodyInput } from '../components/NoteBodyInput';
import {
  EDIT_MODE,
  LIST_CONTINUE,
  STYLE_LEVEL,
  type StyleLevel,
} from '../components/noteRunStyles';
import { useCaretFollow } from '../hooks/useCaretFollow';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useNoteEditor } from '../hooks/useNoteEditor';
import { colors, spacing } from '../theme';

/**
 * Developer harness for the editor device spike (chunk 6c). Not a product screen and not a route:
 * App.tsx renders it instead of the app when EXPO_PUBLIC_EDITOR_SPIKE=1 in a dev build.
 */

export const SPIKE_SEED = [
  '# Heading one',
  '## Heading two',
  '### Heading three',
  '---',
  'Plain line with **bold**, *italic* and a #tag in the middle.',
  '- bullet one',
  '* star bullet',
  '  - indented bullet',
  '1. numbered one',
  '2. numbered two',
  '- [ ] open task',
  '- [x] done task',
  '> a quote line',
  'Inline `code` span',
  '```',
  'fenced code line',
  '```',
  'A [web link](https://example.com) here',
  '![image alt](https://example.com/a.png)',
  'A [[wikilink]] here',
  '日本語の行と한국어 줄',
  'Emoji line 😀 with 🌙 moons',
  '',
].join('\n');

const LEVELS: StyleLevel[] = ['full', 'basic', 'tagsOnly', 'none'];
const SIZES = ['short', '2k', '5k', '20k', '300 lines'] as const;
type Size = (typeof SIZES)[number];

/** A body of roughly the requested size that uses every syntax. */
export function sizedBody(size: Size): string {
  if (size === 'short') return SPIKE_SEED;
  const lines = [
    '# Section heading',
    'Plain text with **bold**, *italic* and #tag words for the tokenizer to chew on.',
    '- [ ] open task item',
    '- [x] done task item',
    '1. numbered item',
    '- bullet item',
  ];
  const target = size === '2k' ? 2000 : size === '5k' ? 5000 : size === '20k' ? 20000 : 0;
  const out: string[] = [];
  let len = 0;
  for (let i = 0; size === '300 lines' ? i < 300 : len < target; i += 1) {
    const line = lines[i % lines.length];
    out.push(line);
    len += line.length + 1;
  }
  return out.join('\n');
}

type Selection = { start: number; end: number };

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function SpikeBody() {
  const [body, setBody] = useState(SPIKE_SEED);
  const [styleLevel, setStyleLevel] = useState<StyleLevel>(STYLE_LEVEL);
  const [editMode, setEditMode] = useState<'remount' | 'inPlace'>(EDIT_MODE);
  const [listContinue, setListContinue] = useState(LIST_CONTINUE);
  const [log, setLog] = useState<string[]>([]);
  const keyboard = useKeyboardInset();
  const scrollRef = useRef<ScrollView>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [bodyLayout, setBodyLayout] = useState<{ y: number; height: number } | null>(null);

  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 20));
  const editor = useNoteEditor({ body, setBody });
  const { onScroll } = useCaretFollow({
    scrollRef,
    bodyLayout,
    text: body,
    selection: editor.selection,
    focused: editor.focused,
    keyboardHeight: keyboard.height,
    viewportHeight,
  });

  const actionLabel = editor.listActions.kind === 'checkbox' ? 'Remove checkbox' : 'Add checkbox';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.switches}>
          <View style={styles.row}>
            {LEVELS.map((l) => (
              <Chip key={l} label={l} on={styleLevel === l} onPress={() => setStyleLevel(l)} />
            ))}
          </View>
          <View style={styles.row}>
            <Chip
              label="remount"
              on={editMode === 'remount'}
              onPress={() => setEditMode('remount')}
            />
            <Chip
              label="inPlace"
              on={editMode === 'inPlace'}
              onPress={() => setEditMode('inPlace')}
            />
            <Chip
              label={listContinue ? 'continue on' : 'continue off'}
              on={listContinue}
              onPress={() => setListContinue((v) => !v)}
            />
          </View>
          <View style={styles.row}>
            {SIZES.map((s) => (
              <Chip key={s} label={s} on={false} onPress={() => setBody(sizedBody(s))} />
            ))}
          </View>
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <View
            onLayout={(e) =>
              setBodyLayout({ y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })
            }
          >
            <NoteBodyInput
              {...editor.inputProps}
              onChangeText={(t, source) => {
                const t0 = Date.now();
                editor.inputProps.onChangeText(t, source);
                note(`change ${source} len=${t.length} js=${Date.now() - t0}ms`);
              }}
              onSelectionChange={(sel: Selection) => {
                editor.inputProps.onSelectionChange?.(sel);
                note(`selection ${sel.start}-${sel.end}`);
              }}
              placeholder="Start writing..."
              placeholderTextColor={colors.faint}
              testID="spike-body"
              style={styles.body}
              styleLevel={styleLevel}
              editMode={editMode}
              listContinue={listContinue}
            />
          </View>
          <View testID="spike-log" style={styles.log}>
            {log.map((l, i) => (
              <Text key={i} style={styles.logLine}>
                {l}
              </Text>
            ))}
          </View>
        </ScrollView>
        <View
          style={[
            styles.toolbar,
            Platform.OS === 'android' && keyboard.visible && { paddingBottom: keyboard.height },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={() => editor.setListType('checkbox')}
            style={styles.tool}
          >
            <Text style={styles.chipText}>{actionLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Indent"
            onPress={editor.indentItem}
            style={styles.tool}
          >
            <Text style={styles.chipText}>Indent</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Outdent"
            onPress={editor.outdentItem}
            style={styles.tool}
          >
            <Text style={styles.chipText}>Outdent</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  switches: { padding: spacing.sm, gap: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.tagChipBg },
  chipText: { color: colors.text, fontSize: 13 },
  content: { padding: spacing.md },
  body: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 26,
    minHeight: 200,
    textAlignVertical: 'top',
    paddingVertical: spacing.sm,
  },
  log: { marginTop: spacing.md },
  logLine: { color: colors.muted, fontSize: 11 },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tool: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
});

// App.tsx renders this instead of the app, so it brings its own safe-area provider.
export function EditorSpikeScreen() {
  return (
    <SafeAreaProvider>
      <SpikeBody />
    </SafeAreaProvider>
  );
}
