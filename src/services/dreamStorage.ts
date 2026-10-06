import { Directory, File, Paths } from 'expo-file-system';
import { Dream, DreamDetails } from '../types/dream';
import { splitEmotions } from '../utils/emotions';

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
    // Entries saved before titles and tags existed lack those fields.
    return dreams.map((d) => ({ ...d, title: d.title ?? '', tags: d.tags ?? [] }));
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
  details: DreamDetails;
  /** 'saved' needs a title; 'draft' does not. */
  status: 'draft' | 'saved';
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
  if (status === 'saved' && !title) throw new Error('A title is required');

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
    if (emotion) dream.emotion = emotion;
    else delete dream.emotion;
    if (transcript) dream.transcript = transcript;
    else delete dream.transcript;
    if (status === 'draft') dream.status = 'draft';
    else delete dream.status;

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
      if (hadContent) {
        // Repair from the in-memory pre-save list first, then from the backup. An index that is
        // still intact is never touched.
        if (!(await indexIsIntact(index))) {
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

/** Deletes a recording that was never saved. Only for the cache file of the current recording. */
export function discardRecording(recordingUri: string) {
  const file = new File(recordingUri);
  if (file.exists) file.delete();
}
