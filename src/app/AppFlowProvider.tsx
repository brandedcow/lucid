import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import { AccessibilityInfo, Alert } from 'react-native';
import type { NoteEditorBanner } from '../screens/NoteEditorScreen';
import type { NotesStackParamList } from '../navigation/NotesNavigator';
import { useDayMarker } from '../hooks/useDayMarker';
import { useLegacyMigration } from '../hooks/useLegacyMigration';
import { useNoteSession } from '../hooks/useNoteSession';
import { useNotes } from '../hooks/useNotes';
import { useRecordingTranscription } from '../hooks/useRecordingTranscription';
import { useSettings } from '../hooks/useSettings';
import { useToday } from '../hooks/useToday';
import { INDEX_UNREADABLE, NOTE_IN_TRASH, type Note } from '../services/notesStorage';
import { migrationNotice } from '../utils/migrationNotice';
import { LAUNCH_CAP_MS, noteLaunchTarget } from '../utils/noteLaunch';
import { tagsByUse } from '../utils/noteViewLabels';
import { dayDone, type NoteView } from '../utils/noteViews';
import { localDateKey } from '../utils/today';

/** The views the list can show (Recently Deleted is its own route). */
export type ListView = Exclude<NoteView, { kind: 'trash' }>;

export const FLOW_COPY = {
  inTrashAlert: 'This note is in Recently Deleted.',
  ok: 'OK',
  leaveFailedTitle: "Couldn't save your note",
  leaveFailedMessage:
    'Your text is still on screen. You can try again, or leave and lose what you wrote since the last save.',
  keepEditing: 'Keep editing',
  leaveAnyway: 'Leave anyway',
  deleteFailedTitle: "Couldn't delete this note.",
  deleteFailedMessage: 'Nothing was changed.',
  movedToTrash: 'Moved to Recently Deleted',
} as const;

const ALL: ListView = { kind: 'all' };

const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
};

