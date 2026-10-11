import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  discardRecording,
  isIndexUnreadableError,
  recordingUri,
  saveDream,
} from '../services/dreamStorage';
import { Dream, recordingsOf } from '../types/dream';
import { DREAMS_JOURNAL, JournalId } from '../types/entry';
import {
  BUILT_IN_JOURNALS,
  Journal,
  journalOf,
  kindCopy,
  kindOf,
  titleRequired,
} from '../utils/journals';
import { inlineTags, materializeTags } from '../utils/inlineTags';
import { sanitizeWaveform } from '../utils/waveform';

/**
 * One voice recording attached to an entry on the page. `id` is a stable local id (it survives a
 * save, so undo steps can name the recording). `persisted` false is a new recording still in the
 * cache; true is a stored one (`fileName` is its name inside the dreams directory). `removed` is the
 * session's mark that the user closed the card: nothing is deleted or forgotten when it is set, so
 * it can be undone.
 */
export type SessionRecording = {
  id: string;
  uri: string;
  /** Stored file name; set when `persisted`. */
  fileName?: string;
  persisted: boolean;
  removed: boolean;
  durationMs: number;
  /** Loudness peaks (0..1) for the card; absent on old entries. */
  waveform?: number[];
};

let recordingCounter = 0;
/** A fresh local id for a recording made on the page. */
export function newRecordingId(): string {
  recordingCounter += 1;
  return `new-${recordingCounter}`;
}

/**
 * The entry being written or edited on the add-entry page, kept above the screen: one page, a
 * title and a body, with an optional voice recording.
 */
export type EntrySession = {
  /** 'new' starts empty, 'draft' reopens a stored draft, 'edit' reopens a finished entry. */
  origin: 'new' | 'draft' | 'edit';
  /** The journal this entry belongs to (a reopened record's comes from `journalOf`). */
  journalId: JournalId;
  /** Set when a stored draft or finished entry is reopened, or once a save created one. */
  id?: string;
  createdAt?: string;
  /**
   * The voice recordings, in order: a reopened entry's stored ones first, then new ones from the
   * page's mic (cache files), appended. No cap. A closed one stays here, marked `removed`.
   */
  recordings: SessionRecording[];
  title: string;
  /** Stored as the entry's `transcript`. Tags are `#tag` words inside it. */
  body: string;
  /**
   * Set when opening added the entry's stored tags to the body as a trailing `#tag` line: the body
   * as stored, so the page can seed that addition as one undo step.
   */
  materializedFrom?: string;
  /** Not on the page; kept so editing never clears a stored emotion. */
  emotion: string;
  /**
   * Only for origin 'edit': the values when opened (the body after tags were added to it), to tell
   * whether anything changed.
   */
  baseline?: { title: string; body: string };
};

export type EntrySessionAction =
  | { type: 'startNew'; journalId?: JournalId; body?: string }
  | { type: 'open'; session: EntrySession }
  | { type: 'setJournal'; journalId: JournalId }
  | { type: 'setTitle'; value: string }
  | { type: 'setBody'; value: string }
  | {
      type: 'attachRecording';
      id: string;
      recording: { uri: string; durationMs: number; waveform?: number[] };
    }
  | { type: 'removeRecording'; id: string }
  | { type: 'restoreRecording'; id: string }
  | {
      type: 'markSaved';
      id: string;
      createdAt: string;
      /** The saved entry's recordings, in order (from `recordingsOf`), with their playable URIs. */
      stored?: { uri: string; fileName: string }[];
    }
  | { type: 'clear' };

/** State is null when no entry is open on the page. */
export function entrySessionReducer(
  state: EntrySession | null,
  action: EntrySessionAction,
): EntrySession | null {
  switch (action.type) {
    case 'startNew':
      return {
        origin: 'new',
        journalId: action.journalId ?? DREAMS_JOURNAL,
        recordings: [],
        title: '',
        body: action.body ?? '',
        emotion: '',
      };
    case 'open':
      return action.session;
    case 'clear':
      return null;
    default:
      break;
  }
  if (!state) return state;
  switch (action.type) {
    case 'setJournal':
      // Only a new entry that has never been saved may change journal; a saved entry or a
      // reopened draft stays where it is.
      return entryJournalLocked(state) ? state : { ...state, journalId: action.journalId };
    case 'setTitle':
      return { ...state, title: action.value };
    case 'setBody':
      return { ...state, body: action.value };
    case 'attachRecording': {
      // Appended: no cap, and recording again never replaces an earlier one.
      const next: SessionRecording = {
        id: action.id,
        uri: action.recording.uri,
        durationMs: action.recording.durationMs,
        ...(sanitizeWaveform(action.recording.waveform)
          ? { waveform: action.recording.waveform }
          : {}),
        persisted: false,
        removed: false,
      };
      return { ...state, recordings: [...state.recordings, next] };
    }
    case 'removeRecording':
    case 'restoreRecording': {
      // Closing only marks the recording; nothing is deleted here. A stored recording's file goes
      // only when the user saves (saveDream's removeRecordings, CLAUDE.md deletion case 5).
      const removed = action.type === 'removeRecording';
      const target = state.recordings.find((r) => r.id === action.id);
      if (!target || target.removed === removed) return state;
      return {
        ...state,
        recordings: state.recordings.map((r) => (r.id === action.id ? { ...r, removed } : r)),
      };
    }
    case 'markSaved': {
      // The entry now exists: a second save updates it. Closed recordings are gone (stored ones
      // were removed by the save, new ones never saved). The rest line up, in order, with the
      // saved entry's recordings (kept ones first, then the added ones) and are now stored.
      const stored = action.stored ?? [];
      const survivors = state.recordings.filter((r) => !r.removed);
      const recordings: SessionRecording[] = [];
      survivors.forEach((r, i) => {
        const saved = stored[i];
        if (!saved) return;
        recordings.push({ ...r, uri: saved.uri, fileName: saved.fileName, persisted: true });
      });
      return { ...state, id: action.id, createdAt: action.createdAt, recordings };
    }
    default:
      return state;
  }
}

