import { useEffect, useRef, useState } from 'react';
import { RecordingTranscription } from '../services/transcription';
import { SessionRecording } from './useEntrySession';

/** What the page needs from the recognizer; `cancelAll` is the App hook's (falls back to `cancel`). */
export type AutoTranscribeSource = RecordingTranscription & { cancelAll?: () => void };

type Job = { id: string; uri: string; durationMs: number };
/** The job whose `start` was called and has not yet been seen to end. */
type InFlight = { job: Job; settled: boolean };

/**
 * Transcribes each NEW recording of the page automatically, one at a time, on-device only (an
 * automatic start never prompts and never uses the network, see RecordingTranscription.start).
 *
 * - New = an id in `recordings` that was not there at mount (stored notes are never transcribed).
 *   Jobs wait in a FIFO queue.
 * - The queue drains from an effect, never by awaiting `start`: only when no run is busy, the
 *   recording panel is closed and the last job we started is over. That is `busyId` back at null AND
 *   the job's `start` promise settled (during an automatic start's invisible permission check
 *   `busyId` is still null but the slot is taken, and a second `start` would return silently). A job
 *   whose `start` settles without ever setting `busyId` was skipped (not eligible); it is dropped.
 * - Each job is checked at its turn and skipped silently: the note must still exist, not be removed,
 *   have no transcript yet (also not ''), and the route must be on-device.
 * - The recording panel opening cancels the run and puts that job back at the front; it restarts
 *   after the recording stops. Unmount clears the queue.
 */
export function useAutoTranscribe(
  recordings: readonly SessionRecording[],
  transcription: AutoTranscribeSource,
  recording: boolean,
) {
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(recordings.map((r) => r.id));
  const queue = useRef<Job[]>([]);
  const inFlight = useRef<InFlight | null>(null);
  const mounted = useRef(true);
  // Bumped when the queue or the in-flight job changes, to run the drain effect again.
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queue.current = [];
      inFlight.current = null;
    };
  }, []);

  // The recording panel takes the audio session: stop our run and keep its job for later.
  const { cancelAll, cancel, busyId } = transcription;
  useEffect(() => {
    if (!recording) return;
    const current = inFlight.current;
    if (current && !current.settled) {
      queue.current.unshift(current.job);
      inFlight.current = null;
    }
    if (cancelAll) cancelAll();
    else if (busyId !== null) cancel(busyId);
    // Only the panel opening matters; busyId is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const { supported, route, start } = transcription;
  useEffect(() => {
    // New recordings join the queue.
    for (const r of recordings) {
      if (seen.current!.has(r.id)) continue;
      seen.current!.add(r.id);
      queue.current.push({ id: r.id, uri: r.uri, durationMs: r.durationMs });
    }
    if (recording || busyId !== null) return;
    // The job we started is over only when its `start` has settled too.
    if (inFlight.current) {
      if (!inFlight.current.settled) return;
      inFlight.current = null;
    }
    while (queue.current.length > 0) {
      const job = queue.current.shift()!;
      const note = recordings.find((r) => r.id === job.id);
      if (!note || note.removed || note.voiceTranscript !== undefined) continue;
      // Intentional drop: the recognizer gives no "resolved" signal, so we cannot tell a not-yet-known
      // route from a final one. Dropping is privacy-safe (nothing runs unasked) and the user can
      // still tap the speech bubble.
      if (!supported || route !== 'on-device') continue;
      const entry: InFlight = { job, settled: false };
      inFlight.current = entry;
      void start(job.id, note.uri, note.durationMs, { auto: true }).then(() => {
        entry.settled = true;
        if (mounted.current && inFlight.current === entry) bump();
      });
      return;
    }
  }, [recordings, recording, busyId, supported, route, start, version]);
}
