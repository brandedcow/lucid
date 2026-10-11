import { Keyboard, Platform } from 'react-native';
import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { EntryToolbar } from '../components/EntryToolbar';
import { TagSuggestionBar } from '../components/TagSuggestionBar';
import { PanelRecording, RecordingPanel } from '../components/RecordingPanel';
import { VoiceAttachmentCard } from '../components/VoiceAttachmentCard';
import { EntryAudio } from '../hooks/useEntrySession';
import { useEntryHistory } from '../hooks/useEntryHistory';
import { activeToken, completeToken, inlineTagFor, insertHash } from '../utils/inlineTags';
import { suggestTags } from '../utils/tagSuggestions';
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
 * - knownTags: every existing tag, most used first (App derives it from the stored entries). Feeds
 *   the suggestion bar.
 *
 * Tag suggestion bar (dock, above the toolbar): shown while the cursor is in a "#word" and there is
 * something to offer: existing tags (prefix matches, then substring, up to 8) and, for a new word,
 * a `Create #word` hint that only puts the bar away (the tag is made by typing it). Tapping a tag
 * completes the word ("#tag " with the cursor after the space) as ONE undo step, like the # button.
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
  | 'suggestions'
  | 'saveDisabled'
  | 'onBodyBlur'
  | 'onBodyFocus'
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
  knownTags?: readonly string[];
};

const NO_TAGS: readonly string[] = [];

export function AddEntryWithVoice({
  audio,
  onRecorded,
  onRemoveAudio,
  onRestoreAudio,
  onRecordingChange,
  leaveRef,
  onRecordingDiscarded,
  bodyBaseFrom,
  knownTags = NO_TAGS,
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

  // The body's cursor, as last reported (null until the input has reported one). `forcedSelection`
  // moves the cursor after the # button or a tag completion changes the text and is dropped on the
  // next report. The state copy drives the suggestion bar; the ref is for handlers.
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const [cursor, setCursor] = useState<{ start: number; end: number } | null>(null);
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [bodyFocusSignal, setBodyFocusSignal] = useState(0);
  // The "#" position whose `Create` hint was tapped; the bar stays away until the cursor leaves it.
  // The body has focus: the bar shows only then (not with the title focused or the keyboard closed).
  // A pill tap does not move focus, so it does not hide the bar mid-tap.
  const [bodyFocused, setBodyFocused] = useState(false);
  useEffect(() => {
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setBodyFocused(false),
    );
    return () => hide.remove();
  }, []);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  /** A tag action: its own undo step, apart from the typing around it; the cursor follows the text. */
  const applyTagEdit = (next: { text: string; cursor: number }) => {
    history.onBodyBlur();
    history.onBodyChange(next.text);
    history.onBodyBlur();
    const sel = { start: next.cursor, end: next.cursor };
    selectionRef.current = sel;
    setCursor(sel);
    setForcedSelection(sel);
    setBodyFocusSignal((n) => n + 1);
  };

  const insertTagStart = () => {
    const sel = selectionRef.current;
    applyTagEdit(insertHash(body, sel ? sel.end : body.length));
  };

  const inlineKnownTags = useMemo(() => {
    const out: string[] = [];
    for (const raw of knownTags) {
      const t = inlineTagFor(raw);
      if (t !== null && !out.includes(t)) out.push(t);
    }
    return out;
  }, [knownTags]);
  const token = cursor && cursor.start === cursor.end ? activeToken(body, cursor.end) : null;
  if (!token && dismissedAt !== null) setDismissedAt(null);
  const offered = token ? suggestTags(inlineKnownTags, token.query) : null;
  const showBar =
    !saving &&
    bodyFocused &&
    token !== null &&
    token.start !== dismissedAt &&
    offered !== null &&
    (offered.matches.length > 0 || offered.create !== null);
  const suggestions =
    showBar && token && offered ? (
      <TagSuggestionBar
        matches={offered.matches}
        create={offered.create}
        onPick={(tag) => applyTagEdit(completeToken(body, token, tag))}
        onDismiss={() => setDismissedAt(token.start)}
      />
    ) : undefined;

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
      onBodyBlur={() => {
        history.onBodyBlur();
        setBodyFocused(false);
      }}
      onBodyFocus={() => setBodyFocused(true)}
      onBodySelectionChange={(sel) => {
        selectionRef.current = sel;
        setCursor(sel);
        setForcedSelection(null);
      }}
      bodySelection={forcedSelection ?? undefined}
      bodyFocusSignal={bodyFocusSignal}
      journal={journal}
      saving={saving}
      saveDisabled={recording}
      attachment={attachment}
      suggestions={suggestions}
      toolbar={toolbar}
    />
  );
}