/**
 * True when the entry's journal can no longer change: it is a reopened draft or finished entry, or
 * a save already created it. Only a new entry that was never saved may switch journals.
 */
export function entryJournalLocked(session: EntrySession): boolean {
  return session.origin !== 'new' || session.id !== undefined;
}

/** Builds the session for a stored entry: a reopened draft, or a finished entry being edited. */
export function entrySessionFromDream(dream: Dream, origin: 'draft' | 'edit'): EntrySession {
  // Stored entries can predate the tags field. Tags live inside the body now: any the body lacks
  // are added as a trailing line.
  const tags = Array.isArray(dream.tags) ? dream.tags : [];
  const stored = dream.transcript ?? '';
  const body = materializeTags(stored, tags);
  const recordings: SessionRecording[] = recordingsOf(dream).map((r) => ({
    id: `stored:${r.fileName}`,
    uri: recordingUri(r),
    fileName: r.fileName,
    durationMs: r.durationMs,
    ...(r.waveform ? { waveform: r.waveform } : {}),
    persisted: true,
    removed: false,
  }));
  const session: EntrySession = {
    origin,
    journalId: journalOf(dream),
    id: dream.id,
    createdAt: dream.createdAt,
    recordings,
    title: dream.title,
    body,
    ...(body !== stored ? { materializedFrom: stored } : {}),
    emotion: dream.emotion ?? '',
  };
  if (origin === 'edit') {
    session.baseline = { title: session.title, body: session.body };
  }
  return session;
}

/** The recordings the user can see: those that have not been closed. */
export function visibleRecordings(session: EntrySession): SessionRecording[] {
  return session.recordings.filter((r) => !r.removed);
}

/** The stored file names of stored recordings the user closed and has not saved yet. */
export function pendingRemovals(session: EntrySession): string[] {
  const names: string[] = [];
  for (const r of session.recordings) {
    if (r.persisted && r.removed && r.fileName) names.push(r.fileName);
  }
  return names;
}

/**
 * True when the user closed a STORED recording and has not saved yet. The save then passes
 * `removeRecordings`; leaving without saving forgets the mark and deletes nothing.
 */
export function hasPendingAudioRemoval(session: EntrySession): boolean {
  return pendingRemovals(session).length > 0;
}

/** True when the page holds anything the user typed or recorded: a title, body text (tags included) or a recording. */
export function entryHasContent(session: EntrySession): boolean {
  return (
    visibleRecordings(session).length > 0 ||
    session.title.trim().length > 0 ||
    session.body.trim().length > 0
  );
}

/**
 * True when an 'edit' session differs from the entry as opened: title and body (trimmed, case
 * kept; tags are part of the body), a stored recording closed, or a recording added. False when
 * there is no baseline.
 */
export function entryHasEdits(session: EntrySession): boolean {
  const { baseline } = session;
  if (!baseline) return false;
  if (hasPendingAudioRemoval(session)) return true;
  if (visibleRecordings(session).some((r) => !r.persisted)) return true;
  return (
    session.title.trim() !== baseline.title.trim() || session.body.trim() !== baseline.body.trim()
  );
}

/** Every recording of the session that was never saved (closed ones included). */
function unsavedRecordings(session: EntrySession | null): SessionRecording[] {
  return session ? session.recordings.filter((r) => !r.persisted) : [];
}

/** Deletes cache files of unsaved recordings. Only `persisted: false` recordings ever get here. */
function deleteUnsavedRecordings(recordings: SessionRecording[]) {
  for (const r of recordings) {
    try {
      discardRecording(r.uri);
    } catch {
      // A leftover cache file is harmless.
    }
  }
}

export type EntrySaveStatus = 'draft' | 'saved';

