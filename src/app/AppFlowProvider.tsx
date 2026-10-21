import {
  createContext,
  useContext,
  useEffect,
  useCallback,
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
import { confirmDeleteForever, confirmEmptyTrash } from '../utils/confirmForever';
import { noteHasDeletableAudio } from '../utils/deletedRow';
import { migrationNotice } from '../utils/migrationNotice';
import { LAUNCH_CAP_MS, noteLaunchTarget } from '../utils/noteLaunch';
import { shouldResumeNewDay } from '../utils/noteResume';
import { buildTitleIndex, resolveWikilink } from '../utils/noteLinks';
import { noteTitle } from '../utils/noteTitle';
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
  linkFailedTitle: "Couldn't open that note",
  openedLink: (title: string) => `Opened "${title}"`,
  createdLink: (title: string) => `Created "${title}"`,
} as const;

/** Copy for the trash, restore, pin and delete-forever actions (one place to edit the wording). */
export const TRASH_COPY = {
  restored: (title: string) => `Restored "${title}".`,
  restoredAnnouncement: 'Restored',
  restoreFailedTitle: "Couldn't restore this note.",
  restoreFailedMessage: 'It is still in Recently Deleted.',
  deletedForeverAnnouncement: 'Deleted forever',
  deleteForeverFailedTitle: "Couldn't delete this note.",
  deleteForeverFailedMessage: 'It is still in Recently Deleted. Try again.',
  emptiedAnnouncement: 'Recently Deleted emptied',
  emptyFailedTitle: "Couldn't delete everything.",
  emptyFailedMessage: 'Some notes are still in Recently Deleted. Try again.',
  pinned: 'Pinned',
  unpinned: 'Unpinned',
  pinFailedTitle: "Couldn't pin this note.",
  unpinFailedTitle: "Couldn't unpin this note.",
  pinFailedMessage: 'Nothing was changed.',
} as const;

/** The view the list starts on, and the one it returns to when the selected tag disappears. */
const DEFAULT_VIEW: ListView = { kind: 'today' };

const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
};

