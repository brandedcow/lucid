import { Directory, File, Paths } from 'expo-file-system';
import { Dream, DreamDetails } from '../types/dream';
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

/** Playable URI for a dream's recording, or null when it has no audio. */
export function dreamAudioUri(dream: Dream): string | null {
  return dream.audioFileName ? new File(audioDir(), dream.audioFileName).uri : null;
}

/** All stored dreams, drafts included, newest first. */
export async function listDreams(): Promise<Dream[]> {
  const dreams = await readIndex();
  return dreams.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Every tag in use, most used first, for suggestions. */
export async function listTags(): Promise<string[]> {
  const counts = new Map<string, number>();
  for (const dream of await readIndex()) {
    for (const tag of dream.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
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

export type SaveDreamInput = {
  /** Existing dream to update. Omit to create one. */
  id?: string;
  /** A finished recording to copy into permanent storage (the original is deleted once saved) (only used if the dream has no audio yet). */
  recordingUri?: string;
  durationMs?: number;
  /**
   * Loudness peaks (0..1) of `recordingUri`, stored with the recording when it is copied in. An
   * invalid list is dropped (the entry still saves). Ignored when no recording is copied.
   */
  waveform?: number[];
  details: DreamDetails;
  /** 'saved' needs a title; 'draft' does not. */
  status: 'draft' | 'saved';
  /** Journal for a NEW entry (default 'dreams'). Ignored on update: an entry never changes journal. */
  journalId?: JournalId;
  /** Whether finishing needs a title (default true). Callers pass false for journals with optional titles. */
  requireTitle?: boolean;
};

/**
 * Creates or updates a dream (by id), copying the recording into permanent storage the first time.
 * Order matters for safety: copy the audio, back up and write the index, and only then delete the
 * original, so a failure at any step leaves the recording in place.
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

    let audioFileName = existing?.audioFileName;
    let copied: File | null = null;
    if (input.recordingUri && !audioFileName) {
      const source = new File(input.recordingUri);
      if (!source.exists) throw new Error('The recording could not be found');
      const dir = audioDir();
      dir.create({ intermediates: true, idempotent: true });
      // Never reuse a name that is already taken (an orphan from an earlier failed save, say).
      let name = `${id}.m4a`;
      for (let k = 1; new File(dir, name).exists; k += 1) name = `${id}-${k}.m4a`;
      audioFileName = name;
      const destination = new File(dir, name);
      // The recording stays where it is until the index is written. No overwrite option: a stale
      // file can never be clobbered.
      try {
        await source.copy(destination);
      } catch (error) {
        // A failed copy can leave a partial file; it is ours (the name was free) and nothing
        // indexes it. Never touch the source.
        try {
          if (destination.exists) destination.delete();
        } catch {
          // Leaving it is harmless; the copy error is what matters.
        }
        throw error;
      }
      copied = destination;
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
      ...(audioFileName ? { audioFileName } : {}),
      title,
      tags: details.tags,
    };
    // Only a new record is stamped; an existing one keeps whatever it stored (even nothing).
    if (!existing) dream.journalId = input.journalId ?? DREAMS_JOURNAL;
    if (emotion) dream.emotion = emotion;
    else delete dream.emotion;
    if (transcript) dream.transcript = transcript;
    else delete dream.transcript;
    if (status === 'draft') dream.status = 'draft';
    else delete dream.status;
    // The waveform belongs to the recording copied in by this save; an existing entry keeps its
    // own. Whatever ends up stored is valid or absent.
    if (copied) {
      const waveform = sanitizeWaveform(input.waveform);
      if (waveform) dream.waveform = waveform;
      else delete dream.waveform;
    } else if ('waveform' in dream && !isValidWaveform(dream.waveform)) delete dream.waveform;

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

    try {
      writeIndex(existing ? dreams.map((d) => (d === existing ? dream : d)) : [...dreams, dream]);
    } catch (error) {
      // The recording is still in the cache. Undo this save's side effects, each step on its own,
      // then always rethrow the original error.
      if (copied) {
        try {
          if (copied.exists) copied.delete();
        } catch {
          // Leaving an orphaned copy is harmless.
        }
      }
      await repairIndex(index, dreams, hadContent, backedUp);
      throw error;
    }

    if (input.recordingUri && copied) {
      try {
        new File(input.recordingUri).delete();
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

/** The audio file to delete for this dream, or null when it has none or the name is not safe. */
function deletableAudio(dream: Dream, dreams: Dream[]): File | null {
  const name = dream.audioFileName;
  // A plain file name only: no separators, parent references, scheme or URI escapes.
  if (!name || !/^[^/\\:%]+$/.test(name) || name.includes('..') || name === '.') return null;
  if (dreams.some((d) => d !== dream && d.audioFileName === name)) return null;
  const dir = audioDir();
  const file = new File(dir, name);
  const prefix = dir.uri.endsWith('/') ? dir.uri : `${dir.uri}/`;
  return file.uri.startsWith(prefix) ? file : null;
}

/** Titles and transcripts shorter than this are too common to identify a dream by. */
const MIN_TEXT_NEEDLE = 8;

/** Read-only: does this text hold anything that identifies the dream (id, audio name, text)? */
function mentionsDream(text: string, dream: Dream): boolean {
  const needles = [JSON.stringify(dream.id)];
  if (dream.audioFileName) needles.push(JSON.stringify(dream.audioFileName));
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
    const audio = deletableAudio(dream, dreams);
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
    // A missing file counts as deleted (an earlier attempt got this far).
    if (audio?.exists) audio.delete();

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
