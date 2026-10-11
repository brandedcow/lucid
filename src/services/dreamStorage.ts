import { Directory, File, Paths } from 'expo-file-system';
import { Dream, DreamDetails, StoredRecording, recordingsOf } from '../types/dream';
import { DREAMS_JOURNAL, JournalId } from '../types/entry';
import { splitEmotions } from '../utils/emotions';
import { isValidWaveform, sanitizeWaveform } from '../utils/waveform';

// Paths.document can change between app updates on iOS, so resolve it on every call
// and persist only file names.
const audioDir = () => new Directory(Paths.document, 'dreams');
const indexFile = () => new File(Paths.document, 'dreams.json');

// The corrupt index is copied at most once per app session, so repeated failing saves do not
// pile up copies. Any good read clears this.
let corruptCopied = false;

/** Test-only: forget that a corrupt index was already copied this session. */
export function resetCorruptCopyGuard() {
  corruptCopied = false;
}

/** `error.code` of the failure thrown when dreams.json exists but cannot be read. */
export const INDEX_UNREADABLE = 'INDEX_UNREADABLE';

/** True for the error saveDream throws when the stored index is unreadable. */
export function isIndexUnreadableError(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === INDEX_UNREADABLE;
}

const backupFile = () => new File(Paths.document, 'dreams.json.bak');

/** The backup's dreams, but only when it holds at least one; anything else is no base at all. */
async function readBackup(): Promise<Dream[]> {
  try {
    const backup = backupFile();
    if (!backup.exists) return [];
    const dreams: unknown = await backup.json();
    return Array.isArray(dreams) && dreams.length > 0 ? (dreams as Dream[]) : [];
  } catch {
    return [];
  }
}

/**
 * The index exactly as stored. A missing or zero-length file (what a failed first write can leave)
 * is empty, except that a non-empty backup is then the base so its dreams are neither hidden nor
 * dropped; nothing is written until a normal save. An unreadable one is kept and reported.
 * Only the save path asks for a recovery copy (`copyCorrupt`); displaying never writes.
 */
