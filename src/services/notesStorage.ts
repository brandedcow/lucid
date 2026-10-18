import { Directory, File, Paths } from 'expo-file-system';
import { StoredRecording } from '../types/dream';
import { isValidWaveform, sanitizeWaveform } from '../utils/waveform';

// Paths.document can change between app updates on iOS, so resolve it on every call
// and persist only file names.
const audioDir = () => new Directory(Paths.document, 'notes');
const indexFile = () => new File(Paths.document, 'notes.json');
const tempFile = () => new File(Paths.document, 'notes.json.tmp');
const backupFile = () => new File(Paths.document, 'notes.json.bak');

/** The only index layout this build reads or writes: `{ version, notes }`. */
const INDEX_VERSION = 1;

/** One voice note attached to a note: a file name inside `notes/` (or `dreams/` when legacy). */
export type NoteRecording = StoredRecording & {
  /** ISO time the user closed it. Present = held: kept in the record, not shown or played. */
  heldAt?: string;
  /** 'legacy' = imported from the old dream store: the audio stays in `dreams/` and is never deleted. */
  origin?: 'legacy';
};

/**
 * One stored note. Title, tags, preview and the Todo flag are derived from `body` and never stored.
 * Fields this version does not know about survive every update.
 */
export type Note = {
  id: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  pinned?: boolean;
  /** Present = in Recently Deleted. */
  deletedAt?: string;
  recordings?: NoteRecording[];
};

/** A finished recording to copy from the cache into permanent storage when saving. */
export type NewRecording = {
  uri: string;
  durationMs: number;
  /** Loudness peaks (0..1); an invalid list is dropped (the recording still saves). */
  waveform?: number[];
  /** On-device transcript of the recording (trimmed, capped); a non-string is dropped. '' is kept. */
  voiceTranscript?: string;
};

/** `error.code` of the failure thrown when notes.json exists but cannot be read. */
export const INDEX_UNREADABLE = 'INDEX_UNREADABLE';
/** `error.code` of the failure saveNote throws for a note that is in Recently Deleted. */
export const NOTE_IN_TRASH = 'NOTE_IN_TRASH';
/** `error.code` of the failure thrown for an unknown note id (or recording file name). */
export const NOTE_NOT_FOUND = 'NOTE_NOT_FOUND';

const coded = (message: string, code: string) => Object.assign(new Error(message), { code });

/** True for the error the write functions throw when the stored index is unreadable. */
export function isIndexUnreadableError(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === INDEX_UNREADABLE;
}

// The corrupt index is copied at most once per app session, so repeated failing saves do not
// pile up copies. Any good read clears this.
let corruptCopied = false;

/** Test-only: forget that a corrupt index was already copied this session. */
export function resetCorruptCopyGuard() {
  corruptCopied = false;
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Longest stored `voiceTranscript` (characters); a longer text is cut to this length. */
const MAX_VOICE_TRANSCRIPT_LENGTH = 20000;

/** A valid stored transcript (trimmed, capped), or undefined for a non-string. '' stays ''. */
function cleanVoiceTranscript(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  return text.trim().slice(0, MAX_VOICE_TRANSCRIPT_LENGTH).trimEnd();
}

/** Records without a string id are kept raw in every write and hidden from lists. */
const hasId = (record: unknown): record is Note =>
  typeof record === 'object' &&
  record !== null &&
  typeof (record as { id?: unknown }).id === 'string';

const isTrashed = (note: Note) => typeof note.deletedAt === 'string';

/** The note's stored recording items as they are (junk items stay in place and are never edited). */
const storedRecordings = (note: Note): NoteRecording[] =>
  Array.isArray(note.recordings) ? note.recordings : [];

const nameOf = (recording: unknown): unknown =>
  typeof recording === 'object' && recording !== null
    ? (recording as { fileName?: unknown }).fileName
    : undefined;

/** The notes of a parsed index, or null when the value is not an index this build understands. */
function notesOf(value: unknown): Note[] | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { version, notes } = value as { version?: unknown; notes?: unknown };
  return version === INDEX_VERSION && Array.isArray(notes) ? (notes as Note[]) : null;
}

