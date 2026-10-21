import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  NOTE_IN_TRASH,
  NOTE_NOT_FOUND,
  Note,
  discardHeld,
  holdRecording,
  newNoteId,
  recordingUri,
  releaseRecording,
  saveNote,
  setPinned as storeSetPinned,
  softDeleteNote,
} from '../services/notesStorage';
import { discardRecording } from '../services/recordingFiles';
import {
  NoteSession,
  NoteSessionAction,
  isSessionEmpty,
  newRecordingId,
  newSession,
  noteSessionReducer,
  sessionFromNote,
} from './noteSessionState';

const codeOf = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
};

/** Recordings still to write: new ones, and stored ones whose transcript text changed. */
const pendingRecordingWork = (s: NoteSession) => ({
  additions: s.recordings.filter((r) => !r.persisted && !r.removed),
  texts: s.recordings.filter(
    (r) =>
      r.persisted &&
      r.fileName !== undefined &&
      r.voiceTranscript !== undefined &&
      r.voiceTranscript !== r.baseVoiceTranscript,
  ),
});

type SaveOutcome = { ok: true } | { ok: false; error: unknown };
type LeaveResult = { kept: boolean; error?: unknown };

/**
 * The note being written. The session lives in a ref (`latest`, the truth); React state is only a
 * mirror for rendering, so timers and async callbacks never read a stale closure. Every storage
 * call goes through ONE session-level promise chain, so this session's writes are ordered (the
 * storage queue orders them against everything else) and never more than one `saveNote` is in
 * flight.
 *
 * Saving: typing restarts a `debounceMs` timer (default 1000); a `maxWaitMs` timer (default
 * 10000, not reset by typing) bounds continuous typing. Attaching a recording saves at once. The
 * app going to the background saves at once. A save with nothing changed writes nothing. While the
 * editor is open an emptied stored note is NOT moved to Recently Deleted and a new empty note is
 * never created; the state stays dirty. Edits during a save give exactly one follow-up save.
 * A failed save sets `saveState: 'error'` and keeps everything dirty; no retry loop (the next edit
 * or `leave` tries again). A note trashed from elsewhere (NOTE_IN_TRASH) stops autosaving.
 *
 * Voice notes: closing/restoring one marks it held/released in storage by reconciling the session
 * state with what storage has (closing then restoring quickly converges, never out of order).
 * Unsaved (cache) recordings are only marked locally.
 *
 * `leave()` (idempotent: later calls return the first promise): flush the latest text, sync
 * holds, delete held voice notes (`discardHeld`), move a note left with no content to Recently
 * Deleted, delete the cache files of recordings that were never stored, clear. `kept` is true when
 * the note is stored and not in Recently Deleted. If the final save fails nothing is deleted or
 * cleared: it returns `{ kept: true, error }` and the session stays open in `saveState: 'error'`;
 * `leave({ discardUnsaved: true })` then just clears the session and leaves cache files alone
 * (they may be the only copy). The provider must `await leave()` before opening another note
 * (opening over a live session just replaces it). Unmount runs `leave()`.
 *
 * `onCreated` fires once, after the first successful non-null save of a note this session created
 * with `openNew` (never for `open`). `onChange` fires after any successful storage write.
 */
