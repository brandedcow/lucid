import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StackActions, createNavigationContainerRef } from '@react-navigation/native';
import { Alert, BackHandler, Keyboard } from 'react-native';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useDreamLibrary } from '../hooks/useDreamLibrary';
import { useDayMarker } from '../hooks/useDayMarker';
import {
  entryHasContent,
  entryHasEdits,
  hasPendingAudioRemoval,
  useEntrySession,
} from '../hooks/useEntrySession';
import { useJournals } from '../hooks/useJournals';
import { useLogView } from '../hooks/useLogView';
import { useSettings } from '../hooks/useSettings';
import { useRecordingTranscription } from '../hooks/useRecordingTranscription';
import { useToday } from '../hooks/useToday';
import {
  getIndexStatus,
  isIndexUnreadableError,
  isSafetyCopyBlockedError,
  listDreams,
} from '../services/dreamStorage';
import { hasAudio, type Dream } from '../types/dream';
import { DREAMS_JOURNAL, type JournalId } from '../types/entry';
import { confirmDeleteDream, confirmDeleteJournal } from '../utils/confirmDelete';
import { formatToday } from '../utils/format';
import { tagsByUse } from '../utils/tags';
import {
  entriesFor,
  isBuiltInJournal,
  journalOrDefault,
  journalCopy,
  journalOf,
  kindOf,
  type Journal,
  type JournalCopy,
} from '../utils/journals';
import { journalCounts } from '../utils/journalSearch';
import {
  DISCARD_CHANGES_DISCARD,
  DISCARD_CHANGES_KEEP,
  DISCARD_CHANGES_TITLE,
  LEAVE_ENTRY_DISCARD,
  LEAVE_ENTRY_KEEP,
  LEAVE_ENTRY_MESSAGE,
  LEAVE_ENTRY_SAVE_DRAFT,
  LEAVE_ENTRY_TITLE,
  backTarget,
  discardChangesMessage,
} from '../utils/sessionNavigation';
import { dayStatus, launchScreen } from '../utils/today';

// Log, Search and Settings are routes of their own; this is what remains of the `Main` route's switch
// ('add' while the Add route is on top).
export type Screen = 'add' | 'today';

// How long the launch waits for stored data before opening the Dreams page anyway: speed on waking
// outranks the launch rule.
const LAUNCH_CAP_MS = 1000;

// Retrying will not help in the safety-copy case, so that message does not say so.
function deleteFailureMessage(e: unknown, copy: JournalCopy): string {
  if (isIndexUnreadableError(e)) return copy.deleteFailureUnreadable;
  if (isSafetyCopyBlockedError(e)) return copy.deleteFailureSafetyCopy;
  return 'Please try again.';
}

const JOURNAL_UNREADABLE_MESSAGE = 'Your saved entries could not be read, so nothing was deleted.';

