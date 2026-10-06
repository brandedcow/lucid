import { Directory, File, Paths } from 'expo-file-system';
import { Dream, DreamDetails } from '../types/dream';
import { splitEmotions } from '../utils/emotions';

// Paths.document can change between app updates on iOS, so resolve it on every call
// and persist only file names.
const audioDir = () => new Directory(Paths.document, 'dreams');
const indexFile = () => new File(Paths.document, 'dreams.json');

/** The index exactly as stored. A missing file is empty; an unreadable one is kept and reported. */
async function readRawIndex(): Promise<Dream[]> {
  const file = indexFile();
  if (!file.exists) return [];
  try {
    const dreams = await file.json();
    if (!Array.isArray(dreams)) throw new Error('Index is not a list');
    return dreams as Dream[];
  } catch {
    // Keep a copy for recovery and refuse to continue: writing now would overwrite the dreams.
    try {
      file.copy(new File(Paths.document, `dreams.corrupt-${Date.now()}.json`));
    } catch {
      // The original is still untouched; the error below is what matters.
    }
    throw new Error('The dream index could not be read');
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

function writeIndex(dreams: Dream[]) {
  const file = indexFile();
  // Write in place: truncating first would lose the index if the write then failed.
  if (!file.exists) file.create();
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
  /** A finished recording to move into permanent storage (only used if the dream has no audio yet). */
  recordingUri?: string;
  durationMs?: number;
  details: DreamDetails;
  /** 'saved' needs a title; 'draft' does not. */
  status: 'draft' | 'saved';
};

/** Creates or updates a dream (by id), moving the recording into permanent storage the first time. */
export async function saveDream(input: SaveDreamInput): Promise<Dream> {
  const { details, status } = input;
  // Validate before touching any file so a rejected save leaves the recording in place.
  const title = details.title.trim();
  if (status === 'saved' && !title) throw new Error('A title is required');

  return serialized(async () => {
    const dreams = await readRawIndex();
    const existing = input.id ? dreams.find((d) => d.id === input.id) : undefined;

    let id = input.id;
    if (!id) {
      let n = Date.now();
      while (dreams.some((d) => d.id === String(n))) n += 1;
      id = String(n);
    }

    let audioFileName = existing?.audioFileName;
    let moved: { from: string; to: File } | null = null;
    if (input.recordingUri && !audioFileName) {
      const dir = audioDir();
      dir.create({ intermediates: true, idempotent: true });
      audioFileName = `${id}.m4a`;
      const destination = new File(dir, audioFileName);
      new File(input.recordingUri).move(destination);
      moved = { from: input.recordingUri, to: destination };
    }

    const emotion = details.emotion?.trim();
    const transcript = details.transcript?.trim();
    const dream: Dream = {
      id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      durationMs: input.durationMs ?? existing?.durationMs ?? 0,
      ...(audioFileName ? { audioFileName } : {}),
      title,
      ...(emotion ? { emotion } : {}),
      tags: details.tags,
      ...(transcript ? { transcript } : {}),
      ...(status === 'draft' ? { status: 'draft' as const } : {}),
    };

    try {
      writeIndex(existing ? dreams.map((d) => (d === existing ? dream : d)) : [...dreams, dream]);
    } catch (error) {
      // Put the recording back so the user keeps it.
      if (moved) new File(moved.to.uri).move(new File(moved.from));
      throw error;
    }
    return dream;
  });
}

/** Deletes a recording that was never saved. Only for the cache file of the current recording. */
export function discardRecording(recordingUri: string) {
  const file = new File(recordingUri);
  if (file.exists) file.delete();
}
