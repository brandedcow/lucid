/**
 * One voice recording attached to the note being edited. `id` is a stable local id (it survives a
 * save, so undo steps can name the recording). `persisted` false is a new recording still in the
 * cache; true is a stored one (`fileName` is its name inside the notes directory). `removed` is the
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
  /** On-device transcript of this recording; absent = none, '' = transcribed, nothing heard. */
  voiceTranscript?: string;
  /** The transcript as stored (set when `persisted`), to tell whether it changed. */
  baseVoiceTranscript?: string;
};
