import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DreamChips } from '../components/DreamChips';
import { RecordingPlayer } from '../components/RecordingPlayer';
import { dreamAudioUri } from '../services/dreamStorage';
import { colors, fonts, spacing } from '../theme';
import { Dream, hasAudio } from '../types/dream';
import { dreamRow, limitChips } from '../utils/dreamLog';
import { formatEntryDateTime } from '../utils/format';
import { splitParagraphs } from '../utils/paragraphs';

/**
 * Prop contract (stable):
 * - dream: the stored dream to show (finished dreams; a draft renders too but the app never sends one).
 * - onBack: the back arrow; the parent decides where it goes.
 * - onEdit: the "Edit" button; the parent opens the dream for editing.
 */
export type DreamDetailScreenProps = {
  dream: Dream;
  onBack: () => void;
  onEdit: () => void;
};

export function DreamDetailScreen({ dream, onBack, onEdit }: DreamDetailScreenProps) {
  const row = dreamRow(dream);
  const date = formatEntryDateTime(new Date(dream.createdAt));
  // Show every chip: no limit on the count and no "+N".
  const { visible } = limitChips(row.chips, Infinity, Infinity);
  const audioUri = hasAudio(dream) ? dreamAudioUri(dream) : null;
  const paragraphs = typeof dream.transcript === 'string' ? splitParagraphs(dream.transcript) : [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit dream"
          onPress={onEdit}
          hitSlop={12}
          style={styles.editButton}
        >
          <Text style={styles.edit}>Edit</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {date !== '' && <Text style={styles.date}>{date}</Text>}
        <Text accessibilityRole="header" style={styles.title}>
          {row.title}
        </Text>
        {visible.length > 0 && (
          <View style={styles.section}>
            <DreamChips chips={visible} />
          </View>
        )}
        {audioUri !== null && (
          <View style={styles.player}>
            <RecordingPlayer
              key={dream.id}
              compact
              uri={audioUri}
              durationMs={Number.isFinite(dream.durationMs) ? dream.durationMs : 0}
            />
          </View>
        )}
        <View style={styles.transcript}>
          {paragraphs.length > 0 ? (
            paragraphs.map((paragraph, i) => (
              <Text key={i} selectable style={styles.paragraph}>
                {paragraph}
              </Text>
            ))
          ) : (
            <Text style={styles.empty}>No text yet</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  back: { color: colors.text, fontSize: 24 },
  editButton: { minWidth: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' },
  edit: { color: colors.accent, fontSize: 15 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  date: { color: colors.muted, fontSize: 13 },
  title: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 40,
    paddingTop: spacing.sm,
  },
  section: { paddingTop: spacing.md },
  player: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  transcript: { paddingTop: spacing.lg, gap: spacing.md },
  paragraph: { color: colors.text, fontFamily: fonts.serif, fontSize: 18, lineHeight: 28 },
  empty: { color: colors.muted, fontSize: 15 },
});
