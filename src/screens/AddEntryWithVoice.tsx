import { MutableRefObject, useEffect, useRef, useState } from 'react';
import { EntryToolbar } from '../components/EntryToolbar';
import { PanelRecording, RecordingPanel } from '../components/RecordingPanel';
import { VoiceAttachmentCard } from '../components/VoiceAttachmentCard';
import { EntryAudio } from '../hooks/useEntrySession';
import { useEntryHistory } from '../hooks/useEntryHistory';
import { insertHash } from '../utils/inlineTags';
import { BUILT_IN_JOURNALS, Journal, journalCopy } from '../utils/journals';
import { AddEntryScreen, AddEntryScreenProps } from './AddEntryScreen';

/**
 * Prop contract (everything else is AddEntryScreen's):
 * - audio: the entry's attachment from the session (a closed one is not shown).
 * - onRecorded: a recording stopped; the parent stores it as the attachment.
 * - onRemoveAudio: the card's close button, for a new recording and a stored one alike. It only
 *   marks the recording as removed in the session; nothing is deleted until the user saves.
 * - onRecordingChange: true while the recorder is starting or running, false otherwise. Fired
 *   synchronously (the parent keeps it in a ref for Android back).
 * - leaveRef: set to the "Discard this recording?" confirmation while recording.
 * - onRecordingDiscarded: the user discarded the recording to leave; the parent carries on
 *   leaving (its normal back rules run next).
 *
 * - onRestoreAudio: undo of the card's close: brings the recording back (reversible mark only).
 * - onBodyChange here is the session setter; the page wraps it for the undo history.
 *
 * - bodyBaseFrom: set when opening added the entry's tags to the body as `#tag`s; the body as it
 *   was stored. Seeds that addition as one undo step.
 *
 * Toolbar: undo / redo (body text and closing the voice note card, one shared stack; not title or
 * journal), mic, # (inserts "#" at the body's cursor, or at the end when none is known; the tag is
 * typed in the text). The check is off while recording
 * (stop first); back asks to discard. While recording, the mic, undo and redo are disabled.
 */
export type AddEntryWithVoiceProps = Omit<
  AddEntryScreenProps,
  | 'attachment'
  | 'toolbar'
  | 'saveDisabled'
  | 'onBodyBlur'
  | 'onBodySelectionChange'
  | 'bodySelection'
  | 'bodyFocusSignal'
> & {
  audio?: EntryAudio;
  onRecorded: (recording: PanelRecording) => void;
  onRemoveAudio?: () => void;
  onRestoreAudio?: () => void;
  onRecordingChange?: (recording: boolean) => void;
  leaveRef?: MutableRefObject<(() => void) | null>;
  onRecordingDiscarded?: () => void;
  bodyBaseFrom?: string;
};

export function AddEntryWithVoice({
  audio,
  onRecorded,
  onRemoveAudio,
  onRestoreAudio,
  onRecordingChange,
  leaveRef,
  onRecordingDiscarded,
  bodyBaseFrom,
  journal = BUILT_IN_JOURNALS[0] as Journal,
  saving = false,
  body,
  onBodyChange,
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

  const history = useEntryHistory({
    body,
    setBody: onBodyChange,
    removeAudio: onRemoveAudio,
    restoreAudio: onRestoreAudio,
    seedFrom: bodyBaseFrom,
  });
  // A save ends the history: the removal it commits can no longer be undone.
  const { reset: resetHistory } = history;
  useEffect(() => {
    if (saving) resetHistory();
  }, [saving, resetHistory]);

  // The body's cursor, as last reported; null until the input has reported one. `forcedSelection`
  // moves the cursor after the # button inserts text and is dropped on the next report.
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [bodyFocusSignal, setBodyFocusSignal] = useState(0);

  const insertTagStart = () => {
    const sel = selectionRef.current;
    const cursor = sel ? sel.end : body.length;
    const next = insertHash(body, cursor);
    // Its own undo step, apart from the typing around it.
    history.onBodyBlur();
    history.onBodyChange(next.text);
    history.onBodyBlur();
    selectionRef.current = { start: next.cursor, end: next.cursor };
    setForcedSelection({ start: next.cursor, end: next.cursor });
    setBodyFocusSignal((n) => n + 1);
  };

  const shown = audio && !audio.removed ? audio : undefined;
  const micDisabled = saving || recording || shown !== undefined;

  const attachment = recording ? (
    <RecordingPanel
      microphoneMessage={journalCopy(journal).microphoneMessage}
      leaveRef={leaveRef}
      onRecorded={(rec) => {
        setRecording(false);
        // A new note is not undoable; earlier close steps no longer apply.
        history.onRecordingAttached();
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
      onRemove={!saving ? history.onRemoveAudio : undefined}
    />
  ) : undefined;

  const toolbar = (
    <EntryToolbar
      canUndo={history.canUndo && !recording}
      canRedo={history.canRedo && !recording}
      onUndo={history.undo}
      onRedo={history.redo}
      micDisabled={micDisabled}
      onMic={() => setRecording(true)}
      disabled={saving}
      onTags={insertTagStart}
    />
  );

  return (
    <AddEntryScreen
      {...page}
      body={body}
      onBodyChange={history.onBodyChange}
      onBodyBlur={history.onBodyBlur}
      onBodySelectionChange={(sel) => {
        selectionRef.current = sel;
        setForcedSelection(null);
      }}
      bodySelection={forcedSelection ?? undefined}
      bodyFocusSignal={bodyFocusSignal}
      journal={journal}
      saving={saving}
      saveDisabled={recording}
      attachment={attachment}
      toolbar={toolbar}
    />
  );
}
