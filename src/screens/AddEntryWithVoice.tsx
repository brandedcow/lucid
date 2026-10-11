import { Keyboard, Platform, View } from 'react-native';
import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { EntryToolbar } from '../components/EntryToolbar';
import { TagSuggestionBar } from '../components/TagSuggestionBar';
import { PanelRecording, RecordingPanel } from '../components/RecordingPanel';
import { VoiceAttachmentCard } from '../components/VoiceAttachmentCard';
import { SessionRecording } from '../hooks/useEntrySession';
import { stopAllPlayback } from '../hooks/useRecordingPlayback';
import { useEntryHistory } from '../hooks/useEntryHistory';
import {
  activeToken,
  completeToken,
  inlineTagFor,
  inlineTags,
  insertHash,
} from '../utils/inlineTags';
import { spacing } from '../theme';
import { suggestTags } from '../utils/tagSuggestions';
import { BUILT_IN_JOURNALS, Journal, journalCopy } from '../utils/journals';
import { AddEntryScreen, AddEntryScreenProps } from './AddEntryScreen';

/**
 * Prop contract (everything else is AddEntryScreen's):
 * - recordings: the entry's recordings from the session, in order (closed ones are not shown). One
 *   VoiceAttachmentCard per visible recording, stacked above the title inside the page's scroll
 *   view, labelled "voice note N of M" when there are several. Only one card plays at a time
 *   (useRecordingPlayback); starting the mic stops playback.
 * - onRecorded: a recording stopped; the parent appends it to the recordings (no cap; the mic stays
 *   available).
 * - onRemoveRecording: a card's close button (by recording id), for a new recording and a stored
 *   one alike. It only marks the recording as removed in the session; nothing is deleted until the
 *   user saves.
 * - onRecordingChange: true while the recorder is starting or running, false otherwise. Fired
 *   synchronously (the parent keeps it in a ref for Android back).
 * - leaveRef: set to the "Discard this recording?" confirmation while recording.
 * - onRecordingDiscarded: the user discarded the recording to leave; the parent carries on
 *   leaving (its normal back rules run next).
 *
 * - onRestoreRecording: undo of a card's close: brings that recording back (reversible mark only).
 * - onBodyChange here is the session setter; the page wraps it for the undo history.
 *
 * - bodyBaseFrom: set when opening added the entry's tags to the body as `#tag`s; the body as it
 *   was stored. Seeds that addition as one undo step.
 *
 * - knownTags: every existing tag, most used first (App derives it from the stored entries). Feeds
 *   the suggestion bar.
 *
 * Tag suggestion bar (dock, above the toolbar): shown while the cursor is in a "#word" and there is
 * something to offer: stored tags plus the tags already typed elsewhere in this entry (prefix matches,
 * then substring, up to 8; see suggestTags). A word nothing matches shows no bar (a new tag needs no
 * action: it is stored from the text on save). Tapping a tag
 * completes the word ("#tag " with the cursor after the space) as ONE undo step, like the # button.
 *
 * Toolbar: undo / redo (body text and closing a voice note card, one shared stack, each step naming its
 * recording; not title or
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
  recordings?: readonly SessionRecording[];
  onRecorded: (recording: PanelRecording) => void;
  onRemoveRecording?: (id: string) => void;
  onRestoreRecording?: (id: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  leaveRef?: MutableRefObject<(() => void) | null>;
  onRecordingDiscarded?: () => void;
  bodyBaseFrom?: string;
  knownTags?: readonly string[];
};

const NO_TAGS: readonly string[] = [];
const NO_RECORDINGS: readonly SessionRecording[] = [];

export function AddEntryWithVoice({
  recordings = NO_RECORDINGS,
  onRecorded,
  onRemoveRecording,
  onRestoreRecording,
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
    removeRecording: onRemoveRecording,
    restoreRecording: onRestoreRecording,
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
  // Tags elsewhere in this entry (the word under the cursor left out), computed from the body on
  // every render so a tag counts the moment its terminating space is typed.
  const offered = token
    ? suggestTags(
        inlineKnownTags,
        inlineTags(body.slice(0, token.start) + ' ' + body.slice(token.end)),
        token.query,
      )
    : [];
  const showBar = !saving && bodyFocused && token !== null && offered.length > 0;
  const suggestions =
    showBar && token && offered ? (
      <TagSuggestionBar
        matches={offered}
        onPick={(tag) => applyTagEdit(completeToken(body, token, tag))}
      />
    ) : undefined;

  const shown = recordings.filter((r) => !r.removed);
  // The mic stays available after a recording; only a save or a running recording turns it off.
  const micDisabled = saving || recording;

  const attachment =
    shown.length > 0 || recording ? (
      <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
        {shown.map((r, i) => (
          <VoiceAttachmentCard
            key={`${r.id}:${r.uri}`}
            uri={r.uri}
            durationMs={r.durationMs}
            waveform={r.waveform}
            index={i + 1}
            count={shown.length}
            playDisabled={recording}
            onRemove={!saving ? () => history.onRemoveRecording(r.id) : undefined}
          />
        ))}
        {recording && (
          <RecordingPanel
            microphoneMessage={journalCopy(journal).microphoneMessage}
            leaveRef={leaveRef}
            onRecorded={(rec) => {
              setRecording(false);
              // A new note is not undoable; typing ends as a step first.
              history.onRecordingAttached();
              onRecorded(rec);
            }}
            onClosed={() => setRecording(false)}
            onDiscarded={() => {
              setRecording(false);
              onRecordingDiscarded?.();
            }}
          />
        )}
      </View>
    ) : undefined;

  const toolbar = (
    <EntryToolbar
      canUndo={history.canUndo && !recording}
      canRedo={history.canRedo && !recording}
      onUndo={history.undo}
      onRedo={history.redo}
      micDisabled={micDisabled}
      onMic={() => {
        // Recording must not overlap playback.
        stopAllPlayback();
        setRecording(true);
      }}
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
