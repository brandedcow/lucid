import { MutableRefObject, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MicIcon } from '../components/MicIcon';
import { PanelRecording, RecordingPanel } from '../components/RecordingPanel';
import { VoiceAttachmentCard } from '../components/VoiceAttachmentCard';
import { EntryAudio } from '../hooks/useEntrySession';
import { colors, spacing } from '../theme';
import { BUILT_IN_JOURNALS, Journal, journalCopy } from '../utils/journals';
import { AddEntryScreen, AddEntryScreenProps } from './AddEntryScreen';

/**
 * Prop contract (everything else is AddEntryScreen's):
 * - audio: the entry's attachment from the session (a closed one is not shown).
 * - onRecorded: a recording stopped; the parent stores it as the attachment.
 * - onRemoveAudio: the card's close button. Offered only for a new, unsaved recording: a stored
 *   one has no removal path yet, so its card has no close button.
 * - onRecordingChange: true while the recorder is starting or running, false otherwise. Fired
 *   synchronously (the parent keeps it in a ref for Android back).
 * - leaveRef: set to the "Discard this recording?" confirmation while recording.
 * - onRecordingDiscarded: the user discarded the recording to leave; the parent carries on
 *   leaving (its normal back rules run next).
 *
 * The mic is the minimal toolbar for now; the full undo / redo / mic / # toolbar comes later and
 * takes the mic with it. The check is off while recording (stop first); back asks to discard.
 */
export type AddEntryWithVoiceProps = Omit<
  AddEntryScreenProps,
  'attachment' | 'toolbar' | 'saveDisabled'
> & {
  audio?: EntryAudio;
  onRecorded: (recording: PanelRecording) => void;
  onRemoveAudio?: () => void;
  onRecordingChange?: (recording: boolean) => void;
  leaveRef?: MutableRefObject<(() => void) | null>;
  onRecordingDiscarded?: () => void;
};

export function AddEntryWithVoice({
  audio,
  onRecorded,
  onRemoveAudio,
  onRecordingChange,
  leaveRef,
  onRecordingDiscarded,
  journal = BUILT_IN_JOURNALS[0] as Journal,
  saving = false,
  ...page
}: AddEntryWithVoiceProps) {
  const [recording, setRecordingState] = useState(false);
  const notify = useRef(onRecordingChange);
  useEffect(() => {
    notify.current = onRecordingChange;
  });
  // The page going away ends the recording (the panel cleans up the recorder itself).
  useEffect(
    () => () => {
      notify.current?.(false);
    },
    [],
  );
  const setRecording = (value: boolean) => {
    setRecordingState(value);
    notify.current?.(value);
  };

  const shown = audio && !audio.removed ? audio : undefined;
  const micDisabled = saving || recording || shown !== undefined;

  const attachment = recording ? (
    <RecordingPanel
      microphoneMessage={journalCopy(journal).microphoneMessage}
      leaveRef={leaveRef}
      onRecorded={(rec) => {
        setRecording(false);
        onRecorded(rec);
      }}
      onClosed={() => setRecording(false)}
      onDiscarded={() => {
        setRecording(false);
        onRecordingDiscarded?.();
      }}
    />
  ) : shown ? (
    <VoiceAttachmentCard
      key={shown.uri}
      uri={shown.uri}
      durationMs={shown.durationMs}
      waveform={shown.waveform}
      onRemove={!shown.persisted && !saving ? onRemoveAudio : undefined}
    />
  ) : undefined;

  const toolbar = (
    <View style={styles.toolbar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Record voice note"
        accessibilityState={{ disabled: micDisabled }}
        disabled={micDisabled}
        onPress={() => setRecording(true)}
        hitSlop={8}
        style={[styles.mic, micDisabled && styles.micDisabled]}
      >
        <MicIcon color={colors.text} size={22} />
      </Pressable>
    </View>
  );

  return (
    <AddEntryScreen
      {...page}
      journal={journal}
      saving={saving}
      saveDisabled={recording}
      attachment={attachment}
      toolbar={toolbar}
    />
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  mic: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  micDisabled: { opacity: 0.4 },
});
