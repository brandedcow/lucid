import { Note, recordingUri } from '../services/notesStorage';
import { SessionRecording } from '../types/recording';
import { sanitizeWaveform } from '../utils/waveform';

let recordingCounter = 0;
/** A fresh local id for a recording made in the open note. */
export function newRecordingId(): string {
  recordingCounter += 1;
  return `new-${recordingCounter}`;
}

/**
 * The note being written, kept above the screen. `recordings` holds the voice notes shown in the
 * note, closed ones included (`removed: true`, so the close can be undone). Voice notes the user
 * closed in an earlier visit (held) are NOT here.
 */
export type NoteSession = {
  /** From `newNoteId()` once, or the stored id. */
  id: string;
  /** False until the first successful non-null save. */
  stored: boolean;
  createdAt?: string;
  pinned: boolean;
  body: string;
  recordings: SessionRecording[];
  saveState: 'idle' | 'dirty' | 'saving' | 'error';
  error?: { code?: string; cause: unknown };
};

export type NoteSessionAction =
  | { type: 'open'; session: NoteSession }
  | { type: 'clear' }
  | { type: 'setBody'; text: string }
  | {
      type: 'attach';
      id: string;
      recording: { uri: string; durationMs: number; waveform?: number[]; voiceTranscript?: string };
    }
  | { type: 'setRecordingText'; id: string; text: string }
  | { type: 'close'; id: string }
  | { type: 'restore'; id: string }
  /** `voiceTranscript` is the value that was SENT to storage (becomes the stored baseline). */
  | { type: 'markPersisted'; id: string; fileName: string; uri: string; voiceTranscript?: string }
  | { type: 'saved'; note: Note }
  | { type: 'saveState'; state: NoteSession['saveState']; error?: NoteSession['error'] }
  | { type: 'setPinned'; pinned: boolean };

/** A session for a stored note: its visible (not held) voice notes, already persisted. */
export function sessionFromNote(note: Note): NoteSession {
  const recordings: SessionRecording[] = [];
  for (const r of note.recordings ?? []) {
    if (typeof r !== 'object' || r === null || typeof r.heldAt === 'string') continue;
    recordings.push({
      id: newRecordingId(),
      uri: recordingUri(r),
      fileName: r.fileName,
      persisted: true,
      removed: false,
      durationMs: r.durationMs,
      ...(r.waveform ? { waveform: r.waveform } : {}),
      ...(r.voiceTranscript !== undefined
        ? { voiceTranscript: r.voiceTranscript, baseVoiceTranscript: r.voiceTranscript }
        : {}),
    });
  }
  return {
    id: note.id,
    stored: true,
    createdAt: note.createdAt,
    pinned: note.pinned === true,
    body: note.body,
    recordings,
    saveState: 'idle',
  };
}

/** A session for a note that does not exist yet. */
export function newSession(id: string, body = ''): NoteSession {
  return { id, stored: false, pinned: false, body, recordings: [], saveState: 'idle' };
}

/**
 * Mirrors storage's emptiness rule: a stored (persisted) recording is content, a new one only
 * while it is not closed.
 */
export function isSessionEmpty(s: NoteSession): boolean {
  return s.body.trim() === '' && s.recordings.every((r) => !r.persisted && r.removed);
}

const mapRecording = (
  s: NoteSession,
  id: string,
  change: (r: SessionRecording) => SessionRecording,
): NoteSession =>
  s.recordings.some((r) => r.id === id)
    ? { ...s, recordings: s.recordings.map((r) => (r.id === id ? change(r) : r)) }
    : s;

export function noteSessionReducer(
  state: NoteSession | null,
  action: NoteSessionAction,
): NoteSession | null {
  if (action.type === 'open') return action.session;
  if (action.type === 'clear') return null;
  if (state === null) return null;
  switch (action.type) {
    case 'setBody':
      if (action.text === state.body) return state;
      return { ...state, body: action.text, saveState: 'dirty', error: undefined };
    case 'attach': {
      const waveform = sanitizeWaveform(action.recording.waveform);
      const recording: SessionRecording = {
        id: action.id,
        uri: action.recording.uri,
        persisted: false,
        removed: false,
        durationMs: action.recording.durationMs,
        ...(waveform ? { waveform } : {}),
        ...(action.recording.voiceTranscript !== undefined
          ? { voiceTranscript: action.recording.voiceTranscript }
          : {}),
      };
      return { ...state, recordings: [...state.recordings, recording], saveState: 'dirty' };
    }
    case 'setRecordingText':
      return {
        ...mapRecording(state, action.id, (r) => ({ ...r, voiceTranscript: action.text })),
        saveState: 'dirty',
      };
    case 'close':
      return mapRecording(state, action.id, (r) => ({ ...r, removed: true }));
    case 'restore':
      return mapRecording(state, action.id, (r) => ({ ...r, removed: false }));
    case 'markPersisted':
      return mapRecording(state, action.id, (r) => ({
        ...r,
        persisted: true,
        fileName: action.fileName,
        uri: action.uri,
        baseVoiceTranscript: action.voiceTranscript,
      }));
    case 'saved':
      return { ...state, stored: true, createdAt: action.note.createdAt };
    case 'saveState':
      return { ...state, saveState: action.state, error: action.error };
    case 'setPinned':
      return { ...state, pinned: action.pinned };
  }
}
