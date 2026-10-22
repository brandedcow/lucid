import { Alert, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { NoteReadingView } from '../components/NoteReadingView';
import { NoteToolbar } from '../components/NoteToolbar';
import { PanelRecording, RecordingPanel } from '../components/RecordingPanel';
import { WikiLinkSuggestionBar } from '../components/WikiLinkSuggestionBar';
import { TagSuggestionBar } from '../components/TagSuggestionBar';
import { VoiceNoteCarousel } from '../components/VoiceNoteCarousel';
import { VoiceNoteSheet } from '../components/VoiceNoteSheet';
import { useAutoTranscribe, type AutoTranscribeSource } from '../hooks/useAutoTranscribe';
import { useEntryHistory } from '../hooks/useEntryHistory';
import type { NoteSession } from '../hooks/noteSessionState';
import { useNoteEditor } from '../hooks/useNoteEditor';
import { useNoteMode } from '../hooks/useNoteMode';
import type { useNoteSession } from '../hooks/useNoteSession';
import { stopAllPlayback } from '../hooks/useRecordingPlayback';
import { noteLinkState, useTitleIndex } from '../hooks/useTitleIndex';
import type { Note } from '../services/notesStorage';
import { openWebLink } from '../services/openLink';
import { UNSUPPORTED_TRANSCRIPTION } from '../services/transcription';
import type { SessionRecording } from '../types/recording';
import {
  activeToken,
  completeToken,
  inlineTagFor,
  inlineTags,
  insertHash,
} from '../utils/inlineTags';
import { activeWikiToken, completeWikiToken, matchTitles } from '../utils/noteLinks';
import { suggestTags } from '../utils/tagSuggestions';
import { appendTranscript } from '../utils/transcriptAppend';
import { BODY_PLACEHOLDER, NoteEditorScreen, type NoteEditorScreenProps } from './NoteEditorScreen';

const MICROPHONE_MESSAGE =
  'Lucid needs the microphone to record a voice note. You can allow it in Settings.';

export const LINK_COPY = { openFailedTitle: "Couldn't open this link" };

type SessionActions = Pick<
  ReturnType<typeof useNoteSession>,
  'setBody' | 'attachRecording' | 'closeRecording' | 'restoreRecording'
>;

/**
 * Prop contract (everything else is NoteEditorScreen's layout props):
 * - session / actions: the open note and the `useNoteSession` actions this page calls. Mount one
 *   instance per open note (`key={session.id}`): the undo history lives as long as the page.
 *   `stored` and `pinned` come from the session.
 * - knownTags: every existing tag, most used first (`tagsByUse`). Feeds the suggestion bar.
 * - transcription: the recognizer behind the expanded view (default: cannot transcribe). The hook
 *   that implements it lives above this page and writes results through the session.
 * - onRecordingChange: true while the recording panel is open. Fired synchronously.
 * - leaveRef: set to the panel's back handling while it is open (idle: closes with no prompt;
 *   recording: "Discard this recording?"). onRecordingDiscarded: the user discarded to leave.
 * - locked (NoteEditorScreen's): the parent releases it after a failed leave or delete.
 *
 * Modes: a stored note opens in the reading view (rendered markdown, no input), a new note in
 * editing. A tap in the reading view, or the Edit button, enters editing with the caret placed; Done
 * or the keyboard hiding returns to reading (`useNoteMode`). notes / imagesEnabled / onFollowNoteLink
 * feed the reading view: wiki link state, the load-images setting, and following a `[[note]]` link.
 *
 * Undo / redo (one stack: body text and closing a voice note card): typing is grouped, a checkbox
 * toggle, a tag completion, the # button and "Add transcript" are each their own step. Off while
 * the recording panel is open. Tag bar: shown while the body has focus and the keyboard is up, the
 * caret is collapsed in a "#word" and something matches. After an undo or a redo the caret is where
 * NoteBodyInput puts it (end of the changed region); a tag edit sets it through `editor.select`.
 */
export type NoteEditorWithVoiceProps = Omit<
  NoteEditorScreenProps,
  | 'editor'
  | 'attachment'
  | 'recordingPanel'
  | 'suggestions'
  | 'toolbar'
  | 'stored'
  | 'pinned'
  | 'mode'
  | 'readingView'
  | 'onToggleMode'
  | 'modeToggleDisabled'
  | 'revealRequest'
> & {
  session: NoteSession;
  actions: SessionActions;
  knownTags?: readonly string[];
  transcription?: AutoTranscribeSource;
  onRecordingChange?: (recording: boolean) => void;
  leaveRef?: MutableRefObject<(() => void) | null>;
  onRecordingDiscarded?: () => void;
  notes?: readonly Note[];
  imagesEnabled?: boolean;
  onFollowNoteLink?: (target: string) => void;
};

const NO_TAGS: readonly string[] = [];
const NO_NOTES: readonly Note[] = [];

export function NoteEditorWithVoice({
  session,
  actions,
  knownTags = NO_TAGS,
  transcription = UNSUPPORTED_TRANSCRIPTION,
  onRecordingChange,
  leaveRef,
  onRecordingDiscarded,
  notes = NO_NOTES,
  imagesEnabled = false,
  onFollowNoteLink,
  locked,
  autoFocus,
  ...page
}: NoteEditorWithVoiceProps) {
  const body = session.body;
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

  useAutoTranscribe(session.recordings, transcription, recording);

  const history = useEntryHistory({
    body,
    setBody: actions.setBody,
    removeRecording: actions.closeRecording,
    restoreRecording: actions.restoreRecording,
  });

  const editor = useNoteEditor({ body, setBody: history.onBodyChange });

  const noteMode = useNoteMode({
    initial: autoFocus || !session.stored ? 'editing' : 'reading',
    locked,
    recording,
  });
  const reading = noteMode.mode === 'reading';
  // Stable callbacks (the control object itself is new each render), for the memo below.
  const { notifyFocus, notifyBlur, notifyRemount } = noteMode;
  const [reveal, setReveal] = useState<{ y: number; token: number } | undefined>(undefined);
  const titleIndex = useTitleIndex(notes, { id: session.id, body }, reading);

  // Leaving editing (Done, or the keyboard hiding) ends the typing step and the body's focus.
  const wasReading = useRef(reading);
  useEffect(() => {
    if (reading && !wasReading.current) {
      history.onBodyBlur();
      editor.markBlurred();
    }
    wasReading.current = reading;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a mode change
  }, [reading]);

  // A new note opened with text already in it (a link to a missing note): typing continues after it.
  useEffect(() => {
    if (autoFocus && !session.stored && body.length > 0) {
      editor.select({ start: body.length, end: body.length });
    }
    // Once on mount; the screen's own mount effect requests the focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whether the input has ever reported a caret (until then the # button goes to the end).
  const selectionKnown = useRef(false);
  // The keyboard closed while the body may still be focused: the bar hides until it opens again.
  const [keyboardHidden, setKeyboardHidden] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardHidden(true),
    );
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardHidden(false),
    );
    return () => {
      hide.remove();
      show.remove();
    };
  }, []);

  const boundEditor = useMemo(
    () => ({
      ...editor,
      inputProps: {
        ...editor.inputProps,
        onSelectionChange: (sel: { start: number; end: number }) => {
          selectionKnown.current = true;
          editor.inputProps.onSelectionChange?.(sel);
        },
        onFocus: () => {
          setKeyboardHidden(false);
          notifyFocus();
          editor.inputProps.onFocus?.();
        },
        onBlur: () => {
          history.onBodyBlur();
          notifyBlur();
          editor.inputProps.onBlur?.();
        },
        onRemount: notifyRemount,
      },
      // A format edit is its own undo step, apart from the typing around it.
      toggleCheckbox: () => {
        history.onBodyBlur();
        editor.toggleCheckbox();
        history.onBodyBlur();
      },
    }),
    [editor, history, notifyFocus, notifyBlur, notifyRemount],
  );

  /** A tag action or transcript: its own undo step; the caret goes to `cursor`. */
  const applyBodyEdit = (next: { text: string; cursor: number }, focus: boolean) => {
    history.onBodyBlur();
    history.onBodyChange(next.text);
    history.onBodyBlur();
    editor.select({ start: next.cursor, end: next.cursor });
    if (focus) editor.focus();
  };

  const insertTagStart = () => {
    const pos = selectionKnown.current ? Math.min(editor.selection.end, body.length) : body.length;
    applyBodyEdit(insertHash(body, pos), true);
  };

  const inlineKnownTags = useMemo(() => {
    const out: string[] = [];
    for (const raw of knownTags) {
      const t = inlineTagFor(raw);
      if (t !== null && !out.includes(t)) out.push(t);
    }
    return out;
  }, [knownTags]);
  const sel = editor.selection;
  const wikiToken = sel.start === sel.end ? activeWikiToken(body, sel) : null;
  const wikiIndex = useTitleIndex(notes, { id: session.id, body }, wikiToken !== null);
  const wikiMatches =
    wikiToken && wikiIndex ? matchTitles(wikiIndex, wikiToken.query, 20, session.id) : [];
  const token = sel.start === sel.end && !wikiToken ? activeToken(body, sel.end) : null;
  // Tags elsewhere in this note (the word under the caret left out), from the body on every render.
  const offered = token
    ? suggestTags(
        inlineKnownTags,
        inlineTags(body.slice(0, token.start) + ' ' + body.slice(token.end)),
        token.query,
      )
    : [];
  const showBar =
    !reading &&
    !locked &&
    !recording &&
    editor.focused &&
    !keyboardHidden &&
    token !== null &&
    offered.length > 0;
  const showWikiBar =
    !reading &&
    !locked &&
    !recording &&
    editor.focused &&
    !keyboardHidden &&
    wikiToken !== null &&
    wikiMatches.length > 0;
  const suggestions =
    showWikiBar && wikiToken ? (
      <WikiLinkSuggestionBar
        matches={wikiMatches}
        onPick={(entry) => {
          const r = completeWikiToken(body, wikiToken, entry.title);
          if (!r.selection) return;
          applyBodyEdit({ text: r.text, cursor: r.selection.end }, true);
        }}
      />
    ) : showBar && token ? (
      <TagSuggestionBar
        matches={offered}
        onPick={(tag) => applyBodyEdit(completeToken(body, token, tag), true)}
      />
    ) : undefined;

  const shown = session.recordings.filter((r: SessionRecording) => !r.removed);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [focusedNote, setFocusedNote] = useState<string | null>(null);
  // When each new recording stopped (by its cache uri).
  const stoppedAt = useRef(new Map<string, Date>());
  // The recorded time each note shows, fixed when the view opens.
  const [recordedAts, setRecordedAts] = useState<Record<string, Date | null>>({});
  const recordedAtOf = (r: SessionRecording): Date | null =>
    r.persisted
      ? session.createdAt
        ? new Date(session.createdAt)
        : null
      : (stoppedAt.current.get(r.uri) ?? new Date());
  const openIndex = sheetOpen && focusedNote ? shown.findIndex((r) => r.id === focusedNote) : -1;
  // The active note is gone (undo hid it, or it was removed): close the view.
  if (sheetOpen && openIndex < 0) setSheetOpen(false);
  const openNote = (id: string) => {
    if (!shown.some((r) => r.id === id)) return;
    stopAllPlayback();
    // A focused body would keep the keyboard over the view; blurring it also ends the typing step.
    Keyboard.dismiss();
    setRecordedAts(Object.fromEntries(shown.map((r) => [r.id, recordedAtOf(r)])));
    setFocusedNote(id);
    setSheetOpen(true);
  };
  const sheetNotes = sheetOpen
    ? shown.map((r) => ({ ...r, recordedAt: recordedAts[r.id] ?? null }))
    : [];

  // The transcript goes to the end of the body as its own undo step; the keyboard stays closed.
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
        onRemove={!locked ? (id) => history.onRemoveRecording(id) : undefined}
        onOpen={openNote}
        focusId={focusedNote}
      />
    ) : undefined;

  const recordingPanel = recording ? (
    <RecordingPanel
      microphoneMessage={MICROPHONE_MESSAGE}
      leaveRef={leaveRef}
      onRecorded={(rec: PanelRecording) => {
        setRecording(false);
        // A new voice note is not undoable; typing ends as a step first.
        history.onRecordingAttached();
        stoppedAt.current.set(rec.uri, new Date());
        actions.attachRecording(rec);
      }}
      onClosed={() => setRecording(false)}
      onDiscarded={() => {
        setRecording(false);
        onRecordingDiscarded?.();
      }}
    />
  ) : undefined;

  const toolbar = (
    <NoteToolbar
      canUndo={history.canUndo && !recording}
      canRedo={history.canRedo && !recording}
      onUndo={history.undo}
      onRedo={history.redo}
      micDisabled={locked}
      onMic={() => {
        // Recording must not overlap playback.
        stopAllPlayback();
        Keyboard.dismiss();
        setRecording(true);
      }}
      formatDisabled={reading}
      onTags={insertTagStart}
      checkboxAction={editor.checkboxAction}
      onCheckbox={boundEditor.toggleCheckbox}
      disabled={locked}
    />
  );

  const startEditing = (offset: number, y?: number) => {
    if (locked) return;
    editor.select({ start: offset, end: offset });
    noteMode.enterEditing();
    editor.focus();
    if (y !== undefined) setReveal((r) => ({ y, token: (r?.token ?? 0) + 1 }));
  };

  const toggleMode = () => {
    if (reading) {
      const at = selectionKnown.current ? Math.min(editor.selection.end, body.length) : body.length;
      startEditing(at);
      return;
    }
    noteMode.done();
    history.onBodyBlur();
    editor.markBlurred();
    Keyboard.dismiss();
  };

  const readingView = (
    <NoteReadingView
      body={body}
      onEdit={startEditing}
      onToggleCheckbox={(offset) => {
        // A checkbox toggle is its own undo step; the caret and the mode stay as they are.
        history.onBodyBlur();
        editor.toggleCheckboxAt(offset);
        history.onBodyBlur();
      }}
      onOpenWeb={(url) => {
        void openWebLink(url).then((ok) => {
          if (!ok) Alert.alert(LINK_COPY.openFailedTitle, undefined, [{ text: 'OK' }]);
        });
      }}
      onOpenNote={(target) => onFollowNoteLink?.(target)}
      noteLinkState={(target) => noteLinkState(titleIndex, target, session.id)}
      imagesEnabled={imagesEnabled}
      linksDisabled={locked || recording}
      placeholder={BODY_PLACEHOLDER}
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
        <NoteEditorScreen
          {...page}
          stored={session.stored}
          pinned={session.pinned}
          locked={locked}
          autoFocus={autoFocus}
          mode={noteMode.mode}
          readingView={readingView}
          onToggleMode={toggleMode}
          modeToggleDisabled={recording}
          revealRequest={reveal}
          editor={boundEditor}
          attachment={attachment}
          recordingPanel={recordingPanel}
          suggestions={suggestions}
          toolbar={toolbar}
        />
      </View>
      {sheetOpen && openIndex >= 0 && (
        <VoiceNoteSheet
          notes={sheetNotes}
          initialIndex={openIndex}
          onIndexChange={(_index, id) => setFocusedNote(id)}
          busy={locked || recording}
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
