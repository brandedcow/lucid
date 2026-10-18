import { File, Paths } from 'expo-file-system';
import { inlineTagFor, missingInlineTags } from '../utils/inlineTags';
import { sanitizeWaveform } from '../utils/waveform';
import {
  Note,
  NoteRecording,
  appendImported,
  isIndexUnreadableError,
  isPlainFileName,
} from './notesStorage';

// One-time, read-only import of the older data file (dreams.json) into notes. The legacy files
// (dreams.json, dreams.json.bak, journals.json and the audio in dreams/) are only ever read here:
// this module has no way to delete, move, copy or create anything. Its only own write is the small
// marker file migrated.json, written after the notes were stored. It deliberately does not import
// the old storage modules, which a later cleanup removes; the loose legacy shapes are local.

const sourceFile = () => new File(Paths.document, 'dreams.json');
const backupFile = () => new File(Paths.document, 'dreams.json.bak');
const journalsFile = () => new File(Paths.document, 'journals.json');
const markerFile = () => new File(Paths.document, 'migrated.json');

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MARKER_VERSION = 1;
const MARKER_LIST_CAP = 200;
const BUILT_IN_JOURNALS: Record<string, string> = { dreams: 'Dreams', life: 'Life' };

export type ImportSkip = {
  index: number;
  id?: string;
  reason: 'not-an-object' | 'bad-id' | 'bad-created-at' | 'empty' | 'invalid';
};
export type DroppedRecording = { id: string; fileName: string };

export type MigrationResult =
  | { status: 'already-done' }
  | { status: 'no-source' }
  | { status: 'source-unreadable' }
  | { status: 'notes-unreadable' }
  | { status: 'failed' }
  | {
      status: 'imported';
      read: number;
      added: number;
      alreadyPresent: number;
      skipped: ImportSkip[];
      droppedRecordings: DroppedRecording[];
      usedBackup: boolean;
      markerWritten: boolean;
    };

/** The content of migrated.json: ids and counts only, never note text. */
export type MigrationMarker = {
  version: 1;
  importedAt: string;
  source: 'dreams.json';
  usedBackup: boolean;
  read: number;
  added: number;
  alreadyPresent: number;
  skipped: ImportSkip[];
  droppedRecordings: DroppedRecording[];
};

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A readable JSON file's content, or undefined when it is missing, zero-length or unparseable. */
async function readJson(file: File): Promise<unknown> {
  try {
    if (!file.exists || !file.size) return undefined;
    return await file.json();
  } catch {
    return undefined;
  }
}

/** The stored marker, or null when absent, zero-length, corrupt or of another shape. Never throws. */
export async function readMigrationMarker(): Promise<MigrationMarker | null> {
  const data = await readJson(markerFile());
  if (!isObj(data) || data.version !== MARKER_VERSION || typeof data.importedAt !== 'string') {
    return null;
  }
  return data as unknown as MigrationMarker;
}

/** Journal id to name: the built-ins plus the registry in journals.json; any failure adds nothing. */
async function journalNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>(Object.entries(BUILT_IN_JOURNALS));
  const data = await readJson(journalsFile());
  if (!isObj(data) || !Array.isArray(data.journals)) return names;
  for (const item of data.journals) {
    if (!isObj(item)) continue;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || item.name === '') continue;
    if (!names.has(item.id)) names.set(item.id, item.name);
  }
  return names;
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The tag of the journal an entry belonged to, or null when no inline tag can be made. */
function journalTagOf(journalId: unknown, names: Map<string, string>): string | null {
  const id = typeof journalId === 'string' && journalId !== '' ? journalId : 'dreams';
  const name = names.get(id) ?? id;
  return inlineTagFor(name) ?? inlineTagFor('journal-' + name) ?? inlineTagFor(id);
}

/** The entry's id as text, or undefined when it has none of a usable type. */
function rawIdOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** The stored createdAt, else the date an all-digit id encodes (2000..2100), else null. */
function createdAtOf(value: unknown, id: string): string | null {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  if (/^\d+$/.test(id)) {
    const date = new Date(Number(id));
    const year = date.getUTCFullYear();
    if (Number.isFinite(date.getTime()) && year >= 2000 && year <= 2100) return date.toISOString();
  }
  return null;
}

