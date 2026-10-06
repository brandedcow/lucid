import { useMemo, useReducer } from 'react';
import { dreamAudioUri } from '../services/dreamStorage';
import { Dream } from '../types/dream';

/** Everything about the dream being captured or edited, kept above the screens. */
export type Session = {
  origin: 'capture' | 'write' | 'draft';
  /** Set when a saved draft is reopened. */
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
  tags: string[];
  passedThroughReadItBack: boolean;
};

type Recording = { uri: string; durationMs: number };

export type SessionAction =
  | { type: 'startFromRecording'; recording: Recording; transcript: string }
  | { type: 'startWriting' }
  | { type: 'openDraft'; session: Session }
  | { type: 'setTranscript'; value: string }
  | { type: 'setTitle'; value: string }
  | { type: 'setEmotion'; value: string }
  | { type: 'setTags'; value: string[] }
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
        tags: [],
        passedThroughReadItBack: false,
      };
    case 'startWriting':
      return {
        origin: 'write',
        transcript: '',
        title: '',
        emotion: '',
        tags: [],
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
    case 'setTags':
      return { ...state, tags: action.value };
    case 'markPassedThroughReadItBack':
      return { ...state, passedThroughReadItBack: true };
    default:
      return state;
  }
}

/** Builds the session for a reopened draft. Its audio is the permanent file. */
export function sessionFromDraft(dream: Dream): Session {
  const uri = dreamAudioUri(dream);
  return {
    origin: 'draft',
    id: dream.id,
    createdAt: dream.createdAt,
    ...(uri ? { audio: { uri, durationMs: dream.durationMs, persisted: true } } : {}),
    transcript: dream.transcript ?? '',
    title: dream.title,
    emotion: dream.emotion ?? '',
    tags: dream.tags,
    // A draft already went through Read it back once.
    passedThroughReadItBack: true,
  };
}

export function useDreamSession() {
  const [session, dispatch] = useReducer(sessionReducer, null);

  const actions = useMemo(
    () => ({
      startFromRecording: (recording: Recording, transcript: string) =>
        dispatch({ type: 'startFromRecording', recording, transcript }),
      startWriting: () => dispatch({ type: 'startWriting' }),
      openDraft: (dream: Dream) =>
        dispatch({ type: 'openDraft', session: sessionFromDraft(dream) }),
      setTranscript: (value: string) => dispatch({ type: 'setTranscript', value }),
      setTitle: (value: string) => dispatch({ type: 'setTitle', value }),
      setEmotion: (value: string) => dispatch({ type: 'setEmotion', value }),
      setTags: (value: string[]) => dispatch({ type: 'setTags', value }),
      markPassedThroughReadItBack: () => dispatch({ type: 'markPassedThroughReadItBack' }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [],
  );

  return { session, ...actions };
}

export type DreamSessionApi = ReturnType<typeof useDreamSession>;