/** The notes of an index-shaped file, or null when it is missing, zero-length or unreadable. */
async function readStored(file: File): Promise<Note[] | null> {
  try {
    if (!file.exists || file.size === 0) return null;
    return notesOf(await file.json());
  } catch {
    return null;
  }
}

/**
 * The base when notes.json is missing or zero-length (what a failed move can leave): a readable
 * temp file with notes in it (the newest complete write), else a backup with notes, else nothing.
 */
async function recoveryBase(): Promise<Note[]> {
  for (const file of [tempFile(), backupFile()]) {
    const notes = await readStored(file);
    if (notes && notes.length > 0) return notes;
  }
  return [];
}

/**
 * The index exactly as stored. A missing or zero-length file is the recovery base (see above),
 * and nothing is written until a normal save. An unreadable one is kept and reported. Only the
 * write paths ask for a recovery copy (`copyCorrupt`); displaying never writes.
 */
async function readRawIndex(copyCorrupt = false): Promise<Note[]> {
  const file = indexFile();
  if (!file.exists || file.size === 0) {
    corruptCopied = false;
    return recoveryBase();
  }
  let notes: Note[] | null = null;
  try {
    notes = notesOf(await file.json());
  } catch {
    notes = null;
  }
  if (notes === null) {
    // Keep a copy for recovery and refuse to continue: writing now would overwrite the notes.
    if (copyCorrupt && !corruptCopied) {
      corruptCopied = true;
      try {
        await file.copy(new File(Paths.document, `notes.corrupt-${Date.now()}.json`));
      } catch {
        // The original is still untouched; the error below is what matters.
      }
    }
    throw coded('The note index could not be read', INDEX_UNREADABLE);
  }
  corruptCopied = false;
  return notes;
}

/** Whether the stored index can be read. Never writes or copies anything. */
export async function getIndexStatus(): Promise<'ok' | 'unreadable'> {
  try {
    await readRawIndex();
    return 'ok';
  } catch {
    return 'unreadable';
  }
}

/** The index for display. An unreadable index shows as empty (the file itself is left alone). */
async function readIndex(): Promise<Note[]> {
  try {
    const notes = (await readRawIndex()).filter(hasId);
    return notes.map((n) => {
      const note: Note = { ...n, body: typeof n.body === 'string' ? n.body : '' };
      // An unusable waveform is ignored for display; the stored record is left alone.
      if (Array.isArray(note.recordings)) {
        note.recordings = note.recordings.map((r) => {
          if (typeof r !== 'object' || r === null || !('waveform' in r)) return r;
          if (isValidWaveform(r.waveform)) return r;
          const { waveform: _unused, ...rest } = r;
          return rest;
        });
      }
      return note;
    });
  } catch {
    return [];
  }
}

// Index writes run one at a time so two saves can never read the same index and drop a note.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

const indexContent = (notes: Note[]) => JSON.stringify({ version: INDEX_VERSION, notes });

/**
 * After a failed move that left notes.json missing or damaged: put the previous list in the temp
 * file (recovery reads it first) and try the move again, so a save that threw is not resurrected
 * from a temp file holding its content. Never throws. If this fails too, the backup (a copy of
 * the previous index) is the base, unless even the temp write could not replace the new content.
 */
async function rewindToPrevious(previous: Note[]) {
  try {
    const tmp = tempFile();
    tmp.write(indexContent(previous));
    await tmp.move(indexFile(), { overwrite: true });
  } catch {
    // Recovery reads the temp file or the backup.
  }
}

/**
 * The commit. Nothing is deleted anywhere: (1) write notes.json.tmp, (2) read it back and check it
 * parses with the same count, (3) copy a content-bearing current index to the backup (a failure
 * does not block the save), (4) move the temp file over notes.json. The old index stays whole
 * until step 4; if step 4 leaves it missing or damaged, recovery reads the temp file or backup.
 */
