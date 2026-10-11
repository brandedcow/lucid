import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDreamLibrary } from './src/hooks/useDreamLibrary';
import { useDayMarker } from './src/hooks/useDayMarker';
import { useDreamSession } from './src/hooks/useDreamSession';
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
import { useToday } from './src/hooks/useToday';
import { AddEntryWithVoice } from './src/screens/AddEntryWithVoice';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { DreamDetailScreen } from './src/screens/DreamDetailScreen';
import { DreamLogScreen } from './src/screens/DreamLogScreen';
import { NewJournalSheet } from './src/components/NewJournalSheet';
import { JournalsScreen } from './src/screens/JournalsScreen';
import { ReadItBackScreen } from './src/screens/ReadItBackScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import {
  discardRecording,
  getIndexStatus,
  isIndexUnreadableError,
  isSafetyCopyBlockedError,
  listDreams,
} from './src/services/dreamStorage';
import { hasAudio, type Dream } from './src/types/dream';
import { DREAMS_JOURNAL, type JournalId } from './src/types/entry';
import { colors } from './src/theme';
import { confirmDeleteJournal } from './src/utils/confirmDelete';
import { formatToday } from './src/utils/format';
import {
  entriesFor,
  isBuiltInJournal,
  journalOrDefault,
  journalCopy,
  journalOf,
  kindOf,
  titleRequired,
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
  hasEdits,
  type FlowReturn,
  readItBackBack,
  reviewBack,
} from './src/utils/sessionNavigation';
import { dayStatus, launchScreen } from './src/utils/today';

type Screen =
  | 'capture'
  | 'add'
  | 'readItBack'
  | 'review'
  | 'log'
  | 'detail'
  | 'journals'
  | 'search'
  | 'today'
  | 'settings';

/** Where the entry screen was opened from, and so where its Back and a delete return to. */
type DetailFrom = 'log' | 'search' | 'today';