async function readRawIndex(copyCorrupt = false): Promise<Dream[]> {
  const file = indexFile();
  if (!file.exists || file.size === 0) {
    corruptCopied = false;
    return readBackup();
  }
  let dreams: unknown;
  try {
    dreams = await file.json();
    if (!Array.isArray(dreams)) throw new Error('Index is not a list');
  } catch {
    // Keep a copy for recovery and refuse to continue: writing now would overwrite the dreams.
    if (copyCorrupt && !corruptCopied) {
      corruptCopied = true;
      try {
        await file.copy(new File(Paths.document, `dreams.corrupt-${Date.now()}.json`));
      } catch {
        // The original is still untouched; the error below is what matters.
      }
    }
    throw Object.assign(new Error('The dream index could not be read'), {
      code: INDEX_UNREADABLE,
    });
  }
  corruptCopied = false;
  return dreams as Dream[];
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
async function readIndex(): Promise<Dream[]> {
  try {
    const dreams = await readRawIndex();
    // Entries saved before titles and tags existed lack those fields. A missing journalId is NOT
    // filled in: it stays absent and reads as 'dreams' wherever journals are matched
    // (`entriesFor`), so display never differs from storage and the save path (raw index) never
    // stamps it onto an old record.
    return dreams.map((d) => {
      const dream: Dream = { ...d, title: d.title ?? '', tags: d.tags ?? [] };
      // An unusable waveform is ignored for display; the stored record is left alone.
      if ('waveform' in dream && !isValidWaveform(dream.waveform)) delete dream.waveform;
      // Same for each recording's waveform; the rest of the list is left as stored.
      if (Array.isArray(dream.recordings)) {
        dream.recordings = dream.recordings.map((r) => {
          if (typeof r !== 'object' || r === null || !('waveform' in r)) return r;
          if (isValidWaveform(r.waveform)) return r;
          const { waveform: _unused, ...rest } = r;
          return rest;
        });
      }
      return dream;
    });
  } catch {
    return [];
  }
}

/** Whether the index file exists, is not zero-length and parses to a list. Never throws. */
async function indexIsIntact(file: File): Promise<boolean> {
  try {
    if (!file.exists || file.size === 0) return false;
    return Array.isArray(await file.json());
  } catch {
    return false;
  }
}

function writeIndex(dreams: Dream[]) {
  const file = indexFile();
  // Write creates a missing file itself; a separate create() would only add an empty-file window.
  file.write(JSON.stringify(dreams));
}

/**
 * After a failed index write: undo what the failure left behind, each step on its own. An index
 * that is still intact is never touched. With prior content, rewrite the in-memory list first, then
 * copy the backup back; without any, remove a zero-length or partial leftover so reads fall back to
 * the backup base or an empty list. Never throws.
 */
async function repairIndex(index: File, dreams: Dream[], hadContent: boolean, backedUp: boolean) {
  if (hadContent) {
    if (await indexIsIntact(index)) return;
    try {
      writeIndex(dreams);
    } catch {
      // Fall through to the backup.
    }
    if (backedUp && !(await indexIsIntact(index))) {
      try {
        await backupFile().copy(index, { overwrite: true });
      } catch {
        // Unrepaired: an empty index reads as missing, a partial one as unreadable.
      }
    }
  } else if (index.exists) {
    // A missing or zero-length index: remove what the failed write left, so reads fall back
    // to the backup base or an empty list.
    try {
      index.delete();
    } catch {
      // A leftover empty index is read as missing.
    }
  }
}

// Index writes run one at a time so two saves can never read the same index and drop an entry.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

/** Playable URI for one recording. */
export function recordingUri(recording: StoredRecording): string {
  return new File(audioDir(), recording.fileName).uri;
}

/** Playable URI for a dream's (first) recording, or null when it has no audio. */
export function dreamAudioUri(dream: Dream): string | null {
  const [first] = recordingsOf(dream);
  return first ? recordingUri(first) : null;
}

/** All stored dreams, drafts included, newest first. */
export async function listDreams(): Promise<Dream[]> {
  const dreams = await readIndex();
  return dreams.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Every emotion word in use (drafts included), most used first, for suggestions. */
export async function listEmotions(): Promise<string[]> {
  const counts = new Map<string, number>();
  for (const dream of await readIndex()) {
    for (const word of splitEmotions(dream.emotion ?? '')) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);
}

/** A finished recording to copy from the cache into permanent storage when saving. */
export type NewRecording = {
  uri: string;
  durationMs: number;
  /** Loudness peaks (0..1); an invalid list is dropped (the recording still saves). */
  waveform?: number[];
};

export type SaveDreamInput = {
  /** Existing dream to update. Omit to create one. */
  id?: string;
  /**
   * Single-recording input, kept for existing callers: a finished recording to copy into
   * permanent storage (the original is deleted once saved). Only used when the entry has no
   * recording left after removals; otherwise ignored. Prefer `addRecordings`.
   */
  recordingUri?: string;
  durationMs?: number;
  /**
   * Loudness peaks (0..1) of `recordingUri`, stored with the recording when it is copied in. An
   * invalid list is dropped (the entry still saves). Ignored when no recording is copied.
   */
  waveform?: number[];
  /**
   * Recordings to copy in and add to the entry (after the ones it keeps). Each source is deleted
   * once the index is written. No cap.
   */
  addRecordings?: NewRecording[];
  /**
   * Stored file names of this entry's recordings to forget (the entry itself is kept). Every name
   * must belong to the entry, else the save throws before anything changes. Each file is deleted
   * after the index is written without it (CLAUDE.md deletion case 5).
   */
  removeRecordings?: string[];
  details: DreamDetails;
  /** 'saved' needs a title; 'draft' does not. */
  status: 'draft' | 'saved';
  /** Journal for a NEW entry (default 'dreams'). Ignored on update: an entry never changes journal. */
  journalId?: JournalId;
  /** Whether finishing needs a title (default true). Callers pass false for journals with optional titles. */
  requireTitle?: boolean;
  /**
   * Forget ALL stored recordings of the entry being updated (the entry itself is kept); same as
   * listing every one in `removeRecordings`. Ignored when the entry has none. Added recordings in
   * the same call are kept.
   */
  removeAudio?: boolean;
};

/**
 * Creates or updates a dream (by id), copying new recordings into permanent storage. Order matters
 * for safety: copy the audio (one file at a time, under free names), back up and write the index
 * (the commit), then rewrite the backup and delete removed files, and only then delete the
 * originals, so a failure at any step leaves the recordings in place.
 */
export async function saveDream(input: SaveDreamInput): Promise<Dream> {
  const { details, status } = input;
  // Validate before touching any file so a rejected save leaves the recording in place.
  const title = details.title.trim();
  if (status === 'saved' && (input.requireTitle ?? true) && !title)
    throw new Error('A title is required');

  return serialized(async () => {
    const dreams = await readRawIndex(true);
    const existing = input.id ? dreams.find((d) => d.id === input.id) : undefined;
    if (input.id && !existing) throw new Error('Dream not found');

    let id = input.id;
    if (!id) {
      let n = Date.now();
      while (dreams.some((d) => d.id === String(n))) n += 1;
      id = String(n);
    }

    // Which stored recordings go: all of them (removeAudio) or the named ones. Unknown names throw
    // before any file is touched.
    const current = existing ? recordingsOf(existing) : [];
    const removeNames = new Set<string>(
      input.removeAudio === true ? current.map((r) => r.fileName) : [],
    );
    for (const name of input.removeRecordings ?? []) {
      if (!current.some((r) => r.fileName === name)) {
        throw new Error('That recording does not belong to this entry');
      }
      removeNames.add(name);
    }
    const removed = current.filter((r) => removeNames.has(r.fileName));
    const kept = current.filter((r) => !removeNames.has(r.fileName));

    // The recordings to copy in. The single-recording input only counts when none is kept.
    const additions: NewRecording[] = [];
    if (input.recordingUri && kept.length === 0) {
      additions.push({
        uri: input.recordingUri,
        durationMs: input.durationMs ?? 0,
        waveform: input.waveform,
      });
    }
    additions.push(...(input.addRecordings ?? []));
    for (const add of additions) {
      if (!new File(add.uri).exists) throw new Error('The recording could not be found');
    }

    // Copy one at a time under names nobody uses. The sources stay where they are until the index
    // is written. No overwrite option: a stale file can never be clobbered.
    const copies: File[] = [];
    const added: StoredRecording[] = [];
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
      const referenced = new Set<string>(kept.map((r) => r.fileName));
      for (const d of dreams) {
        if (d !== existing) for (const r of recordingsOf(d)) referenced.add(r.fileName);
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
        added.push({
          fileName: name,
          durationMs: Number.isFinite(add.durationMs) ? add.durationMs : 0,
          ...(waveform ? { waveform } : {}),
        });
      }
    }

    // undefined keeps the stored value on update; '' clears it. On create, omitted means none.
    const emotion = details.emotion === undefined ? existing?.emotion : details.emotion.trim();
    const transcript =
      details.transcript === undefined ? existing?.transcript : details.transcript.trim();
    // Start from the stored entry so fields this version does not know about survive an update.
    const dream: Dream = {
      ...existing,
      id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      durationMs: input.durationMs ?? existing?.durationMs ?? 0,
      title,
      tags: details.tags,
    };
    if (removed.length > 0 || added.length > 0) {
      // The recordings changed: the list becomes the truth (a legacy entry converts here) and its
      // first recording is mirrored into the legacy fields for older builds.
      const list = [...kept, ...added];
      delete dream.audioFileName;
      delete dream.waveform;
      delete dream.recordings;
      dream.durationMs = 0;
      if (list.length > 0) {
        const [first] = list;
        dream.recordings = list;
        dream.audioFileName = first.fileName;
        dream.durationMs = first.durationMs;
        if (first.waveform) dream.waveform = first.waveform;
      }
    } else if ('waveform' in dream && !isValidWaveform(dream.waveform)) {
      // The recordings are untouched; an unusable legacy waveform is dropped.
      delete dream.waveform;
    }
    // Only a new record is stamped; an existing one keeps whatever it stored (even nothing).
    if (!existing) dream.journalId = input.journalId ?? DREAMS_JOURNAL;
    if (emotion) dream.emotion = emotion;
    else delete dream.emotion;
    if (transcript) dream.transcript = transcript;
    else delete dream.transcript;
    if (status === 'draft') dream.status = 'draft';
    else delete dream.status;

    // Files to delete after the commit, judged now: never one that another record, or a recording
    // this entry keeps or adds, still references (the new record is among the "others" here).
    let removedFiles: File[] = [];
    if (existing && removed.length > 0) {
      const leaving: Dream = { ...existing, recordings: removed };
      delete leaving.audioFileName;
      removedFiles = deletableAudioFiles(leaving, [
        leaving,
        ...dreams.filter((d) => d !== existing),
        dream,
      ]);
    }

    // Best effort: keep the previous index. Not atomic with the write below (the overwrite copy
    // removes the old backup first). A zero-length index is never copied over the backup.
    const index = indexFile();
    const hadIndex = index.exists;
    const hadContent = hadIndex && index.size !== 0;
    let backedUp = false;
    if (hadContent) {
      try {
        await index.copy(backupFile(), { overwrite: true });
        backedUp = true;
      } catch {
        // Policy A: a missing backup does not block saving; a failed write is repaired from
        // memory below. Policy B (refuse to save without a backup) is this one inactive line:
        // throw new Error('The dream index could not be backed up');
      }
    }

    const newList = existing ? dreams.map((d) => (d === existing ? dream : d)) : [...dreams, dream];
    try {
      writeIndex(newList);
    } catch (error) {
      // The recordings are still in the cache. Undo this save's side effects, each step on its
      // own, then always rethrow the original error.
      undoCopies();
      await repairIndex(index, dreams, hadContent, backedUp);
      throw error;
    }

    if (removed.length > 0) {
      // Only now that the index no longer names the files: scrub the backup (which still holds the
      // previous index), then delete the files one by one. Never write a zero-length backup.
      try {
        backupFile().write(JSON.stringify(newList));
      } catch {
        try {
          if (backupFile().exists) backupFile().delete();
        } catch {
          // Nothing more to do; the files are deleted below either way.
        }
      }
      for (const file of removedFiles) {
        try {
          if (file.exists) file.delete();
        } catch {
          // The entry is saved without the recording; an orphaned file is accepted.
        }
      }
    }

    for (const add of additions) {
      try {
        new File(add.uri).delete();
      } catch {
        // The dream is saved; a leftover cache file is harmless.
      }
    }
    return dream;
  });
}

/** `error.code` of the failure thrown when a safety copy holds other dreams or cannot be read. */
export const SAFETY_COPY_HOLDS_OTHER_DREAMS = 'SAFETY_COPY_HOLDS_OTHER_DREAMS';

/** True for the error deleteDream throws when it refuses to touch a safety copy. */
export function isSafetyCopyBlockedError(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === SAFETY_COPY_HOLDS_OTHER_DREAMS;
}

const CORRUPT_COPY_NAME = /^dreams\.corrupt-\d+\.json$/;

/**
 * The files to delete with this record: one per recording whose stored name is plain, resolves
 * inside the dreams directory and is used by no recording of any OTHER record. Failing names are
 * skipped.
 */
export function deletableAudioFiles(dream: Dream, dreams: Dream[]): File[] {
  const others = new Set<string>();
  for (const d of dreams) {
    if (d === dream) continue;
    for (const r of recordingsOf(d)) others.add(r.fileName);
  }
  const dir = audioDir();
  const prefix = dir.uri.endsWith('/') ? dir.uri : `${dir.uri}/`;
  const files: File[] = [];
  const seen = new Set<string>();
  for (const { fileName: name } of recordingsOf(dream)) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (!/^[^/\\:%]+$/.test(name) || name.includes('..') || name === '.') continue;
    if (others.has(name)) continue;
    const file = new File(dir, name);
    if (file.uri.startsWith(prefix)) files.push(file);
  }
  return files;
}