type LegacyRecording = {
  fileName: unknown;
  durationMs: number;
  waveform?: number[];
  voiceTranscript?: string;
};

const finiteOr0 = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** The entry's recordings the way the old store read them: a non-empty list wins, else the single one. */
function legacyRecordingsOf(dream: Obj): LegacyRecording[] {
  const out: LegacyRecording[] = [];
  if (Array.isArray(dream.recordings)) {
    for (const item of dream.recordings) {
      if (!isObj(item)) continue;
      if (typeof item.fileName !== 'string' || item.fileName === '') continue;
      const waveform = sanitizeWaveform(item.waveform);
      out.push({
        fileName: item.fileName,
        durationMs: finiteOr0(item.durationMs),
        ...(waveform ? { waveform } : {}),
        ...(typeof item.voiceTranscript === 'string'
          ? { voiceTranscript: item.voiceTranscript }
          : {}),
      });
    }
  }
  if (out.length > 0) return out;
  if (typeof dream.audioFileName === 'string' && dream.audioFileName !== '') {
    const waveform = sanitizeWaveform(dream.waveform);
    return [
      {
        fileName: dream.audioFileName,
        durationMs: finiteOr0(dream.durationMs),
        ...(waveform ? { waveform } : {}),
      },
    ];
  }
  return [];
}

type Converted =
  { note: Note; dropped: DroppedRecording[] } | { skip: ImportSkip; dropped: DroppedRecording[] };

/** One old entry as a note, or the reason it is skipped. Never throws for a bad entry. */
function convert(
  item: unknown,
  index: number,
  usedIds: Set<string>,
  names: Map<string, string>,
): Converted {
  const dropped: DroppedRecording[] = [];
  if (!isObj(item)) return { skip: { index, reason: 'not-an-object' }, dropped };
  const rawId = rawIdOf(item.id);
  if (rawId === undefined || !ID_PATTERN.test(rawId)) {
    return {
      skip: { index, reason: 'bad-id', ...(rawId !== undefined ? { id: rawId } : {}) },
      dropped,
    };
  }
  const createdAt = createdAtOf(item.createdAt, rawId);
  if (createdAt === null) return { skip: { index, id: rawId, reason: 'bad-created-at' }, dropped };

  let id = rawId;
  for (let n = 2; usedIds.has(id); n += 1) id = `${rawId}-d${n}`;

  const title = typeof item.title === 'string' ? collapse(item.title) : '';
  const text =
    typeof item.transcript === 'string' ? item.transcript.replace(/\r\n/g, '\n').trim() : '';
  const emotion = typeof item.emotion === 'string' ? collapse(item.emotion) : '';
  const blocks = [title, text, emotion ? `Emotion: ${emotion}` : ''].filter((b) => b !== '');

  const ownTags = Array.isArray(item.tags)
    ? item.tags.filter((t): t is string => typeof t === 'string')
    : [];
  const journalTag = journalTagOf(item.journalId, names);
  const tagLine = missingInlineTags(
    blocks.join('\n\n'),
    journalTag === null ? ownTags : [journalTag, ...ownTags],
  )
    .map((t) => '#' + t)
    .join(' ');

  const recordings: NoteRecording[] = [];
  for (const rec of legacyRecordingsOf(item)) {
    if (!isPlainFileName(rec.fileName)) {
      dropped.push({ id, fileName: String(rec.fileName) });
      continue;
    }
    recordings.push({
      fileName: rec.fileName,
      durationMs: rec.durationMs,
      ...(rec.waveform ? { waveform: rec.waveform } : {}),
      ...(rec.voiceTranscript !== undefined ? { voiceTranscript: rec.voiceTranscript } : {}),
      origin: 'legacy',
    });
  }

  const hasOwnTags = ownTags.some((t) => inlineTagFor(t) !== null);
  if (blocks.length === 0 && recordings.length === 0 && !hasOwnTags) {
    return { skip: { index, id: rawId, reason: 'empty' }, dropped };
  }

  const body = (tagLine ? [...blocks, tagLine] : blocks).join('\n\n');
  usedIds.add(id);
  const note: Note = {
    id,
    createdAt,
    updatedAt: createdAt,
    body,
    ...(recordings.length > 0 ? { recordings } : {}),
  };
  return { note, dropped };
}

