import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  discardRecording,
  dreamAudioUri,
  isIndexUnreadableError,
  saveDream,
} from '../services/dreamStorage';
import { Dream } from '../types/dream';
import { DREAMS_JOURNAL, JournalId } from '../types/entry';
import {
  BUILT_IN_JOURNALS,
  Journal,
  journalOf,
  kindCopy,
  kindOf,
  titleRequired,
} from '../utils/journals';
import { addTag } from '../utils/tags';
import { sanitizeWaveform } from '../utils/waveform';

/**
 * The voice recording attached to an entry on the page. `persisted` false is a new recording still
 * in the cache; true is a reopened entry's permanent file. `removed` is the session's mark that the
 * user closed the card: nothing is deleted or forgotten when it is set, so it can be undone.
 */
export type EntryAudio = {
  uri: string;
  durationMs: number;
  /** Loudness peaks (0..1) for the card; absent on old entries. */
  waveform?: number[];
  persisted: boolean;
  removed: boolean;
};

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
   * The attached recording: a new one from the page's mic (cache file), or a reopened entry's
   * permanent one (kept as it is on save; nothing here ever deletes it).
   */
  audio?: EntryAudio;
  /**
   * Earlier unsaved recordings that were closed and then replaced by a new one. Their cache files
   * are kept (an undo could bring them back) and deleted when the entry is saved or left.
   */
  shelved?: EntryAudio[];
  title: string;
  /** Stored as the entry's `transcript`. */
  body: string;
  /** Not on the page; kept so editing never clears a stored emotion. */
  emotion: string;
  tags: string[];
  /** Tag text typed but not yet turned into a tag; saved too. */
  tagDraft: string;
  /** Only for origin 'edit': the values when opened, to tell whether anything changed. */
  baseline?: { title: string; body: string; tags: string[] };
};

export type EntrySessionAction =
  | { type: 'startNew'; journalId?: JournalId; body?: string }
  | { type: 'open'; session: EntrySession }
  | { type: 'setJournal'; journalId: JournalId }
  | { type: 'setTitle'; value: string }
  | { type: 'setBody'; value: string }
  | { type: 'setTags'; value: string[] }
  | { type: 'setTagDraft'; value: string }
  | { type: 'attachRecording'; recording: { uri: string; durationMs: number; waveform?: number[] } }
  | { type: 'removeAudio' }
  | { type: 'restoreAudio' }
  | { type: 'markSaved'; id: string; createdAt: string; audioUri?: string | null }
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
        title: '',
        body: action.body ?? '',
        emotion: '',
        tags: [],
        tagDraft: '',
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
    case 'setTags':
      return { ...state, tags: action.value };
    case 'setTagDraft':
      return { ...state, tagDraft: action.value };
    case 'attachRecording': {
      // One recording per entry: a new one is refused while a visible attachment exists. A closed
      // one is shelved, not forgotten.
      if (state.audio && !state.audio.removed) return state;
      const next: EntryAudio = {
        uri: action.recording.uri,
        durationMs: action.recording.durationMs,
        ...(sanitizeWaveform(action.recording.waveform)
          ? { waveform: action.recording.waveform }
          : {}),
        persisted: false,
        removed: false,
      };
      return {
        ...state,
        audio: next,
        ...(state.audio ? { shelved: [...(state.shelved ?? []), state.audio] } : {}),
      };
    }
    case 'removeAudio':
      // Closing only marks the recording; nothing is deleted here. A stored recording's file goes
      // only when the user saves (saveDream's removeAudio, CLAUDE.md deletion case 5).
      if (!state.audio || state.audio.removed) return state;
      return { ...state, audio: { ...state.audio, removed: true } };
    case 'restoreAudio':
      if (!state.audio?.removed) return state;
      return { ...state, audio: { ...state.audio, removed: false } };
    case 'markSaved': {
      // The entry now exists: a second save updates it. A new recording now lives in permanent
      // storage (the save deleted its cache file); one that was closed or shelved is gone, a
      // stored one included (the save removed it).
      const { audio, shelved: _shelved, ...rest } = state;
      let kept: EntryAudio | undefined = audio;
      if (audio && !audio.persisted) {
        kept =
          !audio.removed && action.audioUri
            ? { ...audio, uri: action.audioUri, persisted: true }
            : undefined;
      } else if (audio?.removed) {
        kept = undefined;
      }
      return {
        ...rest,
        id: action.id,
        createdAt: action.createdAt,
        ...(kept ? { audio: kept } : {}),
      };
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
  // Stored entries can predate the tags field.
  const tags = Array.isArray(dream.tags) ? dream.tags : [];
  const audioUri = dreamAudioUri(dream);
  const waveform = sanitizeWaveform(dream.waveform);
  const session: EntrySession = {
    origin,
    journalId: journalOf(dream),
    id: dream.id,
    createdAt: dream.createdAt,
    ...(audioUri
      ? {
          audio: {
            uri: audioUri,
            durationMs: dream.durationMs,
            ...(waveform ? { waveform } : {}),
            persisted: true,
            removed: false,
          },
        }
      : {}),
    title: dream.title,
    body: dream.transcript ?? '',
    emotion: dream.emotion ?? '',
    tags,
    tagDraft: '',
  };
  if (origin === 'edit') {
    session.baseline = { title: session.title, body: session.body, tags: [...tags] };
  }
  return session;
}

