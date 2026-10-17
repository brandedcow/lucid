import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { EntryToolbar } from '../components/EntryToolbar';
import { TagSuggestionBar } from '../components/TagSuggestionBar';
import { PanelRecording, RecordingPanel } from '../components/RecordingPanel';
import { VoiceNoteCarousel } from '../components/VoiceNoteCarousel';
import { VoiceNoteSheet } from '../components/VoiceNoteSheet';
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
import { appendTranscript } from '../utils/transcriptAppend';
import { suggestTags } from '../utils/tagSuggestions';
import { BUILT_IN_JOURNALS, Journal, journalCopy } from '../utils/journals';
import { UNSUPPORTED_TRANSCRIPTION } from '../services/transcription';
import { AutoTranscribeSource, useAutoTranscribe } from '../hooks/useAutoTranscribe';
import { AddEntryScreen, AddEntryScreenProps } from './AddEntryScreen';

/**
 * Prop contract (everything else is AddEntryScreen's):
 * - recordings: the entry's recordings from the session, in order (closed ones are not shown). One
 *   VoiceAttachmentCard per visible recording, in a horizontal VoiceNoteCarousel (next card peeking,
 *   page dots; one note is full width) above the date in the page flow (no cap; it scrolls with the
 *   title and body), labelled "voice note N of M" when there are several. Cards are not seekable;
 *   tapping one opens the expanded view (VoiceNoteSheet, a full-screen overlay of this page, not a
 *   route; opening it pauses the card's player). The view is a pager over ALL visible notes, opened
 *   on the tapped one; the note it is on is tracked by id (`focusedNote`) and the cards scroll to
 *   it, also after the view closes. Its trash is the active card's undoable close, then it closes;
 *   it also closes if the active note disappears, e.g. by undo. Only one card plays at a time
 *   (useRecordingPlayback); starting the mic stops playback.
 * - entryCreatedAt: ISO date of the stored entry, shown as the recorded time of a STORED note in the
 *   expanded view (a new note uses the time its recording stopped). Optional; without it a stored
 *   note's subtitle has no time.
 * - onRecorded: a recording stopped; the parent appends it to the recordings (no cap; the mic stays
 *   available).
 * - onRemoveRecording: a card's close button (by recording id), for a new recording and a stored
 *   one alike. It only marks the recording as removed in the session; nothing is deleted until the
 *   user saves.
 * - onRecordingChange: true while the recording panel is open (idle, starting or recording), false
 *   otherwise. Fired synchronously (the parent keeps it in a ref for Android back).
 * - leaveRef: set to the panel's back handling while it is open: idle it closes the panel with no
 *   confirmation; while recording it shows the "Discard this recording?" confirmation.
 * - onRecordingDiscarded: the user discarded the recording to leave; the parent carries on
 *   leaving (its normal back rules run next).
 *
 * - deleteDisabled: the parent's own reason to block the menu's Delete (a delete is running); it is
 *   also off while saving and while the recording panel is open.
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
 * The mic opens the recording panel IDLE (nothing is recorded and no microphone permission is asked
 * until its red button is tapped). While the panel is open it takes the bottom dock and the toolbar
 * and suggestion bar are hidden (the keyboard is dismissed when the mic is tapped); they return when
 * it closes or a recording is stopped.
 *
 * - transcription: the recognizer behind the expanded view's transcript area (default: cannot
 *   transcribe, so Transcribe is hidden). The hook that implements it lives above this page (App),
 *   writes results through the session (`setRecordingTranscript`), and is passed down untouched.
 *   The view reads each note's text from the session recording's `voiceTranscript`. "Add transcript
 *   to entry" appends it to the body as ONE undo step (typing flushed first, cursor at the end, the
 *   keyboard stays closed) and closes the view.
 *
 * New recordings are transcribed automatically after the stop, one at a time, on-device only and
 * never with a prompt (useAutoTranscribe); opening the recording panel cancels a run and it resumes
 * after the recording.
 *
 * Toolbar: undo / redo (body text and closing a voice note card, one shared stack, each step naming its
 * recording; not title or
 * journal), mic, # (inserts "#" at the body's cursor, or at the end when none is known; the tag is
 * typed in the text). The check is off while recording
 * (stop first). While the panel is open the toolbar is not shown at all (the panel takes its place
 * in the dock); back closes an idle panel and asks to discard while recording.
 */
