import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { dreamAudioUri, isIndexUnreadableError, saveDream } from '../services/dreamStorage';
import { Dream } from '../types/dream';
import { withPendingEmotion } from '../utils/emotions';
import { addTag } from '../utils/tags';
import { hasSomethingToKeep } from '../utils/sessionNavigation';

/** Everything about the dream being captured or edited, kept above the screens. */
export type Session = {
  origin: 'edit' | 'capture' | 'write' | 'draft';
  /** Set when a saved draft or finished dream is reopened. */
  id?: string;
  createdAt?: string;
  /**
   * `uri` is the cache file of a new recording (persisted false) or the permanent file of a
   * reopened draft (persisted true). Only a non-persisted cache file may ever be discarded.
   */
  audio?: { uri: string; durationMs: number; persisted: boolean };
  transcript: string;
  title: string;
  emotion: string;
  /** Emotion text typed on Review but not yet turned into an emotion; kept so it survives Review -> Edit. */
  emotionDraft: string;
  tags: string[];
  /** Tag text typed on Review but not yet turned into a tag; kept so it survives Review -> Edit. */
  tagDraft: string;
  passedThroughReadItBack: boolean;
  /** Only for origin 'edit': the dream's values when opened, to tell whether anything changed. */
  baseline?: { title: string; emotion: string; tags: string[]; transcript: string };
};

type Recording = { uri: string; durationMs: number };

export type SessionAction =
  | { type: 'startFromRecording'; recording: Recording; transcript: string }
  | { type: 'startWriting'; transcript?: string }
  | { type: 'openDraft'; session: Session }
  | { type: 'setTranscript'; value: string }
  | { type: 'setTitle'; value: string }
  | { type: 'setEmotion'; value: string }
  | { type: 'setEmotionDraft'; value: string }
  | { type: 'setTags'; value: string[] }
  | { type: 'setTagDraft'; value: string }
  | { type: 'markSaved'; id: string; createdAt: string; audioUri: string | null }
  | { type: 'markPassedThroughReadItBack' }
  | { type: 'clear' };

/** State is null when no dream is in progress. */
export function sessionReducer(state: Session | null, action: SessionAction): Session | null {
  switch (action.type) {
    case 'startFromRecording':
      return {
        origin: 'capture',
        audio: {
          uri: action.recording.uri,
          durationMs: action.recording.durationMs,
          persisted: false,
        },
        transcript: action.transcript,
        title: '',
        emotion: '',
        emotionDraft: '',
        tags: [],
        tagDraft: '',
        passedThroughReadItBack: false,
      };
    case 'startWriting':
      return {
        origin: 'write',
        transcript: action.transcript ?? '',
        title: '',
        emotion: '',
        emotionDraft: '',
        tags: [],
        tagDraft: '',
        passedThroughReadItBack: false,
      };
    case 'openDraft':
      return action.session;
    case 'clear':
      return null;
    default:
      break;
  }
  if (!state) return state;
  switch (action.type) {
    case 'setTranscript':
      return { ...state, transcript: action.value };
    case 'setTitle':
      return { ...state, title: action.value };
    case 'setEmotion':
      return { ...state, emotion: action.value };
    case 'setEmotionDraft':
      return { ...state, emotionDraft: action.value };
    case 'setTags':
      return { ...state, tags: action.value };
    case 'setTagDraft':
      return { ...state, tagDraft: action.value };
    case 'markSaved':
      // The dream now exists: a second save updates it, and a new recording lives in permanent
      // storage (the cache file was deleted by the save).
      return {
        ...state,
        id: action.id,
        createdAt: action.createdAt,
        ...(state.audio && !state.audio.persisted && action.audioUri
          ? { audio: { ...state.audio, uri: action.audioUri, persisted: true } }
          : {}),
      };
    case 'markPassedThroughReadItBack':
      return { ...state, passedThroughReadItBack: true };
    default:
      return state;
  }
}

/**
 * Builds the session for a stored dream (a reopened draft, or a finished dream being edited). Its
 * audio is the permanent file. An 'edit' session also keeps a baseline of the values it opened with.
 */