/** The attachment the user can see: one that has not been closed. */
export function visibleAudio(session: EntrySession): EntryAudio | undefined {
  return session.audio && !session.audio.removed ? session.audio : undefined;
}

/**
 * True when the user closed a STORED recording and has not saved yet. The save then passes
 * `removeAudio`; leaving without saving forgets the mark and deletes nothing.
 */
export function hasPendingAudioRemoval(session: EntrySession): boolean {
  return [...(session.shelved ?? []), ...(session.audio ? [session.audio] : [])].some(
    (audio) => audio.persisted && audio.removed,
  );
}

/** True when the page holds anything the user typed or recorded: a title, body text, a tag, tag text or a recording. */
export function entryHasContent(session: EntrySession): boolean {
  return (
    visibleAudio(session) !== undefined ||
    session.title.trim().length > 0 ||
    session.body.trim().length > 0 ||
    session.tags.length > 0 ||
    session.tagDraft.trim().length > 0
  );
}

/**
 * True when an 'edit' session differs from the entry as opened: title and body (trimmed, case
 * kept), tags (an ordered array), tag text not yet confirmed, or a recording added. False when
 * there is no baseline.
 */
export function entryHasEdits(session: EntrySession): boolean {
  const { baseline } = session;
  if (!baseline) return false;
  if (hasPendingAudioRemoval(session)) return true;
  if (session.tagDraft.trim().length > 0) return true;
  const added = visibleAudio(session);
  if (added && !added.persisted) return true;
  return (
    session.title.trim() !== baseline.title.trim() ||
    session.body.trim() !== baseline.body.trim() ||
    session.tags.length !== baseline.tags.length ||
    session.tags.some((tag, i) => tag !== baseline.tags[i])
  );
}

/** Every recording of the session that was never saved: the current one (when new) and shelved ones. */
function unsavedAudio(session: EntrySession | null): EntryAudio[] {
  if (!session) return [];
  return [...(session.shelved ?? []), ...(session.audio ? [session.audio] : [])].filter(
    (audio) => !audio.persisted,
  );
}

/** Deletes cache files of unsaved recordings. Only `persisted: false` audio ever gets here. */
function deleteUnsavedAudio(session: EntrySession | null) {
  for (const audio of unsavedAudio(session)) {
    try {
      discardRecording(audio.uri);
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
      setTags: (value: string[]) => dispatch({ type: 'setTags', value }),
      setTagDraft: (value: string) => dispatch({ type: 'setTagDraft', value }),
      attachRecording: (recording: { uri: string; durationMs: number; waveform?: number[] }) =>
        dispatch({ type: 'attachRecording', recording }),
      removeAudio: () => dispatch({ type: 'removeAudio' }),
      restoreAudio: () => dispatch({ type: 'restoreAudio' }),
      /**
       * Closes the entry. Deletes the cache files of recordings that were never saved (case 3 in
       * CLAUDE.md); a stored recording is never touched. Call it only when the recorder has
       * stopped.
       */
      clear: () => {
        deleteUnsavedAudio(sessionRef.current);
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
      // A closed new recording is not saved; its cache file goes after the save succeeds.
      const audio = visibleAudio(current);
      const dream = await saveDream({
        ...(current.id ? { id: current.id } : {}),
        // A new recording is copied in (with its waveform); a reopened entry's is already stored.
        ...(audio && !audio.persisted
          ? { recordingUri: audio.uri, ...(audio.waveform ? { waveform: audio.waveform } : {}) }
          : {}),
        durationMs: audio?.durationMs ?? 0,
        // A stored recording the user closed is forgotten by this save (an explicit Done or Save
        // draft; back never saves). Its file is deleted by the storage layer after the commit.
        ...(hasPendingAudioRemoval(current) ? { removeAudio: true } : {}),
        // Always strings: undefined would keep the stored value instead of clearing it. The
        // emotion is not on the page, so it is passed back as it was.
        details: {
          title: current.title,
          emotion: current.emotion,
          // Include a tag that was typed but not yet confirmed.
          tags: addTag(current.tags, current.tagDraft),
          transcript: current.body,
        },
        status,
        journalId: current.journalId,
        requireTitle: titleRequired(kind),
      });
      // The saved recording's cache file was deleted by the save. Closed and shelved ones are
      // deleted here, only now that nothing can bring them back.
      deleteUnsavedAudio({ ...current, ...(audio ? { audio: undefined } : {}) });
      dispatch({
        type: 'markSaved',
        id: dream.id,
        createdAt: dream.createdAt,
        audioUri: dreamAudioUri(dream),
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