/** Titles and transcripts shorter than this are too common to identify a dream by. */
const MIN_TEXT_NEEDLE = 8;

/** Read-only: does this text hold anything that identifies the dream (id, audio name, text)? */
function mentionsDream(text: string, dream: Dream): boolean {
  const needles = [JSON.stringify(dream.id)];
  const names = new Set(recordingsOf(dream).map((r) => r.fileName));
  if (dream.audioFileName) names.add(dream.audioFileName);
  for (const name of names) needles.push(JSON.stringify(name));
  for (const value of [dream.title, dream.transcript]) {
    if (value && value.trim().length >= MIN_TEXT_NEEDLE) needles.push(JSON.stringify(value));
  }
  return needles.some((needle) => text.includes(needle));
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const isDelimiter = (c: string | undefined) =>
  c === undefined || isSpace(c) || c === ',' || c === ']' || c === '}';

/** Deepest container nesting a safety copy may have; deeper text is not worth proving. */
const MAX_JSON_DEPTH = 100;

const NUMBER_PREFIX = /-?(?:0|[1-9][0-9]*)?(?:\.[0-9]*)?(?:[eE][+-]?[0-9]*)?/y;
const NUMBER_STRICT = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const LITERALS = ['true', 'false', 'null'];

/**
 * Reads a string token starting at the opening quote. Returns the index after the closing quote,
 * 'cut' when the text ends inside the string (a partial escape counts, if what is there is valid),
 * or null when the string is malformed.
 */
function readString(text: string, start: number): number | 'cut' | null {
  const n = text.length;
  for (let i = start + 1; i < n; i++) {
    const c = text[i];
    if (c === '"') return i + 1;
    if (c < ' ') return null; // raw control character
    if (c !== '\\') continue;
    i++;
    if (i >= n) return 'cut';
    if ('"\\/bfnrt'.includes(text[i])) continue;
    if (text[i] !== 'u') return null;
    for (let k = 1; k <= 4; k++) {
      if (i + k >= n) return 'cut';
      if (!/[0-9a-fA-F]/.test(text[i + k])) return null;
    }
    i += 4;
  }
  return 'cut';
}

/** Reads a number or literal at `start`: the end index, 'cut' when the text ends in it, or null. */
function readScalar(text: string, start: number): number | 'cut' | null {
  const n = text.length;
  for (const literal of LITERALS) {
    if (text.startsWith(literal, start)) {
      const end = start + literal.length;
      return isDelimiter(text[end]) ? end : null;
    }
    if (n - start < literal.length && literal.startsWith(text.slice(start))) return 'cut';
  }
  NUMBER_PREFIX.lastIndex = start;
  const prefix = NUMBER_PREFIX.exec(text)?.[0] ?? '';
  if (prefix === '') return null;
  if (start + prefix.length === n) {
    // Ends at the end of the text: a partial number such as "-", "1." or "1e+" is fine.
    return prefix === '-' || /^-?[0-9]/.test(prefix) ? 'cut' : null;
  }
  NUMBER_STRICT.lastIndex = start;
  const whole = NUMBER_STRICT.exec(text);
  if (!whole) return null;
  const end = start + whole[0].length;
  return isDelimiter(text[end]) ? end : null;
}

type ScanState =
  | 'start'
  | 'arrayFirst' // after "[": a value or "]"
  | 'arrayValue' // after ",": a value
  | 'arrayNext' // after a value: "," or "]"
  | 'objectFirst' // after "{": a key or "}"
  | 'objectKey' // after ",": a key
  | 'objectColon'
  | 'objectValue'
  | 'objectNext' // after a value: "," or "}"
  | 'done';

/**
 * Strict check that `raw` is a PREFIX of a valid JSON array of records, and the id of every record
 * in it; null when that cannot be proven. Unlike a heuristic scan it never skips over malformed
 * text, so a damaged middle cannot hide a later record. It accepts only a clean cut (anywhere,
 * even mid-token) and trailing NULs, and requires every record's id string to be complete. An id
 * is identified by position alone: the "id" key of an object directly inside the top-level array.
 * Duplicate keys, non-object elements, non-string ids and nesting past MAX_JSON_DEPTH are rejected.
 */
function strictIds(raw: string): string[] | null {
  // Strip a trailing run of NULs with a linear scan (a `/\u0000+$/` regex is quadratic when the run is not at the end).
  let end = raw.length;
  while (end > 0 && raw.charCodeAt(end - 1) === 0) end--;
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1, end) : raw.slice(0, end);
  const n = text.length;
  const stack: ('a' | 'o')[] = [];
  const found: string[] = [];
  let state = 'start' as ScanState; // also set by the closures below
  let records = 0;
  let current: string | null = null; // id of the record being read, once complete
  let key: string | null = null;
  let i = 0;

  const afterValue = () => {
    state = stack[stack.length - 1] === 'a' ? 'arrayNext' : 'objectNext';
  };
  /** Pops the container being closed; false when that closes a record that has no id. */
  const closeContainer = () => {
    const kind = stack.pop();
    if (kind === 'o' && stack.length === 1) {
      if (current === null) return false;
      current = null;
    }
    if (stack.length === 0) state = 'done';
    else afterValue();
    return true;
  };

  while (true) {
    while (i < n && isSpace(text[i])) i++;
    if (i >= n) break; // a prefix: the text may end in any state
    const c = text[i];
    if (state === 'start') {
      if (c !== '[') return null;
      stack.push('a');
      state = 'arrayFirst';
      i++;
    } else if (state === 'done') {
      return null; // content after the array
    } else if (state === 'objectFirst' || state === 'objectKey') {
      if (state === 'objectFirst' && c === '}') {
        if (!closeContainer()) return null;
        i++;
        continue;
      }
      if (c !== '"') return null;
      const end = readString(text, i);
      if (end === null) return null;
      if (end === 'cut') break;
      key = JSON.parse(text.slice(i, end)) as string;
      i = end;
      state = 'objectColon';
    } else if (state === 'objectColon') {
      if (c !== ':') return null;
      state = 'objectValue';
      i++;
    } else if (state === 'arrayNext' || state === 'objectNext') {
      if (c === ',') {
        state = state === 'arrayNext' ? 'arrayValue' : 'objectKey';
      } else if (c === (state === 'arrayNext' ? ']' : '}')) {
        if (!closeContainer()) return null;
      } else {
        return null; // missing comma, or a closer of the wrong kind
      }
      i++;
    } else {
      // A value position: arrayFirst, arrayValue or objectValue.
      if (state === 'arrayFirst' && c === ']') {
        if (!closeContainer()) return null;
        i++;
        continue;
      }
      const depth = stack.length;
      if (state === 'objectValue' && depth === 2 && key === 'id') {
        if (current !== null || c !== '"') return null; // duplicate id, or not a string
        const end = readString(text, i);
        if (end === null) return null;
        if (end === 'cut') break; // the id is not complete
        current = JSON.parse(text.slice(i, end)) as string;
        found.push(current);
        i = end;
        afterValue();
        continue;
      }
      if (depth === 1 && c !== '{') return null; // top-level elements must be records
      if (c === '{' || c === '[') {
        if (depth >= MAX_JSON_DEPTH) return null;
        if (depth === 1) {
          records++;
          current = null;
        }
        stack.push(c === '{' ? 'o' : 'a');
        state = c === '{' ? 'objectFirst' : 'arrayFirst';
        i++;
      } else {
        const end = c === '"' ? readString(text, i) : readScalar(text, i);
        if (end === null) return null;
        if (end === 'cut') break;
        i = end;
        afterValue();
      }
    }
  }

  if (state === 'start') return null; // nothing but BOM, space or NULs
  if (stack.length >= 2 && current === null) return null; // cut before the record's id completed
  return found.length === records ? found : null;
}