async function commitIndex(list: Note[], previous: Note[]) {
  const tmp = tempFile();
  tmp.write(indexContent(list));
  const check = await readStored(tmp);
  if (check === null || check.length !== list.length) {
    throw new Error('The note index could not be written');
  }

  const index = indexFile();
  const hadContent = index.exists && index.size !== 0;
  if (hadContent) {
    try {
      await index.copy(backupFile(), { overwrite: true });
    } catch {
      // A missing backup does not block saving.
    }
  }
  try {
    await tmp.move(index, { overwrite: true });
  } catch (error) {
    if (hadContent && (await readStored(indexFile())) === null) await rewindToPrevious(previous);
    throw error;
  }
}

let lastId = 0;

/**
 * A new note id (milliseconds since the epoch as a string). Never repeats within a session, even
 * for two calls in the same millisecond. Ids already stored are far older than now.
 */
export function newNoteId(): string {
  lastId = Math.max(lastId + 1, Date.now());
  return String(lastId);
}

/** Playable URI for one recording. */
export function recordingUri(recording: NoteRecording): string {
  const dir = recording.origin === 'legacy' ? new Directory(Paths.document, 'dreams') : audioDir();
  return new File(dir, recording.fileName).uri;
}

/** The notes, newest `updatedAt` first. Recently Deleted notes only with `includeDeleted`. */
export async function listNotes(opts?: { includeDeleted?: boolean }): Promise<Note[]> {
  const notes = await readIndex();
  const stamp = (n: Note) => (typeof n.updatedAt === 'string' ? n.updatedAt : '');
  return notes
    .filter((n) => opts?.includeDeleted === true || !isTrashed(n))
    .sort((a, b) => stamp(b).localeCompare(stamp(a)));
}

export type SaveNoteInput = {
  /** Plain id (letters, digits, `_`, `-`). A new id creates the note; a stored one updates it. */
  id: string;
  /** The body as typed (stored unchanged). */
  body: string;
  /**
   * Recordings to copy in and add to the note (after the ones it has). Each cache source is
   * deleted once the index is written. Each recording must be passed by exactly one save.
   */
  addRecordings?: NewRecording[];
  /**
   * Sets or replaces the `voiceTranscript` of stored recordings of this note, by file name. Every
   * name must belong to the note, else the save throws before anything changes. Metadata only.
   */
  recordingTexts?: { fileName: string; text: string }[];
};

/**
 * Autosave of a note's body (and new recordings). Order matters for safety: validate, copy the
 * audio (one file at a time, under free names), write the index (the commit), and only then delete
 * the cache sources, so a failure at any step leaves the recordings in place. A note in Recently
 * Deleted throws NOTE_IN_TRASH. An equal body with nothing to add writes nothing. A body that is
 * blank with no recording at all (held ones count) is empty: a new note is not created
 * (`{ note: null }`), a stored note is moved to Recently Deleted with its text kept.
 */
