import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDreamPlayback } from '../hooks/useDreamPlayback';
import { listDreams } from '../services/dreamStorage';
import { colors, fonts, spacing } from '../theme';
import { Dream } from '../types/dream';
import { formatDuration } from '../utils/format';

type Props = { onRecord: () => void };

export function DreamListScreen({ onRecord }: Props) {
  const [dreams, setDreams] = useState<Dream[] | null>(null);
  const playback = useDreamPlayback();

  useEffect(() => {
    listDreams().then(setDreams);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Dreams</Text>

      <FlatList
        data={dreams ?? []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={dreams ? <Text style={styles.empty}>No dreams saved yet.</Text> : null}
        extraData={playback.playingId}
        renderItem={({ item }) => {
          const playing = playback.playingId === item.id;
          return (
            <View style={styles.row}>
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
              <View style={styles.info}>
                <Text style={styles.date} numberOfLines={1}>
                  {item.title || formatEntryDate(item.createdAt)}
                </Text>
                {(item.title || item.emotion || item.tags.length > 0) && (
                  <Text style={styles.meta} numberOfLines={1}>
                    {[
                      item.title ? formatEntryDate(item.createdAt) : null,
                      item.emotion,
                      ...item.tags,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                )}
              </View>
              <Text style={styles.duration}>
                {formatDuration(Math.round(item.durationMs / 1000))}
              </Text>
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
