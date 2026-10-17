import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Keyboard, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDreamLibrary } from './src/hooks/useDreamLibrary';
import { useDayMarker } from './src/hooks/useDayMarker';
import {
  entryHasContent,
  entryHasEdits,
  hasPendingAudioRemoval,
  entryJournalLocked,
  useEntrySession,
} from './src/hooks/useEntrySession';
import { useJournals } from './src/hooks/useJournals';
import { useLogView } from './src/hooks/useLogView';
import { useSettings } from './src/hooks/useSettings';
import { useRecordingTranscription } from './src/hooks/useRecordingTranscription';
import { useToday } from './src/hooks/useToday';
import { AddEntryWithVoice } from './src/screens/AddEntryWithVoice';
import { DreamLogScreen } from './src/screens/DreamLogScreen';
import { NewJournalSheet } from './src/components/NewJournalSheet';
import { JournalsScreen } from './src/screens/JournalsScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import {
  getIndexStatus,
  isIndexUnreadableError,
  isSafetyCopyBlockedError,
  listDreams,
} from './src/services/dreamStorage';
import { hasAudio, type Dream } from './src/types/dream';
import { DREAMS_JOURNAL, type JournalId } from './src/types/entry';
import { colors } from './src/theme';
import { confirmDeleteDream, confirmDeleteJournal } from './src/utils/confirmDelete';
import { capitalizeFirst } from './src/utils/capitalizeFirst';
import { splitEmotions } from './src/utils/emotions';
import { formatToday } from './src/utils/format';
import { tagsByUse } from './src/utils/tags';
import {
  entriesFor,
  isBuiltInJournal,
  journalOrDefault,
  journalCopy,
  journalOf,
  kindOf,
  type Journal,
  type JournalCopy,
} from './src/utils/journals';
import { journalCounts } from './src/utils/journalSearch';
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
  type FlowReturn,
} from './src/utils/sessionNavigation';
import { dayStatus, launchScreen } from './src/utils/today';

type Screen = 'add' | 'log' | 'journals' | 'search' | 'today' | 'settings';

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