export async function saveNote(
  input: SaveNoteInput,
): Promise<{ note: Note | null; added: NoteRecording[] }> {
  // Validate before touching any file so a rejected save leaves the recording in place.
  const { id, body } = input;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('Invalid note id');
  if (typeof body !== 'string') throw new Error('A note body must be text');
  const additions = input.addRecordings ?? [];
  const storedDirs = [audioDir(), new Directory(Paths.document, 'dreams')].map((d) =>
    d.uri.endsWith('/') ? d.uri : `${d.uri}/`,
  );
  for (const add of additions) {
    // The source is deleted after the save, so a stored recording must never be passed in.
    if (typeof add.uri !== 'string' || storedDirs.some((prefix) => add.uri.startsWith(prefix))) {
      throw new Error('That file cannot be added as a new recording');
    }
  }

  return serialized(async () => {
    const notes = await readRawIndex(true);
    const existing = notes.find((n) => hasId(n) && n.id === id);
    if (existing && isTrashed(existing)) {
      throw coded('The note is in Recently Deleted', NOTE_IN_TRASH);
    }

    const current = existing ? storedRecordings(existing) : [];
    const texts = new Map<string, string>();
    for (const { fileName, text } of input.recordingTexts ?? []) {
      if (!current.some((r) => nameOf(r) === fileName)) {
        throw new Error('That recording does not belong to this note');
      }
      const clean = cleanVoiceTranscript(text);
      if (clean !== undefined) texts.set(fileName, clean);
    }
    const textsChanged = current.some((r) => {
      const name = nameOf(r);
      return typeof name === 'string' && texts.has(name) && texts.get(name) !== r.voiceTranscript;
    });

    if (existing && existing.body === body && additions.length === 0 && !textsChanged) {
      return { note: existing, added: [] };
    }

    const now = new Date().toISOString();
    if (body.trim() === '' && current.length === 0 && additions.length === 0) {
      if (!existing) return { note: null, added: [] };
      // Emptied: Recently Deleted, not gone. The stored text is kept so Restore brings it back.
      const trashed: Note = { ...existing, deletedAt: now };
      await commitIndex(
        notes.map((n) => (n === existing ? trashed : n)),
        notes,
      );
      return { note: trashed, added: [] };
    }

    for (const add of additions) {
      if (!new File(add.uri).exists) throw new Error('The recording could not be found');
    }

    // Copy one at a time under names nobody uses. The sources stay where they are until the index
    // is written. No overwrite option: a stale file can never be clobbered.
    const copies: File[] = [];
    const added: NoteRecording[] = [];
    const undoCopies = () => {
      for (const copy of copies) {
        try {
          if (copy.exists) copy.delete();
        } catch {
          // Leaving an orphaned copy is harmless.
        }
      }
    };
    if (additions.length > 0) {
      const dir = audioDir();
      dir.create({ intermediates: true, idempotent: true });
      const referenced = new Set<string>();
      for (const n of notes) {
        if (!hasId(n)) continue;
        for (const r of storedRecordings(n)) {
          const name = nameOf(r);
          if (typeof name === 'string' && r.origin !== 'legacy') referenced.add(name);
        }
      }
      for (const add of additions) {
        let name = `${id}.m4a`;
        for (let k = 1; new File(dir, name).exists || referenced.has(name); k += 1) {
          name = `${id}-${k}.m4a`;
        }
        const destination = new File(dir, name);
        try {
          await new File(add.uri).copy(destination);
        } catch (error) {
          // A failed copy can leave a partial file; it is ours (the name was free) and nothing
          // indexes it. Never touch the sources.
          copies.push(destination);
          undoCopies();
          throw error;
        }
        copies.push(destination);
        referenced.add(name);
        const waveform = sanitizeWaveform(add.waveform);
        const voiceTranscript = cleanVoiceTranscript(add.voiceTranscript);
        added.push({
          fileName: name,
          durationMs: Number.isFinite(add.durationMs) ? add.durationMs : 0,
          ...(waveform ? { waveform } : {}),
          ...(voiceTranscript !== undefined ? { voiceTranscript } : {}),
        });
      }
    }

    // Start from the stored note so fields this version does not know about survive an update.
    const note: Note = {
      ...existing,
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      body,
    };
    if (textsChanged || added.length > 0) {
      const kept = current.map((r) => {
        const name = nameOf(r);
        return typeof name === 'string' && texts.has(name)
          ? { ...r, voiceTranscript: texts.get(name) }
          : r;
      });
      note.recordings = [...kept, ...added];
    }

    const newList = existing ? notes.map((n) => (n === existing ? note : n)) : [...notes, note];
    try {
      await commitIndex(newList, notes);
    } catch (error) {
      // The recordings are still in the cache. Undo this save's own copies, then always rethrow
      // the original error.
      undoCopies();
      throw error;
    }

    for (const add of additions) {
      try {
        new File(add.uri).delete();
      } catch {
        // The note is saved; a leftover cache file is harmless.
      }
    }
    return { note, added };
  });
}

