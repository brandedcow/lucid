import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDreamPlayback } from '../hooks/useDreamPlayback';
import { getIndexStatus, listDreams } from '../services/dreamStorage';
import { colors, fonts, spacing } from '../theme';
import { Dream, hasAudio, isDraft } from '../types/dream';
import { displayEmotions } from '../utils/emotions';
import { countWords, formatDuration } from '../utils/format';

type Props = {
  onRecord: () => void;
  /** Reopen an unfinished dream. */
  onOpenDraft?: (dream: Dream) => void;
};

const UNREADABLE_MESSAGE = 'Your saved dreams could not be read. Your recordings are safe.';
const MAX_TITLE_CHARS = 60;

export function DreamListScreen({ onRecord, onOpenDraft }: Props) {
  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const playback = useDreamPlayback();

  useEffect(() => {
    let active = true;
    Promise.all([listDreams(), getIndexStatus()]).then(([list, status]) => {
      if (!active) return;
      setUnreadable(status === 'unreadable');
      setDreams(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const emptyText = unreadable ? UNREADABLE_MESSAGE : 'No dreams saved yet.';

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Dreams</Text>

      <FlatList
        data={dreams ?? []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={dreams ? <Text style={styles.empty}>{emptyText}</Text> : null}
        extraData={playback.playingId}
        renderItem={({ item }) => {
          const draft = isDraft(item);
          const audio = hasAudio(item);
          const playing = audio && playback.playingId === item.id;
          const date = formatEntryDate(item.createdAt);
          const primary = item.title || (draft && firstTranscriptLine(item.transcript)) || date;
          const metaParts = [
            draft ? 'Not finished' : null,
            primary !== date ? date : null,
            item.emotion ? displayEmotions(item.emotion) : null,
            ...item.tags,
          ].filter(Boolean);
          const words = !audio && item.transcript ? countWords(item.transcript) : 0;

          const playButton = (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause dream' : 'Play dream'}
              onPress={() => playback.toggle(item)}
              style={[styles.play, playing && styles.playActive]}
            >
              <Text style={[styles.playGlyph, playing && styles.playGlyphActive]}>
                {playing ? 'ǁ' : '▶'}
              </Text>
            </Pressable>
          );
          const writtenGlyph = (
            <View style={[styles.play, styles.writtenSlot]} importantForAccessibility="no">
              <Text style={styles.writtenGlyph}>⌨</Text>
            </View>
          );
          const text = (
            <>
              <View style={styles.info}>
                <Text style={styles.date} numberOfLines={1}>
                  {primary}
                </Text>
                {metaParts.length > 0 && (
                  <Text style={styles.meta} numberOfLines={1}>
                    {metaParts.join(' · ')}
                  </Text>
                )}
              </View>
              {audio ? (
                <Text style={styles.duration}>
                  {formatDuration(Math.round(item.durationMs / 1000))}
                </Text>
              ) : words > 0 ? (
                <Text style={styles.duration}>{words === 1 ? '1 word' : `${words} words`}</Text>
              ) : null}
            </>
          );

          if (draft) {
            // The play button is a sibling of the labeled Pressable, never inside it, so screen
            // readers can still reach it. The written-dream glyph is inside, as part of the tap area.
            return (
              <View style={[styles.row, styles.draftRow]}>
                {audio && playButton}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Not finished: ${primary}`}
                  onPress={() => onOpenDraft?.(item)}
                  style={styles.draftOpen}
                >
                  {!audio && writtenGlyph}
                  {text}
                </Pressable>
              </View>
            );
          }
          return (
            <View style={styles.row}>
              {audio ? playButton : writtenGlyph}
              {text}
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={onRecord} style={styles.record}>
          <Text style={styles.recordLabel}>Record a dream</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function firstTranscriptLine(transcript?: string): string {
  const line =
    (transcript ?? '')
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? '';
  // Cut by code point, so an emoji at the boundary is never split into a lone surrogate.
  const chars = Array.from(line);
  return chars.length > MAX_TITLE_CHARS
    ? `${chars.slice(0, MAX_TITLE_CHARS).join('').trimEnd()}…`
    : line;
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 36,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  list: { paddingHorizontal: spacing.lg, flexGrow: 1 },
  empty: { color: colors.muted, fontSize: 16, paddingTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  draftRow: { paddingVertical: 0 },
  draftOpen: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  playGlyph: { color: colors.text, fontSize: 14, fontWeight: '700' },
  playGlyphActive: { color: colors.accentDark },
  writtenSlot: { opacity: 0.5 },
  writtenGlyph: { color: colors.muted, fontSize: 16 },
  info: { flex: 1, gap: 2 },
  date: { color: colors.text, fontSize: 16 },
  meta: { color: colors.muted, fontSize: 13 },
  duration: { color: colors.muted, fontSize: 14, fontVariant: ['tabular-nums'] },
  footer: { padding: spacing.lg },
  record: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordLabel: { color: colors.accentDark, fontSize: 17, fontWeight: '700' },
});
