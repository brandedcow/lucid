import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { isIndexUnreadableError, saveDream } from '../services/dreamStorage';
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

/**
 * The entry being written or edited on the add-entry page, kept above the screen. Separate from
 * `useDreamSession` (the old Capture / Read it back / Review flow): one page, two text fields.
 */
export type EntrySession = {
  /** 'new' starts empty, 'draft' reopens a stored draft, 'edit' reopens a finished entry. */
  origin: 'new' | 'draft' | 'edit';
  /** The journal this entry belongs to (a reopened record's comes from `journalOf`). */
  journalId: JournalId;
  /** Set when a stored draft or finished entry is reopened, or once a save created one. */
  id?: string;
  createdAt?: string;
  /** A reopened entry's permanent recording, kept as it is on save. Nothing here deletes it. */
  audio?: { durationMs: number };
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
  | { type: 'markSaved'; id: string; createdAt: string }
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
    case 'markSaved':
      // The entry now exists: a second save updates it.
      return { ...state, id: action.id, createdAt: action.createdAt };
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
  const session: EntrySession = {
    origin,
    journalId: journalOf(dream),
    id: dream.id,
    createdAt: dream.createdAt,
    ...(dream.audioFileName ? { audio: { durationMs: dream.durationMs } } : {}),
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

/** True when the page holds anything the user typed: a title, body text, a tag or tag text. */
export function entryHasContent(session: EntrySession): boolean {
  return (
    session.title.trim().length > 0 ||
    session.body.trim().length > 0 ||
    session.tags.length > 0 ||
    session.tagDraft.trim().length > 0
  );
}

/**
 * True when an 'edit' session differs from the entry as opened: title and body (trimmed, case
 * kept), tags (an ordered array) or tag text not yet confirmed. False when there is no baseline.
 */
export function entryHasEdits(session: EntrySession): boolean {
  const { baseline } = session;
  if (!baseline) return false;
  if (session.tagDraft.trim().length > 0) return true;
  return (
    session.title.trim() !== baseline.title.trim() ||
    session.body.trim() !== baseline.body.trim() ||
    session.tags.length !== baseline.tags.length ||
    session.tags.some((tag, i) => tag !== baseline.tags[i])
  );
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
      clear: () => dispatch({ type: 'clear' }),
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
      const dream = await saveDream({
        ...(current.id ? { id: current.id } : {}),
        // A reopened entry keeps its recording and duration; a new one has none yet.
        durationMs: current.audio?.durationMs ?? 0,
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
      dispatch({ type: 'markSaved', id: dream.id, createdAt: dream.createdAt });
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