/**
 * Reads the stored note, applies `change` and commits. `change` returns null when there is nothing
 * to change (nothing is written). An unknown id throws NOTE_NOT_FOUND.
 */
function updateNote(id: string, change: (note: Note) => Note | null): Promise<Note> {
  return serialized(async () => {
    const notes = await readRawIndex(true);
    const existing = notes.find((n) => hasId(n) && n.id === id);
    if (!existing) throw coded('The note was not found', NOTE_NOT_FOUND);
    const next = change(existing);
    if (next === null) return existing;
    await commitIndex(
      notes.map((n) => (n === existing ? next : n)),
      notes,
    );
    return next;
  });
}

/** Moves a note to Recently Deleted: sets `deletedAt` in the index and deletes no file. */
export function softDeleteNote(id: string): Promise<Note> {
  return updateNote(id, (note) =>
    isTrashed(note) ? null : { ...note, deletedAt: new Date().toISOString() },
  );
}

/** Takes a note out of Recently Deleted. A note that is not there is returned unchanged. */
export function restoreNote(id: string): Promise<Note> {
  return updateNote(id, (note) => {
    if (!('deletedAt' in note)) return null;
    const { deletedAt: _unused, ...rest } = note;
    return rest;
  });
}

/** Pins or unpins a note. Does not change `updatedAt`; a trashed note keeps its pin. */
export function setPinned(id: string, pinned: boolean): Promise<Note> {
  return updateNote(id, (note) => {
    if (Boolean(note.pinned) === pinned) return null;
    if (pinned) return { ...note, pinned: true };
    const { pinned: _unused, ...rest } = note;
    return rest;
  });
}

/** Applies `change` to the stored recording; an unknown file name throws NOTE_NOT_FOUND. */
function updateRecording(
  id: string,
  fileName: string,
  change: (recording: NoteRecording) => NoteRecording | null,
): Promise<Note> {
  return updateNote(id, (note) => {
    const list = storedRecordings(note);
    const at = list.findIndex((r) => nameOf(r) === fileName);
    if (at < 0) throw coded('The recording was not found', NOTE_NOT_FOUND);
    const next = change(list[at]);
    if (next === null) return null;
    return { ...note, recordings: list.map((r, i) => (i === at ? next : r)) };
  });
}

/** Closes a voice note: marks it held (index only; no file is deleted). Already held = no change. */
export function holdRecording(id: string, fileName: string): Promise<Note> {
  return updateRecording(id, fileName, (r) =>
    typeof r.heldAt === 'string' ? null : { ...r, heldAt: new Date().toISOString() },
  );
}

/** Undoes a hold (index only). A recording that is not held is returned unchanged. */
export function releaseRecording(id: string, fileName: string): Promise<Note> {
  return updateRecording(id, fileName, (r) => {
    if (!('heldAt' in r)) return null;
    const { heldAt: _unused, ...rest } = r;
    return rest;
  });
}

/**
 * Adds notes read from the old store in one atomic write. A note whose id is already stored (or
 * repeated in `records`) is skipped, so running it again adds nothing. The given `createdAt` and
 * `updatedAt` are kept. Every id must be plain, else it throws before anything is written.
 */
export async function appendImported(records: Note[]): Promise<{ added: number }> {
  for (const record of records) {
    if (!hasId(record) || !ID_PATTERN.test(record.id)) throw new Error('Invalid note id');
  }
  return serialized(async () => {
    const notes = await readRawIndex(true);
    const known = new Set<string>(notes.filter(hasId).map((n) => n.id));
    const fresh: Note[] = [];
    for (const record of records) {
      if (known.has(record.id)) continue;
      known.add(record.id);
      fresh.push(record);
    }
    if (fresh.length === 0) return { added: 0 };
    await commitIndex([...notes, ...fresh], notes);
    return { added: fresh.length };
  });
}