// All app state and handlers, held above the navigator so any route can reach them. Moved
// unchanged from the old AppScreen; the screens' render stays in App.tsx (MainRoute).
function useAppFlowValue() {
  const [screen, setScreen] = useState<Screen | null>(null);
  // True for the add-entry page opened by the launch rule (Dreams, new): backing out of it while
  // it is empty counts as No dream.
  const [launchPage, setLaunchPage] = useState(false);
  // The navigation container's handle, for pushing and popping the Add route from the handlers.
  const [navigationRef] = useState(() => createNavigationContainerRef<RootStackParamList>());
  // True while the Add route is on top of the stack. Set when it is pushed and re-read from the
  // container's state on every change; `current` derives from it.
  const [addOpen, setAddOpen] = useState(false);
  // The route in focus, re-read from the container on every change (like `addOpen`). Settings and
  // Search are routes over `Main`, so `current` no longer says when one of them is showing.
  const [routeName, setRouteName] = useState<keyof RootStackParamList>('Main');
  // Set just before the app itself pops the Add route, so the route's `beforeRemove` guard lets
  // that one removal through (every other removal goes to `backFromAdd`).
  const allowLeaveRef = useRef(false);
  // The same fact as state: the Add route stops preventing removal in the render where this is
  // true, and only then pops (see `leaveFlow`). The ref is for synchronous reads in listeners.
  const [allowLeave, setAllowLeave] = useState(false);
  const resetAllowLeave = () => {
    allowLeaveRef.current = false;
    setAllowLeave(false);
  };
  // The screen the user sees: the Add route when it is on top, else the screen switch's. The switch
  // keeps its own value underneath (and never holds 'add' itself any more).
  const current: Screen | null = addOpen ? 'add' : screen;
  // Pushes the add-entry page over whatever screen is showing. Does nothing before the container is
  // ready or while the page is already up (a resume or a second tap never stacks a second one).
  const openAdd = () => {
    if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name === 'Add') return;
    resetAllowLeave();
    navigationRef.navigate('Add');
    setAddOpen(true);
  };
  // Pushes Settings or Search over Today. Does nothing before the container is ready or when
  // Today is not the route in focus (a second tap never stacks a second one).
  const pushRoute = (name: 'Settings' | 'Search') => {
    if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name !== 'Main') return;
    navigationRef.navigate(name);
  };
  const openSettings = () => pushRoute('Settings');
  // The drawer closes before the push, so it is never left open behind Search.
  const openSearch = () => {
    setJournalsOpen(false);
    pushRoute('Search');
  };
  // Re-reads from the container the focused route (after any push or pop, from any source).
  const syncAddOpen = () => {
    const name = navigationRef.getCurrentRoute()?.name;
    if (name) setRouteName(name);
    const onAdd = name === 'Add';
    // Once Add is gone the one-shot permission to leave is spent.
    if (!onAdd) resetAllowLeave();
    setAddOpen(onAdd);
  };
  // The add-entry page's recorder: true while it starts or runs (readable synchronously), and the
  // page's discard confirmation for back to open.
  const entryRecordingRef = useRef(false);
  const entryLeaveRef = useRef<(() => void) | null>(null);
  // True while the Journals drawer (a panel over Today, opened by its book icon or a left-edge swipe)
  // is open. It only ever shows on Today: leaving Today closes it.
  const [journalsOpen, setJournalsOpen] = useState(false);
  // True while the "New journal" name sheet is open (over Today, with or without the drawer).
  const [namingJournal, setNamingJournal] = useState(false);
  // The custom journal whose name is being edited in the Rename sheet over the Journals drawer. Never
  // open together with the "New journal" sheet.
  const [renamingJournalId, setRenamingJournalId] = useState<JournalId | null>(null);
  // The journal registry: the built-in journals, then the user's own.
  const journalRegistry = useJournals();
  const { journals } = journalRegistry;
  const journalFor = (id: JournalId): Journal => journalOrDefault(journals, id);
  // The entry on the add-entry page (new entries, drafts and edits).
  const entry = useEntrySession(journals);
  const settings = useSettings();
  // Transcription of voice notes: on the phone, or online only if the user opted in (Settings).
  // Lives here, above the page, so closing the sheet does not cancel a run; results go straight to
  // the session recording.
  const transcription = useRecordingTranscription({
    onResult: entry.setRecordingTranscript,
    onlineAllowed: settings.onlineTranscription,
    isRecording: () => entryRecordingRef.current,
  });
  const { cancelAll: cancelTranscription, busyId: transcribingId } = transcription;
  const sessionRecordings = entry.session?.recordings;
  // The page was left (no session) or the session changed to another entry: stop the run.
  useEffect(() => {
    if (transcribingId === null) return;
    if (!sessionRecordings || !sessionRecordings.some((r) => r.id === transcribingId)) {
      cancelTranscription();
    }
  }, [sessionRecordings, transcribingId, cancelTranscription]);
  const library = useDreamLibrary();
  const dayMarker = useDayMarker();
  const { todayKey, resumeNewDayToken } = useToday();
  // Created here so the filter, search and scroll position survive leaving the Dream log.
  const view = useLogView();
  // Search across journals keeps its own query, tags and scroll while an entry is open.
  const searchView = useLogView();
  // True from the start of a save until its refresh finishes, so a second tap or back cannot race it.
  const finishing = useRef(false);
  // The dream being deleted from a list, held from the confirmed delete until it ends.
  const [deletingDream, setDeletingDream] = useState<Dream | null>(null);
  // The custom journal being deleted (state, for the UI), from the confirmed delete until it ends.
  // Its entries are hidden everywhere but the Journals card count; nothing stored is changed.
  const [deletingJournalId, setDeletingJournalId] = useState<JournalId | null>(null);
  // True while the "Delete this journal?" dialog is up, so a second swipe cannot stack another.
  const journalDialogOpen = useRef(false);
  // True while a journal delete runs, readable synchronously (rename is refused then).
  const deletingJournalRef = useRef(false);
  // True while the delete of the entry open on the add-entry page runs (readable synchronously):
  // Back and the check are ignored then.
  const entryDeleting = useRef(false);
  // True while the "Delete this entry?" dialog from the add-entry page's menu is up.
  const entryDialogOpen = useRef(false);
  // True while any delete (an entry's or a journal's) runs, readable synchronously: a second delete
  // is ignored.
  const deleting = useRef(false);
  // The journal whose log was opened last, for `showLog` to compare against (the log itself is the
  // `Log` route, whose param holds the journal).
  const lastLogJournal = useRef<JournalId>(DREAMS_JOURNAL);
  // The latest stored records and journals, for a journal delete confirmed after a dialog.
  const live = useRef({
    records: library.dreams,
    indexStatus: library.indexStatus,
    custom: journalRegistry.custom,
    sessionJournal: entry.session?.journalId ?? null,
  });
  useEffect(() => {
    live.current = {
      records: library.dreams,
      indexStatus: library.indexStatus,
      custom: journalRegistry.custom,
      sessionJournal: entry.session?.journalId ?? null,
    };
  });

  // Launch: once the library, the No dream marker, the settings and the journals are read, the launch
  // rule picks the Dreams add-entry page or Today. If they are not ready in time, the Dreams page
  // opens and the late data never moves the user.
  const startEntry = entry.startNew;
  const ready =
    library.dreams !== null && dayMarker.loaded && settings.loaded && journalRegistry.loaded;
  // True once the launch is decided (by the rule or by the cap), so only one of them acts.
  const launchResolved = useRef(false);
  useEffect(() => {
    if (launchResolved.current || !ready) return;
    launchResolved.current = true;
    const status = dayStatus(library.dreams ?? [], dayMarker.noDreamDate, todayKey);
    const target = launchScreen({ ...status, autoOpen: settings.autoOpenDreamCapture });
    /* eslint-disable react-hooks/set-state-in-effect */
    if (target === 'add') {
      startEntry(DREAMS_JOURNAL);
      setLaunchPage(true);
      // The navigator mounts with Add on top of Today (see `RootNavigator`'s `startInAdd`).
      setAddOpen(true);
    }
    setScreen('today');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    ready,
    library.dreams,
    dayMarker.noDreamDate,
    todayKey,
    settings.autoOpenDreamCapture,
    startEntry,
  ]);
  useEffect(() => {
    if (screen !== null) return;
    const timer = setTimeout(() => {
      if (launchResolved.current) return;
      launchResolved.current = true;
      startEntry(DREAMS_JOURNAL);
      setLaunchPage(true);
      setAddOpen(true);
      setScreen('today');
    }, LAUNCH_CAP_MS);
    return () => clearTimeout(timer);
  }, [screen, startEntry]);

  // Resume after a new day: `resumeNewDayToken` increases once each time the app returns to the
  // foreground on a different day than it left on (never on a foreground midnight rollover, and
  // not twice on the same new day). If nothing is done yet, jump to the launch Dreams page (when
  // auto-open is on and the user is not mid-flow).
  // Everything the resume rule reads, as of the latest render (never stale).
  const resumeInputs = useRef({
    screen: current,
    routeName,
    searching: view.searching,
    ready,
    dreams: library.dreams,
    noDreamDate: dayMarker.noDreamDate,
    autoOpen: settings.autoOpenDreamCapture,
    sessionOpen: entry.session !== null,
    deleteRunning: deletingDream !== null,
  });
  useEffect(() => {
    resumeInputs.current = {
      screen: current,
      routeName,
      searching: view.searching,
      ready,
      dreams: library.dreams,
      noDreamDate: dayMarker.noDreamDate,
      autoOpen: settings.autoOpenDreamCapture,
      sessionOpen: entry.session !== null,
      deleteRunning: deletingDream !== null,
    };
  });
  // Set by the resume jump from a log whose search is open; the reset waits for the search to close.
  const [pendingLaunchReset, setPendingLaunchReset] = useState(false);
  useEffect(() => {
    if (!pendingLaunchReset || view.searching) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setPendingLaunchReset(false);
    resetAllowLeave();
    navigationRef.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'Add' }] });
    setAddOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on these two only
  }, [pendingLaunchReset, view.searching]);
  useEffect(() => {
    if (resumeNewDayToken === 0) return;
    const r = resumeInputs.current;
    // Not launched yet (the launch rule decides), data not loaded, or the user is mid-flow.
    if (r.screen === null || !r.ready || r.dreams === null) return;
    if (r.sessionOpen || r.deleteRunning || deleting.current) return;
    if (r.screen === 'add') return;
    const status = dayStatus(r.dreams, r.noDreamDate, todayKey);
    if (launchScreen({ ...status, autoOpen: r.autoOpen }) !== 'add') return;
    startEntry(DREAMS_JOURNAL);
    setLaunchPage(true);
    // Back from the launch page lands on Today whatever screen the user was on.
    setScreen('today');
    if (r.routeName === 'Settings' || r.routeName === 'Search' || r.routeName === 'Log') {
      // Log, Settings or Search is in the stack: replace it, so back from the launch page lands on
      // Today. Search starts fresh next time (the reset may not run its `beforeRemove`).
      searchView.clearFilters();
      if (r.searching) {
        // A log with its search open prevents its own removal: the search closes first and the
        // reset follows from the effect above, once that has rendered.
        view.closeSearch();
        setPendingLaunchReset(true);
      } else {
        resetAllowLeave();
        navigationRef.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'Add' }] });
        setAddOpen(true);
      }
    } else {
      openAdd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on the token only; the rest is read fresh
  }, [resumeNewDayToken]);

  // While a custom journal is deleted its entries and its row in the Add entry sheet are hidden
  // (nothing stored is changed). Today, Search, the logs and the entry screen read these; only the
  // Journals card count reads the unfiltered records.
  const visibleRecords = useMemo(
    () =>
      library.dreams && deletingJournalId
        ? library.dreams.filter((d) => journalOf(d) !== deletingJournalId)
        : library.dreams,
    [library.dreams, deletingJournalId],
  );
  // Existing tags for the add-entry page's suggestion bar.
  const knownTags = useMemo(() => tagsByUse(library.dreams), [library.dreams]);
  const visibleJournals = useMemo(
    () => (deletingJournalId ? journals.filter((j) => j.id !== deletingJournalId) : journals),
    [journals, deletingJournalId],
  );

  // The drawer is never left open behind another screen.
  if (journalsOpen && (current !== 'today' || routeName !== 'Main')) setJournalsOpen(false);
  // A journal delete that sent the open entry away wants the drawer open on Today. The page pops a
  // render after the delete (see `leaveFlow`), so the drawer opens once Today is what shows.
  const [drawerAfterLeave, setDrawerAfterLeave] = useState(false);
  if (drawerAfterLeave && current === 'today' && routeName === 'Main') {
    setDrawerAfterLeave(false);
    setJournalsOpen(true);
  }

  // An entry of the journal that is being deleted, open on the add-entry page, goes back to Today
  // with the Journals drawer open (where the delete shows) instead of showing something that no
  // longer exists. (The journal's log does the same itself, see `LogRoute`.)
  const sessionId = entry.session?.id;

  // The add page can leave its keyboard up; no other screen has an input to keep it for.
  const prevScreen = useRef(current);
  useEffect(() => {
    if (prevScreen.current === 'add' && current !== 'add') Keyboard.dismiss();
    prevScreen.current = current;
  }, [current]);

  // The name sheet opens from the shared "+" menu, so it can show over any screen but the add page: a
  // jump to the add page (the new-day launch page) closes it.
  if (namingJournal && current === 'add') setNamingJournal(false);

  // The Rename sheet belongs to the Journals drawer: closing the drawer or leaving Today closes the sheet. It also closes if its
  // journal is gone from the registry or is being deleted.
  const renamingJournal = renamingJournalId
    ? journalRegistry.custom.find((j) => j.id === renamingJournalId)
    : undefined;
  if (
    renamingJournalId &&
    (current !== 'today' ||
      routeName !== 'Main' ||
      !journalsOpen ||
      !renamingJournal ||
      deletingJournalId === renamingJournalId)
  ) {
    setRenamingJournalId(null);
  }

  const counts = useMemo(
    () => (library.dreams ? journalCounts(journals, library.dreams) : null),
    [journals, library.dreams],
  );

  // Opens a journal's log (a `Log` route pushed over Today). The log's filter, search and scroll
  // belong to one journal at a time, so they start fresh when the open log changes. The drawer
  // closes first, so it is never left open behind the log.
  const showLog = (id: JournalId) => {
    if (id !== lastLogJournal.current) view.clearFilters();
    lastLogJournal.current = id;
    setJournalsOpen(false);
    if (!navigationRef.isReady()) return;
    // From Settings or Search (the shared "+" menu's New journal): back to Today first, so the log
    // is pushed over Today and back from it lands there.
    const showing = navigationRef.getCurrentRoute()?.name;
    if (showing === 'Settings' || showing === 'Search')
      navigationRef.dispatch(StackActions.popToTop());
    navigationRef.navigate('Log', { journalId: id });
  };

  // Where a flow ends: the screen it started from, which is still mounted under the Add route (so a
  // log keeps its filter, search and scroll; Today, Search and Settings keep theirs). A log whose
  // journal was deleted meanwhile pops itself to Today (see `LogRoute`). It does not pop: it raises
  // the allow flag (ref and state), the Add route stops preventing removal in that render, and its
  // effect then pops once. A pop made in the same tick would still meet the prevention of the
  // previous render.
  const leaveFlow = () => {
    if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name !== 'Add') return;
    allowLeaveRef.current = true;
    setAllowLeave(true);
  };

  // No dream: in memory first, so Today shows it at once; the file write follows and a failed
  // write never blocks leaving.
  const recordNoDream = () => {
    dayMarker.markNoDream(todayKey);
    setScreen('today');
  };

  // No dream by Back on an empty launch page (and a discarded recording on it); it pops to Today.
  const handleNoDream = () => {
    recordNoDream();
    leaveFlow();
  };

  // The add page was removed by the system (the iOS swipe, the arrow, Android back) while leaving
  // needed no prompt: only the side effects of leaving remain, the route is going anyway. An empty
  // new page on the launch Dreams page counts as No dream (Today is already underneath).
  const finishSystemLeave = () => {
    const current = entry.session;
    entry.clear();
    if (
      current &&
      current.origin === 'new' &&
      launchPage &&
      current.journalId === DREAMS_JOURNAL &&
      !entryHasContent(current) &&
      !hasPendingAudioRemoval(current)
    ) {
      recordNoDream();
    }
  };

  // The add page pops the route, which cannot be done while rendering, so it is an effect.
  const addShowsDeletingJournal =
    deletingJournalId !== null &&
    current === 'add' &&
    sessionId !== undefined &&
    !!library.dreams?.some((d) => d.id === sessionId && journalOf(d) === deletingJournalId);
  useEffect(() => {
    if (!addShowsDeletingJournal) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    entry.clear();
    leaveFlow();
    setDrawerAfterLeave(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires when the condition turns true
  }, [addShowsDeletingJournal]);

  // After a save: the screen the flow started from.
  const leaveAfterSave = () => {
    entry.clear();
    leaveFlow();
  };

  // The add-entry page's check: saves a finished entry, refreshes the library, then leaves. An
  // edit never saves a draft, and with no changes it writes nothing.
  const saveEntryAndLeave = async (status: 'draft' | 'saved') => {
    const current = entry.session;
    if (finishing.current || entryDeleting.current || !current) return;
    const isEdit = current.origin === 'edit';
    if (isEdit && status === 'draft') return;
    if (isEdit && !entryHasEdits(current)) {
      leaveAfterSave();
      return;
    }
    finishing.current = true;
    try {
      if (!(await entry.save(status))) return;
      await library.refresh();
      leaveAfterSave();
    } finally {
      finishing.current = false;
    }
  };

  // Back on the add-entry page. An edit asks to discard only when it changed; a new entry or draft
  // asks Save draft / Discard / Keep writing only when something is typed. An empty new page on the
  // launch Dreams page counts as No dream. Nothing is stored until a choice is made.
  const backFromAdd = () => {
    const current = entry.session;
    if (!current || finishing.current || entry.isSaving()) return;
    if (entryDeleting.current) return;
    // A running recording always asks first. Discard stops it, deletes its cache file and comes
    // back here, so what else is on the page gets its usual prompt.
    if (entryRecordingRef.current) {
      entryLeaveRef.current?.();
      return;
    }
    if (current.origin === 'edit') {
      const leaveEdit = () => {
        entry.clear();
        leaveFlow();
      };
      if (!entryHasEdits(current)) {
        leaveEdit();
        return;
      }
      Alert.alert(
        DISCARD_CHANGES_TITLE,
        discardChangesMessage(kindOf(journals, current.journalId)),
        [
          { text: DISCARD_CHANGES_KEEP, style: 'cancel' },
          { text: DISCARD_CHANGES_DISCARD, style: 'destructive', onPress: leaveEdit },
        ],
      );
      return;
    }
    const leave = (asNoDream: boolean) => {
      entry.clear();
      if (asNoDream) handleNoDream();
      else leaveFlow();
    };
    // A closed stored recording is an unsaved change even when nothing else is on the page.
    if (!entryHasContent(current) && !hasPendingAudioRemoval(current)) {
      leave(current.origin === 'new' && launchPage && current.journalId === DREAMS_JOURNAL);
      return;
    }
    Alert.alert(LEAVE_ENTRY_TITLE, LEAVE_ENTRY_MESSAGE, [
      { text: LEAVE_ENTRY_SAVE_DRAFT, onPress: () => void saveEntryAndLeave('draft') },
      { text: LEAVE_ENTRY_DISCARD, style: 'destructive', onPress: () => leave(false) },
      { text: LEAVE_ENTRY_KEEP, style: 'cancel' },
    ]);
  };

  // Deletes an entry (the caller has already confirmed). From a list row nothing navigates: the
  // lists keep their own view state. If the add-entry page holds this very entry, a successful
  // delete closes the page (edits are lost on purpose, the confirm said so) and leaves to where it
  // was opened, without the discard prompt; a failure leaves the page and its edits as they were.
  const deleteDreamFor = async (target: Dream) => {
    if (deleting.current) return;
    deleting.current = true;
    const fromEntry = current === 'add' && sessionId !== undefined && sessionId === target.id;
    entryDeleting.current = fromEntry;
    setDeletingDream(target);
    try {
      await library.remove(target.id);
      if (fromEntry) {
        entry.clear();
        leaveFlow();
      }
    } catch (e) {
      const copy = journalCopy(journalFor(journalOf(target)));
      Alert.alert(copy.deleteFailureTitle, deleteFailureMessage(e, copy));
    } finally {
      deleting.current = false;
      entryDeleting.current = false;
      setDeletingDream(null);
    }
  };

  // The "..." menu's Delete on the add-entry page (a stored entry or draft only): the shared
  // confirmation, then the same delete as the lists. Ignored while another delete runs, a save is in
  // flight or a recording is open.
  const requestDeleteOpenEntry = () => {
    const open = entry.session;
    if (!open?.id || current !== 'add') return;
    const stored = library.dreams?.find((d) => d.id === open.id);
    if (!stored) return;
    if (
      deleting.current ||
      finishing.current ||
      entry.isSaving() ||
      entryRecordingRef.current ||
      entryDialogOpen.current
    ) {
      return;
    }
    entryDialogOpen.current = true;
    confirmDeleteDream({
      hasAudio: hasAudio(stored),
      kind: kindOf(journals, journalOf(stored)),
      onClose: () => {
        entryDialogOpen.current = false;
      },
      onConfirm: () => void deleteDreamFor(stored),
    });
  };

  // Whether a custom journal may be renamed right now: only a journal in the registry's custom list,
  // and never while a journal delete runs or its confirmation is up.
  const canRenameJournal = (id: JournalId) =>
    !isBuiltInJournal(id) &&
    live.current.custom.some((j) => j.id === id) &&
    !deletingJournalRef.current &&
    !journalDialogOpen.current;

  // Opens the Rename sheet for a custom journal (from its card in the Journals drawer only).
  const requestRenameJournal = (id: JournalId) => {
    if (!canRenameJournal(id)) return;
    setNamingJournal(false);
    setRenamingJournalId(id);
  };

  // Asks before deleting a custom journal and all its entries. Only a journal in the registry's
  // custom list qualifies, so Dreams, Life and unknown ids do nothing.
  const requestDeleteJournal = (id: JournalId) => {
    if (isBuiltInJournal(id)) return;
    const journal = live.current.custom.find((j) => j.id === id);
    if (!journal) return;
    if (deleting.current || journalDialogOpen.current || finishing.current) return;
    if (live.current.sessionJournal === id) return;
    const records = live.current.records;
    if (records === null || live.current.indexStatus === 'unreadable') {
      Alert.alert(`Could not delete "${journal.name}"`, JOURNAL_UNREADABLE_MESSAGE);
      return;
    }
    const mine = entriesFor(records, id);
    journalDialogOpen.current = true;
    confirmDeleteJournal({
      name: journal.name,
      entryCount: mine.length,
      hasAudio: mine.some(hasAudio),
      onClose: () => {
        journalDialogOpen.current = false;
      },
      onConfirm: () => void deleteJournalFor(id),
    });
  };

  // Deletes a custom journal (the caller has already confirmed): every entry in it, drafts
  // included, one at a time through the existing entry delete, and only when all of them are gone
  // the journal itself, LAST, so entries are never left without their journal. Any failure stops
  // everything, leaves the journal listed and tells the user what is left. Everything is re-read
  // here, so what is deleted is exactly the entries of this journal as stored now.
  const deleteJournalFor = async (id: JournalId) => {
    if (isBuiltInJournal(id)) return;
    const journal = live.current.custom.find((j) => j.id === id);
    if (!journal) return;
    if (deleting.current || finishing.current) return;
    if (live.current.sessionJournal === id) return;
    const records = live.current.records;
    if (records === null || live.current.indexStatus === 'unreadable') {
      Alert.alert(`Could not delete "${journal.name}"`, JOURNAL_UNREADABLE_MESSAGE);
      return;
    }
    const ids = entriesFor(records, id).map((d) => d.id);
    deleting.current = true;
    deletingJournalRef.current = true;
    setDeletingJournalId(id);
    let failure: { title: string; message: string } | null = null;
    try {
      const result = await library.removeMany(ids);
      if (result.remaining.length > 0) {
        const total = ids.length;
        const left = result.remaining.length;
        failure = {
          title: `Could not delete "${journal.name}"`,
          message: `Deleted ${result.deleted.length} of ${total} ${total === 1 ? 'entry' : 'entries'}. ${left} still ${left === 1 ? 'remains' : 'remain'}. Try again.`,
        };
      } else {
        // Last check before the journal is unlisted: read the stored entries again. If any entry of
        // this journal exists (or the store cannot be read) the journal is NOT removed.
        let left = -1;
        try {
          if ((await getIndexStatus()) === 'ok') left = entriesFor(await listDreams(), id).length;
        } catch {
          left = -1;
        }
        if (left !== 0) {
          failure =
            left < 0
              ? {
                  title: `Could not delete "${journal.name}"`,
                  message:
                    'Its entries were deleted, but your saved entries could not be read again, so the journal was kept. Try again.',
                }
              : {
                  title: `Could not delete "${journal.name}"`,
                  message: `Deleted ${result.deleted.length} of ${result.deleted.length + left} ${result.deleted.length + left === 1 ? 'entry' : 'entries'}. ${left} still ${left === 1 ? 'remains' : 'remain'}. Try again.`,
                };
        } else {
          try {
            await journalRegistry.remove(id);
          } catch {
            failure = {
              title: `Could not remove "${journal.name}"`,
              message: `All its entries were deleted, but the journal itself could not be removed. It is still listed, now empty. Try again.`,
            };
          }
        }
      }
    } catch {
      failure = {
        title: `Could not delete "${journal.name}"`,
        message: 'Some entries may not have been deleted. Try again.',
      };
    } finally {
      deleting.current = false;
      deletingJournalRef.current = false;
      setDeletingJournalId(null);
    }
    if (failure) Alert.alert(failure.title, failure.message);
  };

  // Back, for the on-screen arrows and Android hardware back alike. Returns false when the back
  // should leave the app (only Today), true when it was handled. (The add page's arrow and, with
  // the Add route on top, hardware back go through the route's `beforeRemove` guard instead.)
  const performBack = (): boolean => {
    if (current === null) return false;
    const target = backTarget({
      screen: current,
      entryDeleting: entryDeleting.current,
    });
    switch (target.to) {
      case 'exit':
        return false;
      case 'none':
        // The open entry is being deleted: Back is handled and does nothing.
        return true;
      case 'chain':
        // The add-entry page keeps its own rules (backFromAdd).
        backFromAdd();
        return true;
      default: {
        const _exhaustive: never = target;
        return _exhaustive;
      }
    }
  };

  // Android hardware back always calls the latest `performBack` (through the ref), so it never sees
  // stale screen, session or search state. It is registered only while the `Main` route is in focus
  // (so a Log with its search open underneath cannot grab back from Settings, Search or Add):
  // listeners run newest first and the container's, registered at its mount, would otherwise run
  // after this one. With another route up, the container's handler alone pops it (Add's
  // `beforeRemove` guard turns that into `backFromAdd`).
  const performBackRef = useRef(performBack);
  useEffect(() => {
    performBackRef.current = performBack;
  });
  useEffect(() => {
    if (addOpen || routeName !== 'Main') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => performBackRef.current());
    return () => sub.remove();
  }, [addOpen, routeName]);

  // Starts a new entry on the add-entry page from Today or a log; only the launch page is
  // `launchPage`.
  const startCapture = (id: JournalId) => {
    setLaunchPage(false);
    entry.startNew(id);
    openAdd();
  };

  // Reopens a stored draft on the add-entry page.
  const openDraft = (draft: Dream) => {
    entry.openDraft(draft);
    openAdd();
  };

  // Opens a stored entry on the add-entry page (the entry IS that page: there is no read-only
  // screen). A finished entry is an edit session (never saved as a draft); a stored draft stays a
  // draft. Back, save, discard and delete return to the screen underneath.
  const openEntryForEdit = (dream: Dream) => {
    if (dream.status === 'draft') {
      openDraft(dream);
      return;
    }
    setLaunchPage(false);
    entry.openEntry(dream);
    openAdd();
  };

  // The entry with this id as currently listed (hidden entries of a journal being deleted are
  // already filtered out); a stale id opens nothing.
  const openEntryById = (id: string) => {
    const dream = visibleRecords?.find((d) => d.id === id);
    if (dream) openEntryForEdit(dream);
  };

  // A stored record's date on the add-entry page; a new entry shows today.
  const entryDate = formatToday(
    entry.session?.createdAt ? new Date(entry.session.createdAt) : new Date(),
  );

  // Opening the drawer is off while a journal or an entry delete runs (the add flow is a different
  // screen, where Today and its drawer are not shown).
  const journalsLocked = deletingJournalId !== null || deletingDream !== null;
  return {
    current,
    screen,
    routeName,
    openSettings,
    openSearch,
    navigationRef,
    allowLeaveRef,
    allowLeave,
    resetAllowLeave,
    finishSystemLeave,
    syncAddOpen,
    setScreen,
    journals,
    journalFor,
    journalRegistry,
    entry,
    settings,
    transcription,
    library,
    dayMarker,
    todayKey,
    view,
    searchView,
    entryRecordingRef,
    entryLeaveRef,
    journalsOpen,
    setJournalsOpen,
    namingJournal,
    setNamingJournal,
    renamingJournal,
    renamingJournalId,
    setRenamingJournalId,
    deletingDream,
    deletingJournalId,
    live,
    visibleRecords,
    visibleJournals,
    knownTags,
    counts,
    setDrawerAfterLeave,
    entryDate,
    journalsLocked,
    showLog,
    saveEntryAndLeave,
    backFromAdd,
    deleteDreamFor,
    requestDeleteOpenEntry,
    canRenameJournal,
    requestRenameJournal,
    requestDeleteJournal,
    performBack,
    startCapture,
    openDraft,
    openEntryForEdit,
    openEntryById,
  };
}

export type AppFlow = ReturnType<typeof useAppFlowValue>;

const AppFlowContext = createContext<AppFlow | null>(null);

export function AppFlowProvider({ children }: { children: ReactNode }) {
  const value = useAppFlowValue();
  return <AppFlowContext.Provider value={value}>{children}</AppFlowContext.Provider>;
}

export function useAppFlow(): AppFlow {
  const flow = useContext(AppFlowContext);
  if (!flow) throw new Error('useAppFlow must be used inside AppFlowProvider');
  return flow;
}