// All app state and handlers, held above the navigator so any route can reach them. The open note
// lives here (not in route params), as the old add-entry page's session did.
function useAppFlowValue() {
  const settings = useSettings();
  const dayMarker = useDayMarker();
  const { todayKey, resumeNewDayToken } = useToday();

  // The view survives opening and closing a note; it is session-only and starts at Today.
  const [view, setViewState] = useState<ListView>(DEFAULT_VIEW);
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
  const resetAllowLeave = useCallback(() => {
    allowLeaveRef.current = false;
    setAllowLeave(false);
  }, []);

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
  // The one way a launch note opens: the cold start (`navigate` asks the navigator to start on the
  // editor) and the resume on a new day (`navigate` pushes the editor over the current screen).
  const openLaunchNote = useCallback(
    (navigate: () => void) => {
      openNew();
      launchNote.current = true;
      resetAllowLeave();
      setFailedPin(null);
      setLocked(false);
      navigate();
    },
    [openNew, resetAllowLeave],
  );
  const startOnEditor = useCallback(() => setStartInEditor(true), []);
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
      openLaunchNote(startOnEditor);
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
    openLaunchNote,
    startOnEditor,
  ]);
  useEffect(() => {
    if (launchDecided) return;
    const timer = setTimeout(() => {
      if (launchResolved.current) return;
      launchResolved.current = true;
      openLaunchNote(startOnEditor);
      setLaunchDecided(true);
    }, LAUNCH_CAP_MS);
    return () => clearTimeout(timer);
  }, [launchDecided, openLaunchNote, startOnEditor]);

  const currentRoute = () =>
    navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;

  // The selected tag no longer exists (its last note was deleted or edited) and the editor is
  // closed: back to Today.
  useEffect(() => {
    if (view.kind !== 'tag' || !notes.loaded || session) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to loaded data
    if (!notes.tags.some((t) => t.tag === view.tag)) setViewState(DEFAULT_VIEW);
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

  // A save before leaving failed: stay on the note with everything on screen.
  const showLeaveFailed = () => {
    busy.current = false;
    setLocked(false);
    Alert.alert(FLOW_COPY.leaveFailedTitle, FLOW_COPY.leaveFailedMessage, [
      { text: FLOW_COPY.keepEditing, style: 'cancel' },
      { text: FLOW_COPY.leaveAnyway, style: 'destructive', onPress: () => void leaveAnyway() },
    ]);
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
      showLeaveFailed();
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

  // Trash, restore, delete forever, empty and the list's row pin/delete. One guard (`trashBusy`;
  // the ref is the synchronous half, the state locks the screens) covers a confirm that is open as
  // well as a running operation. Everything goes through the `useNotes` actions, which refresh the
  // list after every outcome; nothing here touches storage.
  const trashBusyRef = useRef(false);
  const [trashBusy, setTrashBusy] = useState(false);
  const [trashNotice, setTrashNotice] = useState<string | null>(null);
  const clearTrashNotice = useCallback(() => {
    if (mounted.current) setTrashNotice(null);
  }, []);
  /** Takes the guard; false (do nothing) while another action, a leave or an open note holds it. */
  const beginTrash = () => {
    if (trashBusyRef.current || busy.current || session || !mounted.current) return false;
    if (notes.indexStatus === 'unreadable') return false;
    trashBusyRef.current = true;
    setTrashBusy(true);
    setTrashNotice(null);
    return true;
  };
  const holdTrash = () => {
    trashBusyRef.current = true;
    setTrashBusy(true);
  };
  const endTrash = () => {
    trashBusyRef.current = false;
    if (mounted.current) setTrashBusy(false);
  };
  const tell = (title: string, message: string) => {
    if (mounted.current) Alert.alert(title, message, [{ text: FLOW_COPY.ok }]);
  };
  const announce = (text: string) => {
    if (mounted.current) AccessibilityInfo.announceForAccessibility(text);
  };

  /** Restore from Recently Deleted: the user stays on that screen; the note is not opened. */
  const restoreNote = async (id: string) => {
    const note = notes.trashed.find((n) => n.id === id);
    if (!note || !beginTrash()) return;
    try {
      const ok = await notes.restore(id);
      notes.clearError();
      if (!mounted.current) return;
      if (ok) {
        setTrashNotice(TRASH_COPY.restored(noteTitle(note.body)));
        announce(TRASH_COPY.restoredAnnouncement);
      } else {
        tell(TRASH_COPY.restoreFailedTitle, TRASH_COPY.restoreFailedMessage);
      }
    } finally {
      endTrash();
    }
  };

  // Runs after the confirm closed (synchronously, so nothing can slip in between).
  const runDeleteForever = async (id: string) => {
    holdTrash();
    try {
      const ok = await notes.deleteForever(id);
      notes.clearError();
      if (!mounted.current) return;
      if (ok) announce(TRASH_COPY.deletedForeverAnnouncement);
      else tell(TRASH_COPY.deleteForeverFailedTitle, TRASH_COPY.deleteForeverFailedMessage);
    } finally {
      endTrash();
    }
  };

  /** Delete forever: asks first; Keep or dismissing the dialog changes nothing. */
  const requestDeleteForever = (id: string) => {
    const note = notes.trashed.find((n) => n.id === id);
    if (!note || !beginTrash()) return;
    let released = false;
    confirmDeleteForever({
      hasAudio: noteHasDeletableAudio(note),
      onClose: () => {
        if (released) return;
        released = true;
        endTrash();
      },
      onConfirm: () => void runDeleteForever(id),
    });
  };

  const runEmptyTrash = async () => {
    holdTrash();
    try {
      const result = await notes.emptyTrash();
      notes.clearError();
      if (!mounted.current) return;
      // A read failure before anything was deleted reports 0 deleted and no failed id; the list
      // was not empty when the user confirmed, so that is a failure too.
      if (result.failedId !== undefined || result.deleted === 0) {
        tell(TRASH_COPY.emptyFailedTitle, TRASH_COPY.emptyFailedMessage);
      } else {
        announce(TRASH_COPY.emptiedAnnouncement);
      }
    } finally {
      endTrash();
    }
  };

  /** Empty Recently Deleted: asks first; Keep or dismissing the dialog changes nothing. */
  const requestEmptyTrash = () => {
    const count = notes.trashed.length;
    if (count === 0 || !beginTrash()) return;
    let released = false;
    confirmEmptyTrash({
      count,
      hasAudio: notes.trashed.some(noteHasDeletableAudio),
      onClose: () => {
        if (released) return;
        released = true;
        endTrash();
      },
      onConfirm: () => void runEmptyTrash(),
    });
  };

  /** Swipe Pin / Unpin on a list row. */
  const pinNote = async (id: string, pinned: boolean) => {
    if (!beginTrash()) return;
    try {
      const ok = await notes.pin(id, pinned);
      notes.clearError();
      if (!mounted.current) return;
      if (ok) announce(pinned ? TRASH_COPY.pinned : TRASH_COPY.unpinned);
      else
        tell(
          pinned ? TRASH_COPY.pinFailedTitle : TRASH_COPY.unpinFailedTitle,
          TRASH_COPY.pinFailedMessage,
        );
    } finally {
      endTrash();
    }
  };

  /** Swipe Delete on a list row: to Recently Deleted, no confirm and no undo. */
  const trashNote = async (id: string) => {
    if (!beginTrash()) return;
    try {
      const ok = await notes.trash(id);
      notes.clearError();
      if (!mounted.current) return;
      if (ok) announce(FLOW_COPY.movedToTrash);
      else tell(FLOW_COPY.deleteFailedTitle, FLOW_COPY.deleteFailedMessage);
    } finally {
      endTrash();
    }
  };

  // Chunk 5d fills this: it records the note the user came from, for "Back to <title>".
  const pushTrail = (fromId: string) => {
    void fromId;
  };

  /**
   * Follows a `[[note]]` link from the open note: opens the note with that title in place, or
   * creates one. The route does not change. Every await comes before `leave()` resolves into
   * `open`/`openNew`, so nothing can slip in between the old note closing and the new one opening.
   */
  const followNoteLink = async (target: string): Promise<void> => {
    if (busy.current || trashBusyRef.current || !session || !mounted.current) return;
    if (entryRecordingRef.current || notes.indexStatus === 'unreadable') return;
    if (currentRoute() !== 'Editor') return;
    busy.current = true;
    setLocked(true);
    const unlock = () => {
      busy.current = false;
      if (mounted.current) setLocked(false);
    };
    const from = session;
    // The list in state can be stale (the open note's own saves refresh it, others may not): read
    // fresh, once more if that load failed or was superseded.
    let fresh = await refresh();
    if (!fresh) fresh = await refresh();
    if (!mounted.current) return;
    if (!fresh) {
      unlock();
      Alert.alert(FLOW_COPY.linkFailedTitle, undefined, [{ text: FLOW_COPY.ok }]);
      return;
    }
    const index = buildTitleIndex(fresh, { id: from.id, body: from.body });
    const res = resolveWikilink(index, target, from.id);
    if (res.kind === 'invalid' || (res.kind === 'existing' && res.id === from.id)) {
      unlock();
      return;
    }
    let result: Awaited<ReturnType<typeof noteSession.leave>>;
    try {
      result = await noteSession.leave();
    } catch (error) {
      result = { kept: true, error };
    }
    if (!mounted.current) return;
    if ('error' in result) {
      showLeaveFailed();
      return;
    }
    // No await from here to the end of the open.
    if (launchNote.current && !result.kept) dayMarker.markDayDone(todayKey);
    launchNote.current = false;
    if (res.kind === 'existing') {
      const note = fresh.find((n) => n.id === res.id);
      if (!note || !noteSession.open(note)) {
        // Cannot happen with a fresh list; fall back to the list.
        await popEditor();
        return;
      }
    } else {
      noteSession.openNew({ body: res.title });
    }
    resetAllowLeave();
    setFailedPin(null);
    busy.current = false;
    setLocked(false);
    if (result.kept) pushTrail(from.id);
    announce(
      res.kind === 'existing' ? FLOW_COPY.openedLink(res.title) : FLOW_COPY.createdLink(res.title),
    );
  };

  // Returning to the app on a new day: push a new launch note over whatever screen is showing
  // (leaving it returns there). The token is consumed on every change, so a blocked resume is never
  // retried later; `shouldResumeNewDay` holds every guard. No timer: `useToday` raises the token.
  const consumedToken = useRef(0);
  const resumeInputs = useRef<Omit<Parameters<typeof shouldResumeNewDay>[0], 'token'>>(null!);
  const resumeOpen = useRef(openLaunchNote);
  useEffect(() => {
    resumeOpen.current = openLaunchNote;
    resumeInputs.current = {
      consumedToken: consumedToken.current,
      launchDecided,
      loaded: notes.loaded,
      indexStatus: notes.indexStatus,
      autoOpen: settings.autoOpenNewNote,
      done: dayDone(notes.all, dayMarker.doneDate, todayKey),
      sessionOpen: session !== null,
      busy: busy.current,
      trashBusy: trashBusyRef.current || trashBusy,
      onEditor: currentRoute() === 'Editor',
      navReady: navigationRef.isReady(),
    };
  });
  useEffect(() => {
    if (resumeNewDayToken <= consumedToken.current) return;
    const input = { ...resumeInputs.current, token: resumeNewDayToken };
    // The synchronous guards are read now, not from the last render.
    input.consumedToken = consumedToken.current;
    input.busy = busy.current;
    input.trashBusy = trashBusyRef.current || input.trashBusy;
    input.navReady = navigationRef.isReady();
    input.onEditor = input.navReady && navigationRef.getCurrentRoute()?.name === 'Editor';
    consumedToken.current = resumeNewDayToken;
    if (!mounted.current || !shouldResumeNewDay(input)) return;
    resumeOpen.current(() => navigationRef.navigate('Editor'));
  }, [resumeNewDayToken, navigationRef]);

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
    todayKey,
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
    followNoteLink,
    togglePin,
    allowLeaveRef,
    allowLeave,
    resetAllowLeave,
    settings,
    trashBusy,
    trashNotice,
    clearTrashNotice,
    restoreNote,
    requestDeleteForever,
    requestEmptyTrash,
    pinNote,
    trashNote,
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