/** The same checks appendImported makes, so one bad record can never reject the whole batch. */
function isStorable(note: Note): boolean {
  if (!ID_PATTERN.test(note.id)) return false;
  if (typeof note.body !== 'string') return false;
  if (typeof note.createdAt !== 'string' || typeof note.updatedAt !== 'string') return false;
  if (note.recordings === undefined) return true;
  return (
    Array.isArray(note.recordings) && note.recordings.every((r) => isPlainFileName(r.fileName))
  );
}

/** The old entries to import and whether they came from the backup; or why there are none. */
async function readSource(): Promise<
  { entries: unknown[]; usedBackup: boolean } | { status: 'no-source' | 'source-unreadable' }
> {
  const main = sourceFile();
  if (main.exists && main.size) {
    let data: unknown;
    try {
      data = await main.json();
    } catch {
      return { status: 'source-unreadable' };
    }
    return Array.isArray(data)
      ? { entries: data, usedBackup: false }
      : { status: 'source-unreadable' };
  }
  const backup = await readJson(backupFile());
  if (Array.isArray(backup) && backup.length > 0) return { entries: backup, usedBackup: true };
  return { status: 'no-source' };
}

async function run(): Promise<MigrationResult> {
  if ((await readMigrationMarker()) !== null) return { status: 'already-done' };

  const source = await readSource();
  if ('status' in source) return { status: source.status };

  const names = await journalNames();
  const usedIds = new Set<string>();
  const notes: Note[] = [];
  const skipped: ImportSkip[] = [];
  const droppedRecordings: DroppedRecording[] = [];
  source.entries.forEach((item, index) => {
    let result: Converted;
    try {
      result = convert(item, index, usedIds, names);
    } catch {
      result = { skip: { index, reason: 'invalid' }, dropped: [] };
    }
    droppedRecordings.push(...result.dropped);
    if ('skip' in result) {
      skipped.push(result.skip);
      return;
    }
    if (!isStorable(result.note)) {
      skipped.push({ index, id: result.note.id, reason: 'invalid' });
      return;
    }
    notes.push(result.note);
  });

  let added = 0;
  if (notes.length > 0) {
    try {
      added = (await appendImported(notes)).added;
    } catch (error) {
      return { status: isIndexUnreadableError(error) ? 'notes-unreadable' : 'failed' };
    }
  }
  const alreadyPresent = notes.length - added;

  let markerWritten = false;
  try {
    const marker: MigrationMarker = {
      version: MARKER_VERSION,
      importedAt: new Date().toISOString(),
      source: 'dreams.json',
      usedBackup: source.usedBackup,
      read: source.entries.length,
      added,
      alreadyPresent,
      skipped: skipped.slice(0, MARKER_LIST_CAP),
      droppedRecordings: droppedRecordings.slice(0, MARKER_LIST_CAP),
    };
    markerFile().write(JSON.stringify(marker));
    markerWritten = (await readMigrationMarker()) !== null;
  } catch {
    markerWritten = false;
  }

  return {
    status: 'imported',
    read: source.entries.length,
    added,
    alreadyPresent,
    skipped,
    droppedRecordings,
    usedBackup: source.usedBackup,
    markerWritten,
  };
}

let inFlight: Promise<MigrationResult> | null = null;

/**
 * Imports the old dreams into notes once. Never throws; every outcome is a status. Only the
 * `imported` and `already-done` outcomes are final (the marker is written after the notes are
 * stored); any other status writes nothing and is retried by the next call. Concurrent calls share
 * one run.
 */
export function migrateLegacyDreams(): Promise<MigrationResult> {
  if (inFlight) return inFlight;
  const current = run()
    .catch((): MigrationResult => ({ status: 'failed' }))
    .finally(() => {
      if (inFlight === current) inFlight = null;
    });
  inFlight = current;
  return current;
}

/** Test-only: forget a run in progress. */
export function resetLegacyImportForTests() {
  inFlight = null;
}