// Temporary screen switch; replace with real navigation once that is decided.
export default function App() {
  // null until the launch rule has decided (a blank view shows meanwhile).
  const [screen, setScreen] = useState<Screen | null>(null);
  // The journal whose log is open (or was last open): Dreams or Life.
  const [journalId, setJournalId] = useState<JournalId>(DREAMS_JOURNAL);
  // True for the add-entry page opened by the launch rule (Dreams, new): backing out of it while
  // it is empty counts as No dream.
  const [launchPage, setLaunchPage] = useState(false);
  // Where the add-entry page (new entries, drafts and stored entries) returns to after a save, a
  // discard or a leave: Today, the open journal's log, or the Search results.
  const [flowReturn, setFlowReturn] = useState<FlowReturn>('log');
  // The add-entry page's recorder: true while it starts or runs (readable synchronously), and the
  // page's discard confirmation for back to open.
  const entryRecordingRef = useRef(false);
  const entryLeaveRef = useRef<(() => void) | null>(null);
  // True while the "New journal" name sheet is open over Today or Journals home.
  const [namingJournal, setNamingJournal] = useState(false);
  // The custom journal whose name is being edited in the Rename sheet over Journals home. Never
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
  // The latest open log, for `showLog` to compare against.
  const nav = useRef({ journalId });
  useEffect(() => {
    nav.current = { journalId };
  });
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
      setFlowReturn('today');
    }
    setScreen(target);
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
      setFlowReturn('today');
      setScreen('add');
    }, LAUNCH_CAP_MS);
    return () => clearTimeout(timer);
  }, [screen, startEntry]);

  // Resume after a new day: `resumeNewDayToken` increases once each time the app returns to the
  // foreground on a different day than it left on (never on a foreground midnight rollover, and
  // not twice on the same new day). If nothing is done yet, jump to the launch Dreams page (when
  // auto-open is on and the user is not mid-flow).
  // Everything the resume rule reads, as of the latest render (never stale).
  const resumeInputs = useRef({
    screen,
    ready,
    dreams: library.dreams,
    noDreamDate: dayMarker.noDreamDate,
    autoOpen: settings.autoOpenDreamCapture,
    sessionOpen: entry.session !== null,
    deleteRunning: deletingDream !== null,
  });
  useEffect(() => {
    resumeInputs.current = {
      screen,
      ready,
      dreams: library.dreams,
      noDreamDate: dayMarker.noDreamDate,
      autoOpen: settings.autoOpenDreamCapture,
      sessionOpen: entry.session !== null,
      deleteRunning: deletingDream !== null,
    };
  });
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
    setFlowReturn('today');
    setScreen('add');
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

  // A screen showing the journal that is being deleted (its log, or one of its entries open on the
  // add-entry page) goes back to Journals home instead of showing something that no longer exists.
  const sessionId = entry.session?.id;
  if (
    deletingJournalId &&
    ((screen === 'log' && journalId === deletingJournalId) ||
      (screen === 'add' &&
        sessionId !== undefined &&
        library.dreams?.some((d) => d.id === sessionId && journalOf(d) === deletingJournalId)))
  ) {
    if (screen === 'add') entry.clear();
    setScreen('journals');
  }

  const current: Screen | null = screen;

  // The add page can leave its keyboard up; no other screen has an input to keep it for.
  const prevScreen = useRef(screen);
  useEffect(() => {
    if (prevScreen.current === 'add' && screen !== 'add') Keyboard.dismiss();
    prevScreen.current = screen;
  }, [screen]);

  // The name sheet belongs to Today and Journals home: leaving them (a new-day jump to the launch page) closes it.
  if (namingJournal && current !== 'today' && current !== 'journals') setNamingJournal(false);

  // The Rename sheet belongs to Journals home: leaving it closes the sheet. It also closes if its
  // journal is gone from the registry or is being deleted.
  const renamingJournal = renamingJournalId
    ? journalRegistry.custom.find((j) => j.id === renamingJournalId)
    : undefined;
  if (
    renamingJournalId &&
    (current !== 'journals' || !renamingJournal || deletingJournalId === renamingJournalId)
  ) {
    setRenamingJournalId(null);
  }

  // Each log shows only its own journal's entries (drafts included), whatever else is stored.
  const logEntries = useMemo(
    () => (visibleRecords ? entriesFor(visibleRecords, journalId) : null),
    [visibleRecords, journalId],
  );
  const counts = useMemo(
    () => (library.dreams ? journalCounts(journals, library.dreams) : null),
    [journals, library.dreams],
  );

  // Opens a journal's log. The log's filter, search and scroll belong to one journal at a time, so
  // they start fresh when the open log changes.
  const showLog = (id: JournalId) => {
    if (id !== nav.current.journalId) view.clearFilters();
    setJournalId(id);
    setScreen('log');
  };

  // No dream: in memory first, so Today shows it at once; the file write follows and a failed
  // write never blocks leaving. Used by Back on an empty launch page (and a discarded recording on it).
  const handleNoDream = () => {
    dayMarker.markNoDream(todayKey);
    setScreen('today');
  };

  // Where a flow ends: Today or the Search results (their view state is kept) when it started
  // there, otherwise the log of the entry's journal.
  const leaveFlow = (id: JournalId) => {
    if (flowReturn === 'today') setScreen('today');
    else if (flowReturn === 'search') setScreen('search');
    else showLog(id);
  };

  // After a save: Today or the log of the journal the entry belongs to.
  const leaveAfterSave = (id: JournalId) => {
    entry.clear();
    leaveFlow(id);
  };

  // The add-entry page's check: saves a finished entry, refreshes the library, then leaves. An
  // edit never saves a draft, and with no changes it writes nothing.
  const saveEntryAndLeave = async (status: 'draft' | 'saved') => {
    const current = entry.session;
    if (finishing.current || entryDeleting.current || !current) return;
    const isEdit = current.origin === 'edit';
    if (isEdit && status === 'draft') return;
    if (isEdit && !entryHasEdits(current)) {
      leaveAfterSave(current.journalId);
      return;
    }
    finishing.current = true;
    try {
      if (!(await entry.save(status))) return;
      await library.refresh();
      leaveAfterSave(current.journalId);
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
        leaveFlow(current.journalId);
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
      else leaveFlow(current.journalId);
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
        leaveFlow(journalOf(target));
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

  // Opens the Rename sheet for a custom journal (from its Journals home card only).
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
  // should leave the app (only Today), true when it was handled.
  const performBack = (): boolean => {
    if (current === null) return false;
    const target = backTarget({
      screen: current,
      journalId,
      searchOpen: view.searching,
      entryDeleting: entryDeleting.current,
    });
    switch (target.to) {
      case 'exit':
        return false;
      case 'closeSearch':
        // Same transition as leaving the search field: the log view state is kept.
        view.closeSearch();
        return true;
      case 'today':
        setScreen('today');
        return true;
      case 'journals':
        // Leaving Search starts it fresh next time.
        if (current === 'search') searchView.clearFilters();
        setScreen('journals');
        return true;
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

  // Android hardware back is registered once and always calls the latest `performBack` (through
  // the ref), so it never sees stale screen, session or search state.
  const performBackRef = useRef(performBack);
  useEffect(() => {
    performBackRef.current = performBack;
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => performBackRef.current());
    return () => sub.remove();
  }, []);

  const logJournal = journalFor(journalId);

  // Starts a new entry on the add-entry page from Today or a log; only the launch page is
  // `launchPage`.
  const startCapture = (id: JournalId, from: FlowReturn) => {
    setLaunchPage(false);
    setFlowReturn(from);
    entry.startNew(id);
    setScreen('add');
  };

  // Reopens a stored draft on the add-entry page.
  const openDraft = (draft: Dream, from: FlowReturn) => {
    entry.openDraft(draft);
    setFlowReturn(from);
    setScreen('add');
  };

  // Opens a stored entry on the add-entry page (the entry IS that page: there is no read-only
  // screen). A finished entry is an edit session (never saved as a draft); a stored draft stays a
  // draft. Back, save, discard and delete return to `from`.
  const openEntryForEdit = (dream: Dream, from: FlowReturn) => {
    if (dream.status === 'draft') {
      openDraft(dream, from);
      return;
    }
    setLaunchPage(false);
    entry.openEntry(dream);
    setFlowReturn(from);
    setScreen('add');
  };

  // The entry with this id as currently listed (hidden entries of a journal being deleted are
  // already filtered out); a stale id opens nothing.
  const openEntryById = (id: string, from: FlowReturn) => {
    const dream = visibleRecords?.find((d) => d.id === id);
    if (dream) openEntryForEdit(dream, from);
  };

  // A stored record's date on the add-entry page; a new entry shows today.
  const entryDate = formatToday(
    entry.session?.createdAt ? new Date(entry.session.createdAt) : new Date(),
  );

  if (current === null) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {current === 'add' && entry.session && (
          <AddEntryWithVoice
            journal={journalFor(entry.session.journalId)}
            journals={visibleJournals}
            onJournalChange={entry.setJournal}
            journalLocked={entryJournalLocked(entry.session)}
            title={entry.session.title}
            onTitleChange={entry.setTitle}
            body={entry.session.body}
            onBodyChange={entry.setBody}
            bodyBaseFrom={entry.session.materializedFrom}
            entryCreatedAt={entry.session.createdAt}
            knownTags={knownTags}
            date={entryDate}
            saving={entry.saving}
            autoFocus={entry.session.origin === 'new'}
            onSave={() => void saveEntryAndLeave('saved')}
            onBack={() => void performBack()}
            recordings={entry.session.recordings}
            transcription={transcription}
            onRecorded={entry.attachRecording}
            onRemoveRecording={entry.removeRecording}
            onRestoreRecording={entry.restoreRecording}
            onRecordingChange={(recording) => {
              entryRecordingRef.current = recording;
            }}
            leaveRef={entryLeaveRef}
            onRecordingDiscarded={backFromAdd}
            emotions={splitEmotions(entry.session.emotion).map(capitalizeFirst)}
            onDelete={entry.session.id ? requestDeleteOpenEntry : undefined}
            deleteDisabled={deletingDream !== null || deletingJournalId !== null}
          />
        )}
        {current === 'log' && (
          <DreamLogScreen
            journal={logJournal}
            onBack={() => void performBack()}
            dreams={logEntries}
            indexStatus={library.indexStatus}
            view={view}
            onOpenDream={(id) => openEntryById(id, 'log')}
            onOpenDraft={(draft) => openDraft(draft, 'log')}
            onNewDream={() => startCapture(journalId, 'log')}
            onDeleteDream={(d) => void deleteDreamFor(d)}
            deletingId={deletingDream?.id ?? null}
          />
        )}
        {current === 'journals' && (
          <JournalsScreen
            journals={journals}
            counts={counts}
            unreadable={library.indexStatus === 'unreadable'}
            onOpenJournal={showLog}
            onSearch={() => setScreen('search')}
            onBack={() => void performBack()}
            onDeleteJournal={requestDeleteJournal}
            onRenameJournal={requestRenameJournal}
            deletingId={deletingJournalId}
            onNewEntry={(id) => startCapture(id, 'today')}
            onNewJournal={() => {
              setRenamingJournalId(null);
              setNamingJournal(true);
            }}
            nameSheetOpen={namingJournal || renamingJournal !== undefined}
          />
        )}
        {current === 'today' && (
          <TodayScreen
            journals={visibleJournals}
            dreams={visibleRecords}
            todayKey={todayKey}
            skippedToday={dayMarker.noDreamDate === todayKey}
            unreadable={library.indexStatus === 'unreadable'}
            onOpenEntry={(d) => openEntryForEdit(d, 'today')}
            onOpenDraft={(draft) => openDraft(draft, 'today')}
            onDeleteDream={(d) => void deleteDreamFor(d)}
            deletingId={deletingDream?.id ?? null}
            onNewEntry={(id) => startCapture(id, 'today')}
            onNewJournal={() => {
              setRenamingJournalId(null);
              setNamingJournal(true);
            }}
            onOpenJournals={() => setScreen('journals')}
            onOpenSettings={() => setScreen('settings')}
          />
        )}
        {current === 'settings' && (
          <SettingsScreen
            autoOpenDreamCapture={settings.autoOpenDreamCapture}
            onChangeAutoOpenDreamCapture={settings.setAutoOpenDreamCapture}
            onlineTranscription={settings.onlineTranscription}
            onChangeOnlineTranscription={settings.setOnlineTranscription}
            onBack={() => void performBack()}
          />
        )}
        {current === 'search' && (
          <SearchScreen
            journals={visibleJournals}
            records={visibleRecords}
            indexStatus={library.indexStatus}
            view={searchView}
            onBack={() => void performBack()}
            onOpenDream={(id) => openEntryById(id, 'search')}
          />
        )}
        <NewJournalSheet
          visible={namingJournal && (current === 'today' || current === 'journals')}
          onClose={() => setNamingJournal(false)}
          existing={journals}
          onSubmit={async (name) => {
            // The journal is in the registry (saved) before its log opens, so nothing is ever
            // captured into an unknown journal. A failure rejects and the sheet stays open.
            const created = await journalRegistry.add(name);
            setNamingJournal(false);
            showLog(created.id);
          }}
        />
        <NewJournalSheet
          visible={renamingJournal !== undefined && current === 'journals'}
          onClose={() => setRenamingJournalId(null)}
          existing={journals}
          excludeId={renamingJournal?.id}
          initialName={renamingJournal?.name}
          title="Rename journal"
          submitLabel="Save"
          onSubmit={async (name) => {
            const id = renamingJournalId;
            // Checked again at submit time: the journal may have changed since the sheet opened.
            if (id === null || !canRenameJournal(id)) {
              setRenamingJournalId(null);
              return;
            }
            const stored = live.current.custom.find((j) => j.id === id);
            // Nothing changed: close without writing.
            if (!stored || name === stored.name) return;
            await journalRegistry.rename(id, name);
          }}
        />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
