import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DreamChips } from '../components/DreamChips';
import { OverflowMenu } from '../components/OverflowMenu';
import { RecordingPlayer } from '../components/RecordingPlayer';
import { TaggedText } from '../components/TaggedText';
import { recordingUri } from '../services/dreamStorage';
import { colors, fonts, spacing } from '../theme';
import { Dream, hasAudio, recordingsOf } from '../types/dream';
import { confirmDeleteDream } from '../utils/confirmDelete';
import { dreamRow, limitChips } from '../utils/dreamLog';
import { BUILT_IN_JOURNALS, Journal, journalCopy } from '../utils/journals';
import { formatToday } from '../utils/format';
import { missingInlineTags } from '../utils/inlineTags';
import { splitParagraphs } from '../utils/paragraphs';

/**
 * Prop contract (stable):
 * - dream: the stored dream to show (finished dreams; a draft renders too but the app never sends one).
 * - onBack: the back arrow; the parent decides where it goes.
 * - onEdit: "Edit" in the top-right "..." menu; the parent opens the dream for editing.
 * - onDelete: optional. Called once after the user picks "Delete" in the menu and confirms; the
 *   parent does the deleting (this screen never touches storage). Without it, the menu has no
 *   Delete. If it rejects, the screen resets and the parent shows the error.
 * - deleting: the parent is deleting; the menu is disabled and the player is released.
 * - journal: optional, defaults to Dreams. Sets the wording (menu labels, delete confirmation, untitled).
 * - deleteBlocked: optional (default false). Another delete is in flight; Delete is disabled and
 *   cannot be confirmed (Edit and the player are unaffected).
 */
export type DreamDetailScreenProps = {
  dream: Dream;
  onBack: () => void;
  onEdit: () => void;
  onDelete?: () => Promise<void>;
  deleting?: boolean;
  deleteBlocked?: boolean;
  journal?: Journal;
};

export function DreamDetailScreen({
  dream,
  onBack,
  onEdit,
  onDelete,
  deleting = false,
  deleteBlocked = false,
  journal = BUILT_IN_JOURNALS[0],
}: DreamDetailScreenProps) {
  const copy = journalCopy(journal);
  // `confirmed` unmounts the player first; onDelete then runs from an effect after that commit.
  const [confirmed, setConfirmed] = useState(false);
  const alertOpen = useRef(false);
  const called = useRef(false);
  const wasDeleting = useRef(false);
  const busy = confirmed || deleting;
  // Read by the open Alert's callbacks, which outlive the render that created them.
  const blockedRef = useRef(false);
  useEffect(() => {
    blockedRef.current = deleteBlocked;
  }, [deleteBlocked]);

  useEffect(() => {
    if (!confirmed || called.current || !onDelete) return;
    called.current = true;
    onDelete().catch(() => {
      called.current = false;
      setConfirmed(false);
    });
  }, [confirmed, onDelete]);

  // The parent finished (or gave up on) deleting and is still showing this dream: start over.
  useEffect(() => {
    if (wasDeleting.current && !deleting) {
      called.current = false;
      setConfirmed(false);
    }
    wasDeleting.current = deleting;
  }, [deleting]);

  const row = dreamRow(dream, new Date(), copy.untitled);
  // An untitled Life entry has no heading: the header carries its date, and the body leads.
  const untitledLife = journal.kind === 'journal' && row.ownTitle === '';
  const created = new Date(dream.createdAt);
  // Same date format as the add-entry page's header.
  const headerDate = Number.isNaN(created.getTime())
    ? copy.dateFallback
    : `${copy.datePrefix}${formatToday(created)}`;
  // Feelings only: tags are shown inline in the text (below), never as chips. Every feeling is
  // shown: no limit on the count and no "+N".
  const { visible } = limitChips({ emotions: row.chips.emotions, tags: [] }, Infinity, Infinity);
  const stored = recordingsOf(dream);
  const confirmDelete = () => {
    if (busy || alertOpen.current || blockedRef.current) return;
    alertOpen.current = true;
    confirmDeleteDream({
      hasAudio: hasAudio(dream),
      kind: journal.kind,
      onClose: () => {
        alertOpen.current = false;
      },
      onConfirm: () => {
        if (!blockedRef.current) setConfirmed(true);
      },
    });
  };
  const paragraphs = typeof dream.transcript === 'string' ? splitParagraphs(dream.transcript) : [];
  // Entries from before inline tags keep tags that are not in the text: show them after it.
  const legacyTags = missingInlineTags(
    typeof dream.transcript === 'string' ? dream.transcript : '',
    row.chips.tags,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.root}>
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
          <Text style={styles.headerDate}>{headerDate}</Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {!untitledLife && (
            <Text accessibilityRole="header" style={styles.title}>
              {row.title}
            </Text>
          )}
          {visible.length > 0 && (
            <View style={styles.section}>
              <DreamChips chips={visible} />
            </View>
          )}
          {stored.length > 0 && !busy && (
            <View style={styles.players}>
              {stored.map((recording, i) => (
                <View key={`${dream.id}:${recording.fileName}`} style={styles.player}>
                  <RecordingPlayer
                    compact
                    uri={recordingUri(recording)}
                    durationMs={recording.durationMs}
                    index={i + 1}
                    count={stored.length}
                  />
                </View>
              ))}
            </View>
          )}
          <View style={styles.transcript}>
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph, i) => (
                <TaggedText key={i} selectable style={styles.paragraph} text={paragraph} />
              ))
            ) : legacyTags.length === 0 ? (
              <Text style={styles.empty}>No text yet</Text>
            ) : null}
            {legacyTags.length > 0 && (
              <TaggedText
                testID="legacy-tags"
                selectable
                style={styles.paragraph}
                text={legacyTags.map((t) => '#' + t).join(' ')}
              />
            )}
          </View>
        </ScrollView>
        <OverflowMenu
          onEdit={onEdit}
          onDelete={onDelete ? confirmDelete : undefined}
          disabled={busy}
          deleteDisabled={deleteBlocked}
          editLabel={copy.editLabel}
          deleteLabel={copy.deleteLabel}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  backButton: { width: 44, height: 44, justifyContent: 'center' },
  headerSide: { width: 44 },
  back: { color: colors.text, fontSize: 24 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  headerDate: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 13 },
  title: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 40,
    paddingTop: spacing.sm,
  },
  section: { paddingTop: spacing.md },
  players: { marginTop: spacing.md, gap: spacing.sm },
  player: {
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