/**
 * Read-only: the id of EVERY record in a safety copy, or null when the copy cannot be fully
 * accounted for (not a record array, malformed anywhere, a record without a string id, or cut
 * off before an id completed). Exported for tests.
 */
export function accountedIds(text: string): string[] | null {
  return strictIds(text);
}

/**
 * Permanently deletes one dream, scrubbing first and committing last so no copy of its text or
 * audio lingers and no other dream can be lost. Order: classify the safety copies (read-only,
 * refusing when one holds the dream next to dreams the index lacks), scrub the backup, delete the
 * pure-duplicate copies, delete the audio, and only then write the index without the dream. Every
 * step before the last is idempotent, so a failure or crash leaves the dream listed and a retry
 * finishes the job. An unknown id is a no-op.
 */
export async function deleteDream(id: string): Promise<void> {
  return serialized(async () => {
    const dreams = await readRawIndex();
    const dream = dreams.find((d) => d.id === id);
    if (!dream) return;
    const remaining = dreams.filter((d) => d !== dream);
    const audio = deletableAudioFiles(dream, dreams);
    const index = indexFile();
    const hadContent = index.exists && index.size !== 0;

    // Classify every safety copy before changing anything, so a refusal leaves everything as is.
    const live = new Set(dreams.map((d) => d.id));
    const duplicates: File[] = [];
    for (const entry of new Directory(Paths.document).list()) {
      if (!(entry instanceof File)) continue;
      if (!CORRUPT_COPY_NAME.test(entry.uri.slice(entry.uri.lastIndexOf('/') + 1))) continue;
      let text: string;
      try {
        text = await entry.text();
      } catch {
        throw Object.assign(new Error('A safety copy could not be read'), {
          code: SAFETY_COPY_HOLDS_OTHER_DREAMS,
        });
      }
      if (!mentionsDream(text, dream)) continue;
      const accounted = accountedIds(text);
      if (accounted === null || !accounted.every((found) => live.has(found))) {
        throw Object.assign(new Error('A safety copy holds this dream next to other dreams'), {
          code: SAFETY_COPY_HOLDS_OTHER_DREAMS,
        });
      }
      duplicates.push(entry);
    }

    // The backup must not hold the dream either. Never write a zero-length file: it reads as missing.
    let backedUp = false;
    try {
      backupFile().write(JSON.stringify(remaining));
      backedUp = true;
    } catch {
      // Removing the backup scrubs it just as well; if neither works, stop before changing more.
      if (backupFile().exists) backupFile().delete();
    }

    for (const copy of duplicates) copy.delete();
    // A missing file counts as deleted (an earlier attempt got this far). A failing delete throws
    // here, before the index write, so a retry finishes the job.
    for (const file of audio) if (file.exists) file.delete();

    // The commit.
    try {
      writeIndex(remaining);
    } catch (error) {
      await repairIndex(index, dreams, hadContent, backedUp);
      throw error;
    }
  });
}

/** Deletes a recording that was never saved. Only for the cache file of the current recording. */
export function discardRecording(recordingUri: string) {
  const file = new File(recordingUri);
  if (file.exists) file.delete();
}