/** `journals` is the registry, used only to tell a session's kind when it is saved. */
export function useEntrySession(journals: readonly Journal[] = BUILT_IN_JOURNALS) {
  const [session, dispatch] = useReducer(entrySessionReducer, null);
  const [saving, setSaving] = useState(false);
  // The ref is the real guard: two taps in the same frame both see the same stale `saving` state.
  const savingRef = useRef(false);
  const sessionRef = useRef<EntrySession | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const journalsRef = useRef(journals);
  useEffect(() => {
    journalsRef.current = journals;
  }, [journals]);

  const actions = useMemo(
    () => ({
      startNew: (journalId?: JournalId, body?: string) =>
        dispatch({ type: 'startNew', journalId, body }),
      openDraft: (dream: Dream) =>
        dispatch({ type: 'open', session: entrySessionFromDream(dream, 'draft') }),
      openEntry: (dream: Dream) =>
        dispatch({ type: 'open', session: entrySessionFromDream(dream, 'edit') }),
      setJournal: (journalId: JournalId) => dispatch({ type: 'setJournal', journalId }),
      setTitle: (value: string) => dispatch({ type: 'setTitle', value }),
      setBody: (value: string) => dispatch({ type: 'setBody', value }),
      attachRecording: (recording: { uri: string; durationMs: number; waveform?: number[] }) =>
        dispatch({ type: 'attachRecording', id: newRecordingId(), recording }),
      removeRecording: (id: string) => dispatch({ type: 'removeRecording', id }),
      restoreRecording: (id: string) => dispatch({ type: 'restoreRecording', id }),
      /**
       * Closes the entry. Deletes the cache files of recordings that were never saved, closed ones
       * included (case 3 in CLAUDE.md); a stored recording is never touched. Call it only when the recorder has
       * stopped.
       */
      clear: () => {
        deleteUnsavedRecordings(unsavedRecordings(sessionRef.current));
        dispatch({ type: 'clear' });
      },
    }),
    [],
  );

  /** True while a save is in flight (read from the ref, so it is never stale). */
  const isSaving = useCallback(() => savingRef.current, []);

  /**
   * Saves the session as a finished entry or a draft. Resolves true when it saved, false when it
   * did not (already saving, a missing required title, an edit asked to save a draft, nothing worth
   * keeping, or an error, which shows an Alert and keeps the session).
   */
  const save = useCallback(async (status: EntrySaveStatus): Promise<boolean> => {
    const current = sessionRef.current;
    if (!current || savingRef.current) return false;
    const kind = kindOf(journalsRef.current, current.journalId);
    if (status === 'saved' && titleRequired(kind) && current.title.trim().length === 0)
      return false;
    // An edit must never turn a finished entry into a draft.
    if (status === 'draft' && current.origin === 'edit') return false;
    // Never create an empty draft. A reopened draft already exists, so it is saved as it is.
    if (status === 'draft' && !current.id && !entryHasContent(current)) return false;

    savingRef.current = true;
    setSaving(true);
    try {
      // Closed new recordings are not saved; their cache files go after the save succeeds.
      const added = visibleRecordings(current).filter((r) => !r.persisted);
      const removals = pendingRemovals(current);
      const dream = await saveDream({
        ...(current.id ? { id: current.id } : {}),
        // New recordings are copied in (with their waveforms); a reopened entry's are already stored.
        ...(added.length > 0
          ? {
              addRecordings: added.map((r) => ({
                uri: r.uri,
                durationMs: r.durationMs,
                ...(r.waveform ? { waveform: r.waveform } : {}),
              })),
            }
          : {}),
        // Stored recordings the user closed are forgotten by this save (an explicit Done or Save
        // draft; back never saves), only those. Their files are deleted by the storage layer
        // after the commit.
        ...(removals.length > 0 ? { removeRecordings: removals } : {}),
        // Always strings: undefined would keep the stored value instead of clearing it. The
        // emotion is not on the page, so it is passed back as it was.
        details: {
          title: current.title,
          emotion: current.emotion,
          // Derived from the `#tag` words in the body, which stays as typed.
          tags: inlineTags(current.body),
          transcript: current.body,
        },
        status,
        journalId: current.journalId,
        requireTitle: titleRequired(kind),
      });
      // The saved recordings' cache files were deleted by the save. Closed new ones are deleted
      // here, only now that nothing can bring them back.
      deleteUnsavedRecordings(current.recordings.filter((r) => !r.persisted && r.removed));
      dispatch({
        type: 'markSaved',
        id: dream.id,
        createdAt: dream.createdAt,
        stored: recordingsOf(dream).map((r) => ({ uri: recordingUri(r), fileName: r.fileName })),
      });
      return true;
    } catch (e) {
      const copy = kindCopy(kind);
      Alert.alert(
        copy.saveFailureTitle,
        isIndexUnreadableError(e) ? copy.saveFailureUnreadable : copy.saveFailureMessage,
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  return { session, saving, isSaving, save, ...actions };
}

export type EntrySessionApi = ReturnType<typeof useEntrySession>;