// All app state and handlers, held above the navigator so any route can reach them. The open note
// lives here (not in route params), as the add-entry page's session did.
function useAppFlowValue() {
  const settings = useSettings();
  const dayMarker = useDayMarker();
  const { todayKey } = useToday();

  // The view survives opening and closing a note; it is session-only and starts at All Notes.
  const [view, setViewState] = useState<ListView>(ALL);
  const notes = useNotes({ view, todayKey });
  const { refresh } = notes;

  // The first thing a launch waits for besides the stores: the one-time import of earlier notes.
  const migration = useLegacyMigration(() => void refresh());
  const [retryRequested, setRetryRequested] = useState(false);
  // The dismissed line belongs to one result; a new result (after a retry) shows again.
  const [dismissedFor, setDismissedFor] = useState<unknown>(null);

  // The open note.
  const noteSession = useNoteSession({
    onCreated: (n: Note) => dayMarker.markDayDone(localDateKey(new Date(n.createdAt))),
    onChange: () => void refresh(),
  });
  const { session } = noteSession;

  // The recording panel's state, for the leave rule and for transcription.
  const entryRecordingRef = useRef(false);
  const entryLeaveRef = useRef<(() => void) | null>(null);
  const transcription = useRecordingTranscription({
    onResult: noteSession.setRecordingText,
    onlineAllowed: settings.onlineTranscription,
    isRecording: () => entryRecordingRef.current,
  });
  const { cancelAll: cancelTranscription, busyId: transcribingId } = transcription;
  const sessionRecordings = session?.recordings;
  // The note was left (no session) or changed to another one: stop the run.
  useEffect(() => {
    if (transcribingId === null) return;
    if (!sessionRecordings || !sessionRecordings.some((r) => r.id === transcribingId)) {
      cancelTranscription();
    }
  }, [sessionRecordings, transcribingId, cancelTranscription]);

  const [navigationRef] = useState(() => createNavigationContainerRef<NotesStackParamList>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Set just before the app itself pops Editor, so the route lets that one removal through; every
  // other removal (arrow, Android back, iOS swipe) goes to `leaveEditor`. The state is the same
  // fact: Editor stops preventing removal in the render where it is true, and only then pops.
  const allowLeaveRef = useRef(false);
  const [allowLeave, setAllowLeave] = useState(false);
  const resetAllowLeave = () => {
    allowLeaveRef.current = false;
    setAllowLeave(false);
  };

  // A leave or delete is running (ref: synchronous guard; state: locks the editor).
  const busy = useRef(false);
  const [locked, setLocked] = useState(false);
  // The open note is the launch note: leaving it empty marks the day done.
  const launchNote = useRef(false);
  // The pin value that could not be saved, for the banner's Try again.
  const [failedPin, setFailedPin] = useState<boolean | null>(null);

  // Launch: once the notes, the import, the day marker and the settings are read, the launch rule
  // picks a new note or the list. If they are not ready in time a new note opens anyway, and late
  // data never moves the user.
  const [launchDecided, setLaunchDecided] = useState(false);
  const [startInEditor, setStartInEditor] = useState(false);
  const launchResolved = useRef(false);
  const ready = notes.loaded && migration.settled && dayMarker.loaded && settings.loaded;
  const { openNew } = noteSession;
  useEffect(() => {
    if (launchResolved.current || !ready) return;
    launchResolved.current = true;
    const target = noteLaunchTarget({
      ready,
      indexStatus: notes.indexStatus,
      autoOpen: settings.autoOpenNewNote,
      done: dayDone(notes.all, dayMarker.doneDate, todayKey),
    });
    /* eslint-disable react-hooks/set-state-in-effect */
    if (target === 'newNote') {
      openNew();
      launchNote.current = true;
      setStartInEditor(true);
    }
    setLaunchDecided(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    ready,
    notes.indexStatus,
    notes.all,
    settings.autoOpenNewNote,
    dayMarker.doneDate,
    todayKey,
    openNew,
  ]);
  useEffect(() => {
    if (launchDecided) return;
    const timer = setTimeout(() => {
      if (launchResolved.current) return;
      launchResolved.current = true;
      openNew();
      launchNote.current = true;
      setStartInEditor(true);
      setLaunchDecided(true);
    }, LAUNCH_CAP_MS);
    return () => clearTimeout(timer);
  }, [launchDecided, openNew]);

  const currentRoute = () =>
    navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;

  // The selected tag no longer exists (its last note was deleted or edited) and the editor is
  // closed: back to All Notes.
  useEffect(() => {
    if (view.kind !== 'tag' || !notes.loaded || session) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to loaded data
    if (!notes.tags.some((t) => t.tag === view.tag)) setViewState(ALL);
  }, [view, notes.loaded, notes.tags, session]);

  const setView = (next: NoteView) => {
    if (next.kind !== 'trash') setViewState(next);
  };

  /** Opens a new, empty note (the "+" button). */
  const openNewNote = () => {
    if (busy.current || notes.indexStatus === 'unreadable' || session) return;
    if (!navigationRef.isReady() || currentRoute() === 'Editor') return;
    noteSession.openNew();
    launchNote.current = false;
    resetAllowLeave();
    setFailedPin(null);
    setLocked(false);
    navigationRef.navigate('Editor');
  };

  /** Opens a stored note from the list. */
  const openNote = (id: string) => {
    if (busy.current || session) return;
    if (!navigationRef.isReady() || currentRoute() === 'Editor') return;
    const note = notes.all.find((n) => n.id === id);
    if (!note) return;
    if (!noteSession.open(note)) {
      // The list was stale: the note is in Recently Deleted.
      void refresh();
      Alert.alert(FLOW_COPY.inTrashAlert, undefined, [{ text: FLOW_COPY.ok }]);
      return;
    }
    launchNote.current = false;
    resetAllowLeave();
    setFailedPin(null);
    setLocked(false);
    navigationRef.navigate('Editor');
  };

  // Refreshes the list, then pops Editor once (see `allowLeave`).
  const popEditor = async () => {
    await refresh();
    busy.current = false;
    if (!mounted.current) return;
    if (currentRoute() !== 'Editor') return;
    allowLeaveRef.current = true;
    setAllowLeave(true);
  };

  // The note was left or deleted without error.
  const finishLeave = async (kept: boolean, wasStored: boolean) => {
    if (launchNote.current && !kept) dayMarker.markDayDone(todayKey);
    launchNote.current = false;
    if (!kept && wasStored) AccessibilityInfo.announceForAccessibility(FLOW_COPY.movedToTrash);
    await popEditor();
  };

  const leaveAnyway = async () => {
    if (busy.current || !session) return;
    busy.current = true;
    setLocked(true);
    const wasStored = session.stored;
    const result = await noteSession.leave({ discardUnsaved: true });
    await finishLeave(result.kept, wasStored);
  };

  // Every way out of the editor (arrow, Android back, iOS edge swipe) ends here.
  const leaveEditor = async () => {
    if (busy.current || !session) return;
    // A recording is open: its own confirm runs; "Discard" calls this again.
    if (entryRecordingRef.current && entryLeaveRef.current) {
      entryLeaveRef.current();
      return;
    }
    busy.current = true;
    setLocked(true);
    const wasStored = session.stored;
    let result: Awaited<ReturnType<typeof noteSession.leave>>;
    try {
      result = await noteSession.leave();
    } catch (error) {
      result = { kept: true, error };
    }
    if (!mounted.current) return;
    if ('error' in result) {
      // Stay on the note with everything on screen.
      busy.current = false;
      setLocked(false);
      Alert.alert(FLOW_COPY.leaveFailedTitle, FLOW_COPY.leaveFailedMessage, [
        { text: FLOW_COPY.keepEditing, style: 'cancel' },
        { text: FLOW_COPY.leaveAnyway, style: 'destructive', onPress: () => void leaveAnyway() },
      ]);
      return;
    }
    await finishLeave(result.kept, wasStored);
  };

  /** Deletes the open note (menu); it goes to Recently Deleted. */
  const deleteOpenNote = async () => {
    if (busy.current || !session) return;
    busy.current = true;
    setLocked(true);
    let ok = false;
    try {
      ok = await noteSession.trash();
    } catch {
      ok = false;
    }
    if (!mounted.current) return;
    if (!ok) {
      busy.current = false;
      setLocked(false);
      Alert.alert(FLOW_COPY.deleteFailedTitle, FLOW_COPY.deleteFailedMessage, [
        { text: FLOW_COPY.ok },
      ]);
      return;
    }
    AccessibilityInfo.announceForAccessibility(FLOW_COPY.movedToTrash);
    launchNote.current = false;
    await popEditor();
  };

  // A failed pin leaves the session in its save-error state, which shows the banner.
  const setPin = async (pinned: boolean) => {
    const ok = await noteSession.setPinned(pinned);
    if (!mounted.current) return;
    setFailedPin(ok ? null : pinned);
  };

  const togglePin = async () => {
    if (busy.current || !session) return;
    await setPin(!session.pinned);
  };

  const retrySave = () => {
    if (failedPin !== null) void setPin(failedPin);
    else void noteSession.flush();
  };

  const bannerActions = { onRetry: retrySave, onLeave: () => void leaveEditor() };
  let banner: NoteEditorBanner | undefined;
  if (session?.saveState === 'error') {
    const code = session.error?.code ?? codeOf(session.error?.cause);
    if (code === NOTE_IN_TRASH) banner = { kind: 'inTrash', ...bannerActions };
    else if (code === INDEX_UNREADABLE) banner = { kind: 'unreadable', ...bannerActions };
    else banner = { kind: 'saveError', ...bannerActions };
  }

  const knownTags = useMemo(() => tagsByUse(notes.tags).map((t) => t.tag), [notes.tags]);

  const notice = migrationNotice({
    settled: migration.settled,
    result: migration.result,
    retrying: retryRequested && !migration.settled,
    dismissed: dismissedFor !== null && dismissedFor === migration.result,
    onDismiss: () => setDismissedFor(migration.result),
    onRetry: () => {
      setRetryRequested(true);
      migration.retry();
    },
  });

  return {
    launchDecided,
    startInEditor,
    navigationRef,
    view,
    setView,
    notes,
    migrationNotice: notice,
    openNote,
    openNewNote,
    session,
    sessionActions: noteSession,
    knownTags,
    transcription,
    entryRecordingRef: entryRecordingRef as MutableRefObject<boolean>,
    entryLeaveRef: entryLeaveRef as MutableRefObject<(() => void) | null>,
    locked,
    banner,
    leaveEditor,
    deleteOpenNote,
    togglePin,
    allowLeaveRef,
    allowLeave,
    resetAllowLeave,
    settings,
  };
}

export type AppFlow = ReturnType<typeof useAppFlowValue>;

const AppFlowContext = createContext<AppFlow | null>(null);

export function AppFlowProvider({ children }: { children: ReactNode }) {
  const value = useAppFlowValue();
  return <AppFlowContext.Provider value={value}>{children}</AppFlowContext.Provider>;
}

export function useAppFlow(): AppFlow {
  const value = useContext(AppFlowContext);
  if (!value) throw new Error('useAppFlow must be used inside AppFlowProvider');
  return value;
}
