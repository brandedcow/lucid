export type TranscriptionStatus = 'none' | 'running' | 'failed' | 'ready';

export type TranscriptionErrorCode =
  | 'unsupported' // this device or locale cannot do on-device recognition
  | 'busy' // another recording is being transcribed (single queue)
  | 'permission' // speech or microphone permission refused
  | 'no-model' // Android offline model not installed
  | 'offline' // an online run needs internet and there is none
  | 'cancelled' // the user cancelled (UI treats it as "back to offer", no message)
  | 'failed'; // anything else

export type TranscriptionError = { code: TranscriptionErrorCode; message: string };

/** Transient per-recording run state. The TEXT is never held here: it lives on the session recording. */
export type RecordingTranscriptionState = {
  status: TranscriptionStatus; // 'ready' only briefly after onResult; the UI trusts voiceTranscript
  error?: TranscriptionError; // set when status is 'failed'
};

export type RecordingTranscription = {
  /** Capability: false hides every Transcribe affordance. */
  supported: boolean;
  /**
   * The route a run would take now: 'on-device', 'online' (only for a user who opted in, when this
   * phone cannot do it itself) or null (cannot transcribe). The sheet shows a quiet provider line
   * for 'online'.
   */
  route: 'on-device' | 'online' | null;
  /** Id of the recording currently running, or null (one at a time). */
  busyId: string | null;
  stateOf(id: string): RecordingTranscriptionState;
  /** Starts a run. Resolves when it ends (result delivered through the hook's own onResult). `durationMs` (the clip length, optional) scales the hook's inactivity limit. Never rejects: failures become stateOf(id) = failed.
   * `auto: true` (a start nobody tapped) may only do what is already consented: it never prompts for a permission (starts only if already granted), only runs on the 'on-device' route, and if it is not eligible it returns at once without setting any state. */
  start(id: string, uri: string, durationMs?: number, options?: { auto?: boolean }): Promise<void>;
  /** Cancels that recording's run (no-op when not running). */
  cancel(id: string): void;
};

/** The default: nothing can be transcribed, so the UI hides every Transcribe affordance. Starts nothing. */
export const UNSUPPORTED_TRANSCRIPTION: RecordingTranscription = {
  supported: false,
  route: null,
  busyId: null,
  stateOf: () => ({ status: 'none' }),
  start: async () => {},
  cancel: () => {},
};

/** What the sheet's transcript area shows for one note. `none` = nothing to show (the toggle is hidden). */
export type TranscriptView =
  | { kind: 'none' }
  | { kind: 'offer'; busyElsewhere: boolean }
  | { kind: 'running' }
  | { kind: 'failed'; error: TranscriptionError }
  | { kind: 'text' }
  | { kind: 'empty'; canRetry: boolean };

/**
 * Pure view derivation. The stored text decides "has text" (`voiceTranscript`: undefined = never
 * transcribed, '' = transcribed with nothing heard); the run state only drives running / failed /
 * offer. A cancelled run is not a failure: it falls back to the offer (or the empty message).
 */
export function transcriptView(
  voiceTranscript: string | undefined,
  state: RecordingTranscriptionState,
  supported: boolean,
  busyElsewhere: boolean,
): TranscriptView {
  if (voiceTranscript !== undefined && voiceTranscript.trim() !== '') return { kind: 'text' };
  if (state.status === 'running') return { kind: 'running' };
  if (state.status === 'failed' && state.error && state.error.code !== 'cancelled') {
    return { kind: 'failed', error: state.error };
  }
  if (voiceTranscript !== undefined) return { kind: 'empty', canRetry: supported };
  if (supported) return { kind: 'offer', busyElsewhere };
  return { kind: 'none' };
}
