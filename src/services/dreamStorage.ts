import { Directory, File, Paths } from 'expo-file-system';
import { Dream, DreamDetails } from '../types/dream';

// Paths.document can change between app updates on iOS, so resolve it on every call
// and persist only file names.
const audioDir = () => new Directory(Paths.document, 'dreams');
const indexFile = () => new File(Paths.document, 'dreams.json');

async function readIndex(): Promise<Dream[]> {
  const file = indexFile();
  if (!file.exists) return [];
  try {
    const dreams = (await file.json()) as Dream[];
    // Entries saved before titles and tags existed lack those fields.
    return dreams.map((d) => ({ ...d, title: d.title ?? '', tags: d.tags ?? [] }));
  } catch {
    return [];
  }
}

function writeIndex(dreams: Dream[]) {
  const file = indexFile();
  file.create({ overwrite: true });
  file.write(JSON.stringify(dreams));
}

/** Playable URI for a saved dream's recording. */
export function dreamAudioUri(dream: Dream): string {
  return new File(audioDir(), dream.audioFileName).uri;
}

/** All saved dreams, newest first. */
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

/** Moves a finished recording into permanent storage and records it in the index. */
export async function saveDream(
  recordingUri: string,
  durationMs: number,
  details: DreamDetails,
): Promise<Dream> {
  // Validate before touching the file so a rejected save leaves the recording in place.
  const title = details.title.trim();
  if (!title) throw new Error('A title is required');

  const dir = audioDir();
  dir.create({ intermediates: true, idempotent: true });

  const id = `${Date.now()}`;
  const audioFileName = `${id}.m4a`;
  new File(recordingUri).move(new File(dir, audioFileName));

  const emotion = details.emotion?.trim();
  const dream: Dream = {
    id,
    createdAt: new Date().toISOString(),
    durationMs,
    audioFileName,
    title,
    ...(emotion ? { emotion } : {}),
    tags: details.tags,
  };
  writeIndex([...(await readIndex()), dream]);
  return dream;
}

/** Deletes a recording that was never saved. */
export function discardRecording(recordingUri: string) {
  const file = new File(recordingUri);
  if (file.exists) file.delete();
}