export type AddEntryWithVoiceProps = Omit<
  AddEntryScreenProps,
  | 'attachment'
  | 'recordingPanel'
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
  entryCreatedAt?: string;
  transcription?: AutoTranscribeSource;
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
  entryCreatedAt,
  transcription = UNSUPPORTED_TRANSCRIPTION,
  journal = BUILT_IN_JOURNALS[0] as Journal,
  saving = false,
  body,
  onBodyChange,
  deleteDisabled = false,
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

  useAutoTranscribe(recordings, transcription, recording);

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
  const applyBodyEdit = (next: { text: string; cursor: number }, focus: boolean) => {
    history.onBodyBlur();
    history.onBodyChange(next.text);
    history.onBodyBlur();
    const sel = { start: next.cursor, end: next.cursor };
    selectionRef.current = sel;
    setCursor(sel);
    setForcedSelection(sel);
    if (focus) setBodyFocusSignal((n) => n + 1);
  };
  const applyTagEdit = (next: { text: string; cursor: number }) => applyBodyEdit(next, true);

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
  // The mic stays available after a recording; only a save turns it off. (While recording the
  // toolbar is not rendered, so it needs no recording state.)
  const micDisabled = saving;

  // The expanded view: open or not, and the note it is on (by id). `focusedNote` outlives the
  // view: the cards stay on the last note viewed.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusedNote, setFocusedNote] = useState<string | null>(null);
  // When each new recording stopped (by its cache uri).
  const stoppedAt = useRef(new Map<string, Date>());
  // The recorded time each note shows, fixed when the view opens.
  const [recordedAts, setRecordedAts] = useState<Record<string, Date | null>>({});
  const recordedAtOf = (r: SessionRecording): Date | null =>
    r.persisted
      ? entryCreatedAt
        ? new Date(entryCreatedAt)
        : null
      : (stoppedAt.current.get(r.uri) ?? new Date());
  const openIndex = sheetOpen && focusedNote ? shown.findIndex((r) => r.id === focusedNote) : -1;
  // The active note is gone (undo hid it, or it was removed): close the view.
  if (sheetOpen && openIndex < 0) setSheetOpen(false);
  const openNote = (id: string) => {
    if (!shown.some((r) => r.id === id)) return;
    // The card's player pauses; the view plays from its own.
    stopAllPlayback();
    // A focused body would keep the keyboard over the view; blurring it also ends the typing step
    // and hides the suggestion bar. Closing the view does not bring the keyboard back.
    Keyboard.dismiss();
    setRecordedAts(Object.fromEntries(shown.map((r) => [r.id, recordedAtOf(r)])));
    setFocusedNote(id);
    setSheetOpen(true);
  };
  const sheetNotes = sheetOpen
    ? shown.map((r) => ({ ...r, recordedAt: recordedAts[r.id] ?? null }))
    : [];

  // The transcript goes to the end of the body as its own undo step; the body is not focused, so the
  // keyboard stays closed. The view closes after (it shows the result and a second tap cannot add
  // the text twice).
  const addTranscript = (_id: string, text: string) => {
    const next = appendTranscript(body, text);
    if (next !== body) applyBodyEdit({ text: next, cursor: next.length }, false);
    setSheetOpen(false);
  };

  const attachment =
    shown.length > 0 ? (
      <VoiceNoteCarousel
        notes={shown}
        playDisabled={recording}
        onRemove={!saving ? (id) => history.onRemoveRecording(id) : undefined}
        onOpen={openNote}
        focusId={focusedNote}
      />
    ) : undefined;

  const recordingPanel = recording ? (
    <RecordingPanel
      microphoneMessage={journalCopy(journal).microphoneMessage}
      leaveRef={leaveRef}
      onRecorded={(rec) => {
        setRecording(false);
        // A new note is not undoable; typing ends as a step first.
        history.onRecordingAttached();
        stoppedAt.current.set(rec.uri, new Date());
        onRecorded(rec);
      }}
      onClosed={() => setRecording(false)}
      onDiscarded={() => {
        setRecording(false);
        onRecordingDiscarded?.();
      }}
    />
  ) : undefined;

  const toolbar = (
    <EntryToolbar
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      onUndo={history.undo}
      onRedo={history.redo}
      micDisabled={micDisabled}
      onMic={() => {
        // Recording must not overlap playback.
        stopAllPlayback();
        Keyboard.dismiss();
        setRecording(true);
      }}
      disabled={saving}
      onTags={insertTagStart}
    />
  );

  const screen = (
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
      deleteDisabled={deleteDisabled || saving || recording}
      attachment={attachment}
      recordingPanel={recordingPanel}
      suggestions={suggestions}
      toolbar={toolbar}
    />
  );

  // One stable tree, so opening the view never remounts the page.
  return (
    <View style={styles.root}>
      {/* The page stays mounted but is out of reach for screen readers while the view is open. */}
      <View
        style={styles.root}
        accessibilityElementsHidden={sheetOpen}
        importantForAccessibility={sheetOpen ? 'no-hide-descendants' : 'auto'}
      >
        {screen}
      </View>
      {sheetOpen && openIndex >= 0 && (
        <VoiceNoteSheet
          notes={sheetNotes}
          initialIndex={openIndex}
          onIndexChange={(_index, id) => setFocusedNote(id)}
          busy={saving || recording}
          transcription={transcription}
          onAddTranscript={addTranscript}
          playDisabled={recording}
          onClose={() => setSheetOpen(false)}
          onRemove={(id) => {
            history.onRemoveRecording(id);
            setSheetOpen(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
