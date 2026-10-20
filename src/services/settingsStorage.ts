import { File, Paths } from 'expo-file-system';

/**
 * The persisted settings. One small file on the device. The file itself never leaves the phone;
 * `onlineTranscription` only PERMITS an online transcription run (a voice note's audio goes to
 * Apple or Google when the user taps Transcribe), it does not send anything by itself.
 */
/** How the drawer lists tags: alphabetically or by how many notes use them. A view preference. */
export type TagSortOrder = 'alpha' | 'count';

const isTagSortOrder = (value: unknown): value is TagSortOrder =>
  value === 'alpha' || value === 'count';

export type Settings = {
  /** Open a new note on the launch prompt (first open of the day). Defaults to on. */
  autoOpenNewNote: boolean;
  /**
   * Allow online (server) transcription when this phone cannot transcribe a voice note itself.
   * Defaults to OFF and fails closed: a missing, damaged or non-boolean value is false.
   */
  onlineTranscription: boolean;
  /** Tag order in the drawer. Defaults to 'alpha'; any missing or invalid value is 'alpha'. */
  tagSort: TagSortOrder;
};

/**
 * Legacy on-disk key of `autoOpenNewNote`. Kept on purpose: renaming it would reset every existing
 * user's toggle to the default and lose it on a build downgrade.
 */
const AUTO_OPEN_KEY = 'autoOpenDreamCapture';

export const DEFAULT_SETTINGS: Settings = {
  autoOpenNewNote: true,
  onlineTranscription: false,
  tagSort: 'alpha',
};

// Paths.document can change between app updates on iOS, so resolve it on every call.
const settingsFile = () => new File(Paths.document, 'settings.json');

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What reading the file found. 'unreadable' (the read threw) is kept apart from 'corrupt' (content
 * obtained but not a settings object) because a write over an unreadable file could destroy values
 * that are still there, while a corrupt file holds nothing to keep.
 */
type RawRead =
  | { kind: 'missing' }
  | { kind: 'ok'; value: Record<string, unknown> }
  | { kind: 'corrupt' }
  | { kind: 'unreadable' };

// file.json() would blur a failed read with a parse error, so read the text and parse it here.
async function readRaw(): Promise<RawRead> {
  let text: string;
  try {
    const file = settingsFile();
    if (!file.exists || file.size === 0) return { kind: 'missing' };
    text = await file.text();
  } catch {
    return { kind: 'unreadable' };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isPlainObject(parsed) ? { kind: 'ok', value: parsed } : { kind: 'corrupt' };
  } catch {
    return { kind: 'corrupt' };
  }
}

// Writes run one after another so two quick changes end with the last value on disk.
let queue: Promise<void> = Promise.resolve();

/**
 * The settings, each key validated on its own. Anything missing, damaged or of the wrong type
 * falls back to its default (autoOpenNewNote on, so a damaged file never silences the morning
 * prompt; onlineTranscription off, so a damaged file never allows audio to leave the phone).
 * Waits for queued writes first, so it never reads a half-written file. Never throws.
 */
export async function readSettings(): Promise<Settings> {
  await queue; // never rejects (writeNow swallows its errors), so this cannot deadlock
  const result = await readRaw();
  const raw = result.kind === 'ok' ? result.value : null;
  return {
    autoOpenNewNote:
      typeof raw?.[AUTO_OPEN_KEY] === 'boolean'
        ? raw[AUTO_OPEN_KEY]
        : DEFAULT_SETTINGS.autoOpenNewNote,
    onlineTranscription:
      typeof raw?.onlineTranscription === 'boolean'
        ? raw.onlineTranscription
        : DEFAULT_SETTINGS.onlineTranscription,
    tagSort: isTagSortOrder(raw?.tagSort) ? raw.tagSort : DEFAULT_SETTINGS.tagSort,
  };
}

async function writeNow(patch: Partial<Settings>): Promise<void> {
  try {
    let current = await readRaw();
    if (current.kind === 'unreadable') current = await readRaw(); // one retry
    // The file may still hold values we cannot see: leave it untouched, the next setter retries.
    if (current.kind === 'unreadable') return;
    // Keep keys this version does not know about; a missing or corrupt file is replaced by the
    // patch alone (nothing recoverable to merge).
    const next: Record<string, unknown> = current.kind === 'ok' ? { ...current.value } : {};
    if (patch.autoOpenNewNote !== undefined) {
      next[AUTO_OPEN_KEY] = patch.autoOpenNewNote;
    }
    if (patch.onlineTranscription !== undefined) {
      next.onlineTranscription = patch.onlineTranscription;
    }
    if (patch.tagSort !== undefined) {
      next.tagSort = patch.tagSort;
    }
    settingsFile().write(JSON.stringify(next));
  } catch {
    // Settings are a convenience: a failed write must never reach the UI.
  }
}

/** Merges the patch into the stored file. Never throws and never deletes the file. */
export function writeSettings(patch: Partial<Settings>): Promise<void> {
  const run = queue.then(() => writeNow(patch));
  queue = run;
  return run;
}