// How long the launch waits for stored data before opening Dream capture anyway: speed on waking
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
  // The journal a new entry is being captured for (Dreams from launch and the Dream log).
  const [captureJournal, setCaptureJournal] = useState<JournalId>(DREAMS_JOURNAL);
  // True for the capture opened by the launch rule: it offers "No dream", and leaving it counts
  // as No dream.
  const [captureLaunch, setCaptureLaunch] = useState(false);
  // Where a capture (and a draft opened for Read it back and Review) returns to after a save.
  const [flowReturn, setFlowReturn] = useState<FlowReturn>('log');
  // True while the capture is recording, so Back asks to discard instead of leaving mid-recording.
  const [captureBusy, setCaptureBusy] = useState(false);
  // Set by CaptureScreen to its discard confirmation, so Android back can ask while recording.
  const captureLeaveRef = useRef<(() => void) | null>(null);
  // The add-entry page's recorder: true while it starts or runs (readable synchronously), and the
  // page's discard confirmation for back to open.
  const entryRecordingRef = useRef(false);
  const entryLeaveRef = useRef<(() => void) | null>(null);
  // Where the open entry came from: a journal log or the Search results.
  const [detailFrom, setDetailFrom] = useState<DetailFrom>('log');
  // True only while Read it back was opened with Edit on Review, so its back arrow returns there.
  const [fromReview, setFromReview] = useState(false);
  // The finished dream shown on the detail screen.
  const [detailId, setDetailId] = useState<string | null>(null);
  // True while the "New journal" name sheet is open over Today or Journals home.
  const [namingJournal, setNamingJournal] = useState(false);
  // The custom journal whose name is being edited in the Rename sheet over Journals home. Never
  // open together with the "New journal" sheet.
  const [renamingJournalId, setRenamingJournalId] = useState<JournalId | null>(null);
  // The journal registry: the built-in journals, then the user's own.
  const journalRegistry = useJournals();
  const { journals } = journalRegistry;
  const journalFor = (id: JournalId): Journal => journalOrDefault(journals, id);
  const dream = useDreamSession(journals);
  const { session } = dream;
  // The entry on the add-entry page (typed entries, drafts and edits); `dream` is the old flow.
  const entry = useEntrySession(journals);
  const library = useDreamLibrary();
  const dayMarker = useDayMarker();
  const settings = useSettings();
  const { todayKey, resumeNewDayToken } = useToday();
  // Created here so the filter, search and scroll position survive leaving the Dream log.
  const view = useLogView();
  // Search across journals keeps its own query, tags and scroll while an entry is open.
  const searchView = useLogView();
  // True from the start of a save until its refresh finishes, so a second tap or back cannot race it.
  const finishing = useRef(false);
  // The dream being deleted, held from the confirmed delete until it ends, and whether the delete
  // was started from its entry. `library.remove` drops the dream from the list at once, and an
  // entry's delete must not make the entry vanish while it is in flight. A delete started from the
  // Dream log (`fromDetail` false) never touches the entry screen.
  const [deletingDream, setDeletingDream] = useState<{ dream: Dream; fromDetail: boolean } | null>(
    null,
  );
  // The custom journal being deleted (state, for the UI), from the confirmed delete until it ends.
  // Its entries are hidden everywhere but the Journals card count; nothing stored is changed.
  const [deletingJournalId, setDeletingJournalId] = useState<JournalId | null>(null);
  // True while the "Delete this journal?" dialog is up, so a second swipe cannot stack another.
  const journalDialogOpen = useRef(false);
  // True while a journal delete runs, readable synchronously (rename is refused then).
  const deletingJournalRef = useRef(false);
  // True while any delete (an entry's or a journal's) runs, readable synchronously: a second delete
  // is ignored.
  const deleting = useRef(false);
  // True while a delete started from the entry runs: blocks back and Edit there. A delete started
  // from the Dream log blocks nothing, like Notes.
  const detailDeleting = useRef(false);
  // The latest screen and open entry, for the async delete to read after its await.
  const nav = useRef({ screen, detailId, detailFrom, journalId });
  useEffect(() => {
    nav.current = { screen, detailId, detailFrom, journalId };
  });
  // The latest stored records and journals, for a journal delete confirmed after a dialog.
  const live = useRef({
    records: library.dreams,
    indexStatus: library.indexStatus,
    custom: journalRegistry.custom,
    sessionJournal: session?.journalId ?? entry.session?.journalId ?? null,
  });
  useEffect(() => {
    live.current = {
      records: library.dreams,
      indexStatus: library.indexStatus,
      custom: journalRegistry.custom,
      sessionJournal: session?.journalId ?? entry.session?.journalId ?? null,
    };
  });

  // Launch: once the library, the No dream marker, the settings and the journals are read, the launch rule picks
  // Dream capture or Today. If they are not ready in time, Dream capture opens and the late data
  // never moves the user.
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
    if (target === 'capture') {
      setCaptureLaunch(true);
      setFlowReturn('today');
    }
    setScreen(target);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [ready, library.dreams, dayMarker.noDreamDate, todayKey, settings.autoOpenDreamCapture]);
  useEffect(() => {
    if (screen !== null) return;
    const timer = setTimeout(() => {
      if (launchResolved.current) return;
      launchResolved.current = true;
      setCaptureJournal(DREAMS_JOURNAL);
      setCaptureLaunch(true);
      setFlowReturn('today');
      setScreen('capture');
    }, LAUNCH_CAP_MS);
    return () => clearTimeout(timer);
  }, [screen]);

  // Resume after a new day: `resumeNewDayToken` increases once each time the app returns to the
  // foreground on a different day than it left on (never on a foreground midnight rollover, and
  // not twice on the same new day). If nothing is done yet, jump to the launch Dream capture (when
  // auto-open is on and the user is not mid-flow).
  // Everything the resume rule reads, as of the latest render (never stale).
  const resumeInputs = useRef({
    screen,
    ready,
    dreams: library.dreams,
    noDreamDate: dayMarker.noDreamDate,
    autoOpen: settings.autoOpenDreamCapture,
    sessionOpen: session !== null || entry.session !== null,
    deleteRunning: deletingDream !== null,
  });
  useEffect(() => {
    resumeInputs.current = {
      screen,
      ready,
      dreams: library.dreams,
      noDreamDate: dayMarker.noDreamDate,
      autoOpen: settings.autoOpenDreamCapture,
      sessionOpen: session !== null || entry.session !== null,
      deleteRunning: deletingDream !== null,
    };
  });
  useEffect(() => {
    if (resumeNewDayToken === 0) return;
    const r = resumeInputs.current;
    // Not launched yet (the launch rule decides), data not loaded, or the user is mid-flow.
    if (r.screen === null || !r.ready || r.dreams === null) return;
    if (r.sessionOpen || r.deleteRunning || deleting.current) return;
    if (
      r.screen === 'capture' ||
      r.screen === 'add' ||
      r.screen === 'readItBack' ||
      r.screen === 'review'
    )
      return;
    const status = dayStatus(r.dreams, r.noDreamDate, todayKey);
    if (launchScreen({ ...status, autoOpen: r.autoOpen }) !== 'capture') return;
    setCaptureJournal(DREAMS_JOURNAL);
    setCaptureLaunch(true);
    setFlowReturn('today');
    setFromReview(false);
    setScreen('capture');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on the token only; the rest is read fresh
  }, [resumeNewDayToken]);

  const detailDeletingDream = deletingDream?.fromDetail ? deletingDream.dream : null;

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
  const visibleJournals = useMemo(
    () => (deletingJournalId ? journals.filter((j) => j.id !== deletingJournalId) : journals),
    [journals, deletingJournalId],
  );

  // A screen showing the journal that is being deleted (its log, or one of its entries) goes back
  // to Journals home instead of showing something that no longer exists.
  if (
    deletingJournalId &&
    ((screen === 'log' && journalId === deletingJournalId) ||
      (screen === 'detail' &&
        detailId !== null &&
        library.dreams?.some((d) => d.id === detailId && journalOf(d) === deletingJournalId)))
  ) {
    setDetailId(null);
    setScreen('journals');
  }

  // The detail screen needs a finished dream; otherwise the log shows.
  const detailDream =
    (detailId ? visibleRecords?.find((d) => d.id === detailId) : undefined) ??
    (detailDeletingDream && detailDeletingDream.id === detailId ? detailDeletingDream : undefined);
  const current: Screen | null =
    screen === 'detail' && (!detailDream || detailDream.status === 'draft')
      ? detailFrom === 'search'
        ? 'search'
        : detailFrom === 'today'
          ? 'today'
          : 'log'
      : screen;

  // The name sheet belongs to Today and Journals home: leaving them (a new-day jump to capture) closes it.
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

  const leaveToCapture = () => {
    if (session) setCaptureJournal(session.journalId);
    dream.clear();
    setFromReview(false);
    setScreen('capture');
  };

  // No dream: in memory first, so Today shows it at once; the file write follows and a failed
  // write never blocks leaving. Shared by the No dream button, Back on an idle launch capture and
  // a discarded recording on it.
  const handleNoDream = () => {
    dayMarker.markNoDream(todayKey);
    setCaptureBusy(false);
    setScreen('today');
  };

  const confirmDiscard = () => {
    const copy = journalCopy(journalFor(session?.journalId ?? DREAMS_JOURNAL));
    Alert.alert(copy.discardTitle, copy.discardBody, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          // Only the cache file of a new recording; anything in dreams/ is never touched here.
          if (session?.audio && !session.audio.persisted) discardRecording(session.audio.uri);
          leaveToCapture();
        },
      },
    ]);
  };

  const backFromReadItBack = () => {
    if (!session) return;
    const target = readItBackBack(session, fromReview);
    if (target === 'review') {
      setFromReview(false);
      setScreen('review');
    } else if (target === 'confirmDiscard') confirmDiscard();
    else if (target === 'capture') leaveToCapture();
    else {
      dream.clear();
      leaveFlow(session.journalId);
    }
  };

  // Where a flow ends: Today when it started there, otherwise the log of the entry's journal.
  const leaveFlow = (id: JournalId) => {
    if (flowReturn === 'today') setScreen('today');
    else showLog(id);
  };

  // After a save: Today or the log of the journal the entry belongs to.
  const leaveAfterSave = (id: JournalId) => {
    dream.clear();
    entry.clear();
    setFromReview(false);
    leaveFlow(id);
  };

  const showDetail = (id: string | null) => {
    dream.clear();
    entry.clear();
    setFromReview(false);
    setDetailId(id);
    setScreen('detail');
  };

  // Saves, then refreshes the library, and only then leaves, so the log and detail never show
  // stale data. On a failed save the Alert is shown and the session stays. An edit never saves
  // a draft, and with no changes it writes nothing.
  const saveAndLeave = async (status: 'draft' | 'saved') => {
    if (finishing.current || !session) return;
    const isEdit = session.origin === 'edit';
    // Only a journal that requires titles blocks an untitled edit; an untitled Life entry saves.
    const needsTitle = titleRequired(kindOf(journals, session.journalId));
    if (isEdit && (status === 'draft' || (needsTitle && session.title.trim().length === 0))) return;
    const id = session.id ?? detailId;
    if (isEdit && !hasEdits(session)) {
      showDetail(id);
      return;
    }
    finishing.current = true;
    try {
      if (!(await dream.save(status))) return;
      await library.refresh();
      if (isEdit) showDetail(id);
      else leaveAfterSave(session.journalId);
    } finally {
      finishing.current = false;
    }
  };

  // The add-entry page's check: saves a finished entry, refreshes the library, then leaves. An
  // edit never saves a draft, and with no changes it writes nothing.
  const saveEntryAndLeave = async (status: 'draft' | 'saved') => {
    const current = entry.session;
    if (finishing.current || !current) return;
    const isEdit = current.origin === 'edit';
    if (isEdit && status === 'draft') return;
    const id = current.id ?? detailId;
    if (isEdit && !entryHasEdits(current)) {
      showDetail(id);
      return;
    }
    finishing.current = true;
    try {
      if (!(await entry.save(status))) return;
      await library.refresh();
      if (isEdit) showDetail(id);
      else leaveAfterSave(current.journalId);
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
    // A running recording always asks first. Discard stops it, deletes its cache file and comes
    // back here, so what else is on the page gets its usual prompt.
    if (entryRecordingRef.current) {
      entryLeaveRef.current?.();
      return;
    }
    if (current.origin === 'edit') {
      const id = current.id ?? detailId;
      if (!entryHasEdits(current)) {
        showDetail(id);
        return;
      }
      Alert.alert(
        DISCARD_CHANGES_TITLE,
        discardChangesMessage(kindOf(journals, current.journalId)),
        [
          { text: DISCARD_CHANGES_KEEP, style: 'cancel' },
          { text: DISCARD_CHANGES_DISCARD, style: 'destructive', onPress: () => showDetail(id) },
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
      leave(current.origin === 'new' && captureLaunch && current.journalId === DREAMS_JOURNAL);
      return;
    }
    Alert.alert(LEAVE_ENTRY_TITLE, LEAVE_ENTRY_MESSAGE, [
      { text: LEAVE_ENTRY_SAVE_DRAFT, onPress: () => void saveEntryAndLeave('draft') },
      { text: LEAVE_ENTRY_DISCARD, style: 'destructive', onPress: () => leave(false) },
      { text: LEAVE_ENTRY_KEEP, style: 'cancel' },
    ]);
  };

  // Deletes from the entry or from a Dream log row (the caller has already confirmed). Leaves for
  // the log only if the entry of that same dream is open when the delete ends.
  const deleteDreamFor = async (target: Dream) => {
    if (deleting.current) return;
    const fromDetail = nav.current.screen === 'detail' && nav.current.detailId === target.id;
    deleting.current = true;
    detailDeleting.current = fromDetail;
    setDeletingDream({ dream: target, fromDetail });
    try {
      await library.remove(target.id);
      if (nav.current.screen === 'detail' && nav.current.detailId === target.id) {
        // The log or search keeps its filter, search and scroll: only the entry is left.
        setDetailId(null);
        if (nav.current.detailFrom === 'search') setScreen('search');
        else if (nav.current.detailFrom === 'today') setScreen('today');
        else showLog(journalOf(target));
      }
    } catch (e) {
      const copy = journalCopy(journalFor(journalOf(target)));
      Alert.alert(copy.deleteFailureTitle, deleteFailureMessage(e, copy));
    } finally {
      deleting.current = false;
      detailDeleting.current = false;
      setDeletingDream(null);
    }
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

  const backFromEdit = () => {
    if (!session) return;
    const id = session.id ?? detailId;
    if (!hasEdits(session)) {
      showDetail(id);
      return;
    }
    Alert.alert(DISCARD_CHANGES_TITLE, discardChangesMessage(kindOf(journals, session.journalId)), [
      { text: DISCARD_CHANGES_KEEP, style: 'cancel' },
      { text: DISCARD_CHANGES_DISCARD, style: 'destructive', onPress: () => showDetail(id) },
    ]);
  };

  const backFromReview = () => {
    if (!session || finishing.current) return;
    const result = reviewBack(session, dream.isSaving());
    switch (result) {
      case 'blocked':
        break;
      case 'draftToList':
        void saveAndLeave('draft');
        break;
      case 'readItBack':
        setFromReview(false);
        setScreen('readItBack');
        break;
      case 'editBack':
        backFromEdit();
        break;
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  };

  // A reopened draft or edited dream shows when it was first stored; a new dream shows today.
  const dreamDate = formatToday(session?.createdAt ? new Date(session.createdAt) : new Date());

  // Back, for the on-screen arrows and Android hardware back alike. Returns false when the back
  // should leave the app (the launch capture and Today), true when it was handled.
  const performBack = (): boolean => {
    if (current === null) return false;
    const target = backTarget({
      screen: current,
      journalId:
        current === 'capture'
          ? captureJournal
          : current === 'detail' && detailDream
            ? journalOf(detailDream)
            : journalId,
      searchOpen: view.searching,
      captureBusy,
      detailFrom,
      detailDeleting: detailDeleting.current,
      flowReturn,
      captureLaunch,
    });
    switch (target.to) {
      case 'exit':
        return false;
      case 'none':
        return true;
      case 'noDream':
        handleNoDream();
        return true;
      case 'confirmLeave':
        // Android back only asks while a recording runs (captureBusy); App leaves via onLeave.
        captureLeaveRef.current?.();
        return true;
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
      case 'search':
        setScreen('search');
        return true;
      case 'log':
        showLog(target.journalId);
        return true;
      case 'chain':
        if (current === 'add') {
          backFromAdd();
          return true;
        }
        if (!session) return false;
        if (current === 'readItBack') backFromReadItBack();
        else backFromReview();
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

  // After CaptureScreen discarded a recording to leave: the launch capture counts as No dream,
  // any other capture returns to its Today or log with no marker. Not performBack: captureBusy is
  // still true then and it would ask again. Does nothing if the screen has already changed.
  const leaveCapture = () => {
    if (nav.current.screen !== 'capture') return;
    setCaptureBusy(false);
    const target = backTarget({
      screen: 'capture',
      journalId: captureJournal,
      captureBusy: false,
      flowReturn,
      captureLaunch,
    });
    if (target.to === 'noDream') handleNoDream();
    else if (target.to === 'today') setScreen('today');
    else if (target.to === 'log') showLog(target.journalId);
  };

  const captureJournalInfo = journalFor(captureJournal);
  const logJournal = journalFor(journalId);

  // Starts a new typed entry on the add-entry page from Today or a log (voice entry comes back
  // later); only the launch capture is `captureLaunch`.
  const startCapture = (id: JournalId, from: FlowReturn) => {
    setCaptureJournal(id);
    setCaptureLaunch(false);
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
        {current === 'capture' && (
          <CaptureScreen
            journal={captureJournalInfo}
            onBack={() => void performBack()}
            onLeave={leaveCapture}
            leaveRef={captureLeaveRef}
            backLabel={
              captureLaunch && captureJournal === DREAMS_JOURNAL ? 'No dream, go to Today' : 'Back'
            }
            onActiveChange={setCaptureBusy}
            onRecorded={(recording, text) => {
              dream.startFromRecording(recording, text, captureJournal);
              setFromReview(false);
              setScreen('readItBack');
            }}
            onWrite={() => {
              entry.startNew(captureJournal);
              setScreen('add');
            }}
            onTypeInstead={(text) => {
              entry.startNew(captureJournal, text);
              setScreen('add');
            }}
            onNoDream={
              captureLaunch && captureJournal === DREAMS_JOURNAL ? handleNoDream : undefined
            }
          />
        )}
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
            tags={entry.session.tags}
            onTagsChange={entry.setTags}
            tagDraft={entry.session.tagDraft}
            onTagDraftChange={entry.setTagDraft}
            date={entryDate}
            saving={entry.saving}
            autoFocus={entry.session.origin === 'new'}
            onSave={() => void saveEntryAndLeave('saved')}
            onBack={() => void performBack()}
            audio={entry.session.audio}
            onRecorded={entry.attachRecording}
            onRemoveAudio={entry.removeAudio}
            onRestoreAudio={entry.restoreAudio}
            onRecordingChange={(recording) => {
              entryRecordingRef.current = recording;
            }}
            leaveRef={entryLeaveRef}
            onRecordingDiscarded={backFromAdd}
          />
        )}
        {current === 'readItBack' && session && (
          <ReadItBackScreen
            journal={journalFor(session.journalId)}
            text={session.transcript}
            onChangeText={dream.setTranscript}
            audio={session.audio}
            autoFocus={session.origin === 'write'}
            onContinue={() => {
              dream.markPassedThroughReadItBack();
              setFromReview(false);
              setScreen('review');
            }}
            onBack={backFromReadItBack}
            date={dreamDate}
          />
        )}
        {current === 'review' && session && (
          <ReviewScreen
            journal={journalFor(session.journalId)}
            transcript={session.transcript}
            audio={session.audio}
            durationMs={session.audio?.durationMs ?? 0}
            title={session.title}
            onTitleChange={dream.setTitle}
            emotion={session.emotion}
            onEmotionChange={dream.setEmotion}
            emotionDraft={session.emotionDraft}
            onEmotionDraftChange={dream.setEmotionDraft}
            tags={session.tags}
            onTagsChange={dream.setTags}
            tagDraft={session.tagDraft}
            onTagDraftChange={dream.setTagDraft}
            saving={dream.saving}
            date={dreamDate}
            onEditTranscript={() => {
              setFromReview(true);
              setScreen('readItBack');
            }}
            onDone={() => void saveAndLeave('saved')}
            showFinishLater={session.origin !== 'edit'}
            onFinishLater={() => void saveAndLeave('draft')}
            onBack={backFromReview}
          />
        )}
        {current === 'log' && (
          <DreamLogScreen
            journal={logJournal}
            onBack={() => void performBack()}
            dreams={logEntries}
            indexStatus={library.indexStatus}
            view={view}
            onOpenDream={(id) => {
              setDetailId(id);
              setDetailFrom('log');
              setScreen('detail');
            }}
            onOpenDraft={(draft) => openDraft(draft, 'log')}
            onNewDream={() => startCapture(journalId, 'log')}
            onDeleteDream={(d) => void deleteDreamFor(d)}
            deletingId={deletingDream?.dream.id ?? null}
          />
        )}
        {current === 'detail' && detailDream && (
          <DreamDetailScreen
            dream={detailDream}
            journal={journalFor(journalOf(detailDream))}
            onBack={() => void performBack()}
            onEdit={() => {
              if (detailDeleting.current) return;
              entry.openEntry(detailDream);
              setScreen('add');
            }}
            onDelete={async () => {
              if (deleting.current) throw new Error('delete in progress');
              await deleteDreamFor(detailDream);
            }}
            deleteBlocked={deletingDream !== null}
            deleting={detailDeletingDream !== null && detailDeletingDream.id === detailDream.id}
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
            onOpenEntry={(d) => {
              setDetailId(d.id);
              setDetailFrom('today');
              setScreen('detail');
            }}
            onOpenDraft={(draft) => openDraft(draft, 'today')}
            onDeleteDream={(d) => void deleteDreamFor(d)}
            deletingId={deletingDream?.dream.id ?? null}
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
            onOpenDream={(id) => {
              setDetailId(id);
              setDetailFrom('search');
              setScreen('detail');
            }}
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