export function useNoteSession(opts?: {
  debounceMs?: number;
  maxWaitMs?: number;
  onCreated?: (note: Note) => void;
  onChange?: () => void;
}): {
  session: NoteSession | null;
  openNew(initial?: { body?: string }): void;
  open(note: Note): boolean;
  setBody(text: string): void;
  attachRecording(r: {
    uri: string;
    durationMs: number;
    waveform?: number[];
    voiceTranscript?: string;
  }): string;
  setRecordingText(id: string, text: string): void;
  closeRecording(id: string): void;
  restoreRecording(id: string): void;
  setPinned(pinned: boolean): Promise<boolean>;
  flush(): Promise<void>;
  trash(): Promise<boolean>;
  leave(opts?: { discardUnsaved?: boolean }): Promise<LeaveResult>;
} {
  const debounceMs = opts?.debounceMs ?? 1000;
  const maxWaitMs = opts?.maxWaitMs ?? 10000;
  const callbacks = useRef({ onCreated: opts?.onCreated, onChange: opts?.onChange });
  useEffect(() => {
    callbacks.current = { onCreated: opts?.onCreated, onChange: opts?.onChange };
  });

  const [session, setSession] = useState<NoteSession | null>(null);
  const latest = useRef<NoteSession | null>(null);
  const mounted = useRef(true);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const heldConfirmed = useRef(new Map<string, boolean>());
  const createdHere = useRef(false);
  const createdFired = useRef(false);
  const trashedByUs = useRef(false);
  const trashedElsewhere = useRef(false);
  // A pin change failed and set the error state; lets a later successful pin clear only that error.
  const pinFailed = useRef(false);
  const leaving = useRef(false);
  const leavePromise = useRef<Promise<LeaveResult> | null>(null);
  // Set after render; lets the save code (defined earlier) re-arm the timers.
  const scheduleRef = useRef<() => void>(() => {});

  const dispatch = useCallback((action: NoteSessionAction) => {
    latest.current = noteSessionReducer(latest.current, action);
    if (mounted.current) setSession(latest.current);
  }, []);

  const changed = () => callbacks.current.onChange?.();

  /** Queues `task` after everything this session already queued; a failure never blocks later tasks. */
  const run = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.current.then(task);
    chain.current = next.catch(() => undefined);
    return next;
  }, []);

  const clearTimers = useCallback(() => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    if (maxTimer.current !== null) clearTimeout(maxTimer.current);
    debounceTimer.current = null;
    maxTimer.current = null;
  }, []);

  const failState = useCallback(
    (error: unknown) =>
      dispatch({ type: 'saveState', state: 'error', error: { code: codeOf(error), cause: error } }),
    [dispatch],
  );

  /** Holds/releases stored voice notes until storage matches the session's closed flags. */
  const runSync = useCallback(async (): Promise<void> => {
    for (let pass = 0; pass < 10; pass += 1) {
      const s = latest.current;
      if (!s || !s.stored) return;
      const todo = s.recordings.filter(
        (r) =>
          r.persisted &&
          r.fileName !== undefined &&
          r.removed !== (heldConfirmed.current.get(r.id) ?? false),
      );
      if (todo.length === 0) return;
      for (const r of todo) {
        const want = r.removed;
        try {
          if (want) await holdRecording(s.id, r.fileName as string);
          else await releaseRecording(s.id, r.fileName as string);
          heldConfirmed.current.set(r.id, want);
          changed();
        } catch (error) {
          if (codeOf(error) === NOTE_NOT_FOUND) {
            heldConfirmed.current.set(r.id, want);
            continue;
          }
          // Storage still has the old state: show that again and report.
          dispatch({ type: want ? 'restore' : 'close', id: r.id });
          failState(error);
          return;
        }
      }
    }
  }, [dispatch, failState]);

  const runSave = useCallback(
    async (mode: 'autosave' | 'leave'): Promise<SaveOutcome> => {
      const s = latest.current;
      if (!s || trashedElsewhere.current) return { ok: true };
      const rev = revision.current;
      const { additions, texts } = pendingRecordingWork(s);
      if (rev === savedRevision.current && additions.length === 0 && texts.length === 0) {
        return { ok: true };
      }
      if (mode === 'autosave' && isSessionEmpty(s)) return { ok: true };

      dispatch({ type: 'saveState', state: 'saving' });
      let result: Awaited<ReturnType<typeof saveNote>>;
      try {
        result = await saveNote({
          id: s.id,
          body: s.body,
          addRecordings: additions.map((r) => ({
            uri: r.uri,
            durationMs: r.durationMs,
            waveform: r.waveform,
            voiceTranscript: r.voiceTranscript,
          })),
          recordingTexts: texts.map((r) => ({
            fileName: r.fileName as string,
            text: r.voiceTranscript as string,
          })),
        });
      } catch (error) {
        if (codeOf(error) === NOTE_IN_TRASH) trashedElsewhere.current = true;
        failState(error);
        return { ok: false, error };
      }

      const { note, added } = result;
      additions.forEach((r, i) => {
        const stored = added[i];
        if (!stored) return;
        dispatch({
          type: 'markPersisted',
          id: r.id,
          fileName: stored.fileName,
          uri: recordingUri(stored),
          voiceTranscript: r.voiceTranscript,
        });
      });
      for (const r of texts) {
        dispatch({
          type: 'markPersisted',
          id: r.id,
          fileName: r.fileName as string,
          uri: r.uri,
          voiceTranscript: r.voiceTranscript,
        });
      }
      savedRevision.current = rev;
      pinFailed.current = false;
      if (note !== null) {
        const first = !s.stored;
        if (typeof note.deletedAt === 'string') trashedByUs.current = true;
        dispatch({ type: 'saved', note });
        // A pin set before the note existed is applied right after the first save.
        const wantPin = first && latest.current?.pinned === true;
        if (first && createdHere.current && !createdFired.current) {
          createdFired.current = true;
          callbacks.current.onCreated?.(note);
        }
        if (wantPin) {
          try {
            await storeSetPinned(note.id, true);
          } catch (error) {
            failState(error);
          }
        }
        changed();
      }
      if (latest.current?.saveState !== 'error') {
        const moved = revision.current !== rev;
        dispatch({ type: 'saveState', state: moved ? 'dirty' : 'idle' });
        if (moved && !leaving.current) scheduleRef.current();
      }
      return { ok: true };
    },
    [dispatch, failState],
  );

  const autosaveTask = useCallback(async () => {
    const outcome = await runSave('autosave');
    if (outcome.ok) await runSync();
  }, [runSave, runSync]);

  const requestSave = useCallback(() => {
    clearTimers();
    void run(autosaveTask);
  }, [autosaveTask, clearTimers, run]);

  const requestSync = useCallback(() => {
    void run(runSync);
  }, [run, runSync]);

  const schedule = useCallback(() => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      requestSave();
    }, debounceMs);
    if (maxTimer.current === null) {
      maxTimer.current = setTimeout(() => {
        maxTimer.current = null;
        requestSave();
      }, maxWaitMs);
    }
  }, [debounceMs, maxWaitMs, requestSave]);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  const resetRefs = useCallback(() => {
    clearTimers();
    revision.current = 0;
    savedRevision.current = 0;
    heldConfirmed.current = new Map();
    createdHere.current = false;
    createdFired.current = false;
    trashedByUs.current = false;
    trashedElsewhere.current = false;
    pinFailed.current = false;
    leaving.current = false;
    leavePromise.current = null;
  }, [clearTimers]);

  const openNew = useCallback(
    (initial?: { body?: string }) => {
      resetRefs();
      const body = initial?.body ?? '';
      createdHere.current = true;
      dispatch({ type: 'open', session: newSession(newNoteId(), body) });
      if (body !== '') {
        revision.current = 1;
        dispatch({ type: 'saveState', state: 'dirty' });
        scheduleRef.current();
      }
    },
    [dispatch, resetRefs],
  );

  const open = useCallback(
    (note: Note): boolean => {
      if (typeof note.deletedAt === 'string') return false;
      resetRefs();
      dispatch({ type: 'open', session: sessionFromNote(note) });
      return true;
    },
    [dispatch, resetRefs],
  );

  /** An edit that needs saving: dirty, restart the debounce (unless saving is over for good). */
  const edited = useCallback(() => {
    revision.current += 1;
    if (trashedElsewhere.current) {
      // Keep telling the screen this note can no longer be saved.
      dispatch({ type: 'saveState', state: 'error', error: { code: NOTE_IN_TRASH, cause: null } });
      return;
    }
    scheduleRef.current();
  }, [dispatch]);

  const setBody = useCallback(
    (text: string) => {
      const s = latest.current;
      if (!s || leaving.current || text === s.body) return;
      dispatch({ type: 'setBody', text });
      edited();
    },
    [dispatch, edited],
  );

  const attachRecording = useCallback(
    (r: { uri: string; durationMs: number; waveform?: number[]; voiceTranscript?: string }) => {
      if (!latest.current || leaving.current) return '';
      const id = newRecordingId();
      dispatch({ type: 'attach', id, recording: r });
      if (!trashedElsewhere.current) requestSave();
      return id;
    },
    [dispatch, requestSave],
  );

  const setRecordingText = useCallback(
    (id: string, text: string) => {
      const s = latest.current;
      if (!s || leaving.current) return;
      const rec = s.recordings.find((r) => r.id === id);
      if (!rec || rec.voiceTranscript === text) return;
      dispatch({ type: 'setRecordingText', id, text });
      edited();
    },
    [dispatch, edited],
  );

  const closeRecording = useCallback(
    (id: string) => {
      const rec = latest.current?.recordings.find((r) => r.id === id);
      if (!rec || leaving.current || rec.removed) return;
      dispatch({ type: 'close', id });
      if (rec.persisted) requestSync();
    },
    [dispatch, requestSync],
  );

  const restoreRecording = useCallback(
    (id: string) => {
      const rec = latest.current?.recordings.find((r) => r.id === id);
      if (!rec || leaving.current || !rec.removed) return;
      dispatch({ type: 'restore', id });
      if (rec.persisted) requestSync();
      else if (!trashedElsewhere.current) requestSave();
    },
    [dispatch, requestSave, requestSync],
  );

  const setPinned = useCallback(
    async (pinned: boolean): Promise<boolean> => {
      const s = latest.current;
      if (!s) return false;
      if (!s.stored) {
        dispatch({ type: 'setPinned', pinned });
        return true;
      }
      return run(async () => {
        try {
          await storeSetPinned(s.id, pinned);
          dispatch({ type: 'setPinned', pinned });
          if (pinFailed.current) {
            pinFailed.current = false;
            const { additions, texts } = pendingRecordingWork(latest.current ?? s);
            if (
              latest.current?.saveState === 'error' &&
              !trashedElsewhere.current &&
              revision.current === savedRevision.current &&
              additions.length === 0 &&
              texts.length === 0
            ) {
              dispatch({ type: 'saveState', state: 'idle' });
            }
          }
          changed();
          return true;
        } catch (error) {
          pinFailed.current = true;
          failState(error);
          return false;
        }
      });
    },
    [dispatch, failState, run],
  );

  const flush = useCallback(async () => {
    clearTimers();
    await run(autosaveTask);
  }, [autosaveTask, clearTimers, run]);

  /** Deletes the cache files of recordings that were never stored (closed ones included). */
  const discardUnsavedFiles = () => {
    for (const r of latest.current?.recordings ?? []) {
      if (r.persisted) continue;
      try {
        discardRecording(r.uri);
      } catch {
        // A leftover cache file is harmless.
      }
    }
  };

  const trash = useCallback(async (): Promise<boolean> => {
    clearTimers();
    return run(async () => {
      const s = latest.current;
      if (!s) return false;
      leaving.current = true;
      if (!isSessionEmpty(s)) {
        const outcome = await runSave('leave');
        if (!outcome.ok && !trashedElsewhere.current) {
          leaving.current = false;
          return false;
        }
        if (outcome.ok) await runSync();
      }
      const id = s.id;
      if (latest.current?.stored && !trashedByUs.current && !trashedElsewhere.current) {
        try {
          await softDeleteNote(id);
          changed();
        } catch (error) {
          if (codeOf(error) !== NOTE_NOT_FOUND) {
            leaving.current = false;
            failState(error);
            return false;
          }
        }
      }
      discardUnsavedFiles();
      dispatch({ type: 'clear' });
      changed();
      return true;
    });
  }, [clearTimers, dispatch, failState, run, runSave, runSync]);

  const leave = useCallback(
    (leaveOpts?: { discardUnsaved?: boolean }): Promise<LeaveResult> => {
      if (leavePromise.current) return leavePromise.current;
      leaving.current = true;
      clearTimers();
      const done = run(async (): Promise<LeaveResult> => {
        const s = latest.current;
        if (!s) return { kept: false };
        const keptNow = () =>
          latest.current?.stored === true && !trashedByUs.current && !trashedElsewhere.current;

        if (leaveOpts?.discardUnsaved) {
          const kept = keptNow();
          dispatch({ type: 'clear' });
          return { kept };
        }

        // (1) save the latest state; a failure stops here with nothing deleted
        const outcome = await runSave('leave');
        if (!outcome.ok && !trashedElsewhere.current) {
          leaving.current = false;
          leavePromise.current = null;
          return { kept: true, error: outcome.error };
        }
        if (trashedElsewhere.current) {
          // Nothing to save into; cache files stay (they may be the only copy).
          dispatch({ type: 'clear' });
          return { kept: false };
        }
        // (2) holds match the closed flags
        await runSync();
        // (3) delete the closed voice notes of a stored, live note
        let after = latest.current;
        if (after?.stored && !trashedByUs.current) {
          try {
            await discardHeld(after.id);
            changed();
          } catch (error) {
            failState(error);
            leaving.current = false;
            leavePromise.current = null;
            return { kept: true, error };
          }
          // (4) a note left with a blank body and no voice note is empty: Recently Deleted
          after = latest.current;
          if (after && after.body.trim() === '' && after.recordings.every((r) => r.removed)) {
            try {
              const { note } = await saveNote({ id: after.id, body: after.body });
              if (note && typeof note.deletedAt === 'string') trashedByUs.current = true;
              changed();
            } catch (error) {
              if (codeOf(error) === NOTE_IN_TRASH) trashedByUs.current = true;
              else {
                failState(error);
                leaving.current = false;
                leavePromise.current = null;
                return { kept: true, error };
              }
            }
          }
        }
        // (5) cache files of recordings that were never stored
        discardUnsavedFiles();
        // (6)
        const kept = keptNow();
        dispatch({ type: 'clear' });
        changed();
        return { kept };
      });
      leavePromise.current = done;
      return done;
    },
    [clearTimers, dispatch, failState, run, runSave, runSync],
  );

  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', (state) => {
      if ((state === 'inactive' || state === 'background') && latest.current && !leaving.current) {
        requestSave();
      }
    });
    return () => {
      sub.remove();
      mounted.current = false;
      clearTimers();
      void leave();
    };
  }, [clearTimers, leave, requestSave]);

  return {
    session,
    openNew,
    open,
    setBody,
    attachRecording,
    setRecordingText,
    closeRecording,
    restoreRecording,
    setPinned,
    flush,
    trash,
    leave,
  };
}