export function sessionFromDream(dream: Dream, origin: 'edit' | 'draft'): Session {
  const uri = dreamAudioUri(dream);
  // Stored dreams can predate the tags field.
  const tags = Array.isArray(dream.tags) ? dream.tags : [];
  const session: Session = {
    origin,
    id: dream.id,
    createdAt: dream.createdAt,
    ...(uri ? { audio: { uri, durationMs: dream.durationMs, persisted: true } } : {}),
    transcript: dream.transcript ?? '',
    title: dream.title,
    emotion: dream.emotion ?? '',
    emotionDraft: '',
    tags,
    tagDraft: '',
    // A stored dream already went through Read it back once.
    passedThroughReadItBack: true,
  };
  if (origin === 'edit') {
    session.baseline = {
      title: session.title,
      emotion: session.emotion,
      tags: [...tags],
      transcript: session.transcript,
    };
  }
  return session;
}

/** Builds the session for a reopened draft. Its audio is the permanent file. */
export function sessionFromDraft(dream: Dream): Session {
  return sessionFromDream(dream, 'draft');
}

export type SaveStatus = 'draft' | 'saved';

const SAVE_FAILED = ['Could not save your dream', 'Please try again.'] as const;
const INDEX_UNREADABLE_MESSAGE = [
  'Could not save your dream',
  'Your saved dreams could not be read, so this dream was not saved. Your recording is still here.',
] as const;

export function useDreamSession() {
  const [session, dispatch] = useReducer(sessionReducer, null);
  const [saving, setSaving] = useState(false);
  // The ref is the real guard: two taps in the same frame both see the same stale `saving` state.
  const savingRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const actions = useMemo(
    () => ({
      startFromRecording: (recording: Recording, transcript: string) =>
        dispatch({ type: 'startFromRecording', recording, transcript }),
      startWriting: (transcript = '') => dispatch({ type: 'startWriting', transcript }),
      openDraft: (dream: Dream) =>
        dispatch({ type: 'openDraft', session: sessionFromDraft(dream) }),
      openDream: (dream: Dream) =>
        dispatch({ type: 'openDraft', session: sessionFromDream(dream, 'edit') }),
      setTranscript: (value: string) => dispatch({ type: 'setTranscript', value }),
      setTitle: (value: string) => dispatch({ type: 'setTitle', value }),
      setEmotion: (value: string) => dispatch({ type: 'setEmotion', value }),
      setEmotionDraft: (value: string) => dispatch({ type: 'setEmotionDraft', value }),
      setTags: (value: string[]) => dispatch({ type: 'setTags', value }),
      setTagDraft: (value: string) => dispatch({ type: 'setTagDraft', value }),
      markPassedThroughReadItBack: () => dispatch({ type: 'markPassedThroughReadItBack' }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [],
  );

  /** True while a save is in flight (read from the ref, so it is never stale). */
  const isSaving = useCallback(() => savingRef.current, []);

  /**
   * Saves the current session as a finished dream or a draft. Resolves true when it is safe to
   * leave (saved, or nothing worth keeping), false when it did not save (already saving, no title,
   * or an error, which shows an Alert and keeps the session and recording).
   */
  const save = useCallback(async (status: SaveStatus): Promise<boolean> => {
    const current = sessionRef.current;
    if (!current || savingRef.current) return false;
    if (status === 'saved' && current.title.trim().length === 0) return false;
    // An edit must never turn a finished dream into a draft. Return false so the session is kept.
    if (status === 'draft' && current.origin === 'edit') return false;
    // Do not create an empty draft. A reopened draft already exists, so it is saved as it is.
    if (status === 'draft' && !current.id && !hasSomethingToKeep(current)) return true;

    savingRef.current = true;
    setSaving(true);
    try {
      const { audio } = current;
      const dream = await saveDream({
        ...(current.id ? { id: current.id } : {}),
        // A reopened draft's audio is already in permanent storage.
        ...(audio && !audio.persisted ? { recordingUri: audio.uri } : {}),
        durationMs: audio?.durationMs ?? 0,
        // Always strings: undefined would keep the stored value instead of clearing it.
        details: {
          title: current.title,
          // Include an emotion that was typed but not yet confirmed.
          emotion: withPendingEmotion(current.emotion, current.emotionDraft),
          // Include a tag that was typed but not yet confirmed.
          tags: addTag(current.tags, current.tagDraft),
          transcript: current.transcript,
        },
        status,
      });
      dispatch({
        type: 'markSaved',
        id: dream.id,
        createdAt: dream.createdAt,
        audioUri: dreamAudioUri(dream),
      });
      return true;
    } catch (e) {
      const [heading, message] = isIndexUnreadableError(e) ? INDEX_UNREADABLE_MESSAGE : SAVE_FAILED;
      Alert.alert(heading, message);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  return { session, saving, isSaving, save, ...actions };
}

export type DreamSessionApi = ReturnType<typeof useDreamSession>;
