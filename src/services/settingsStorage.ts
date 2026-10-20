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

/** The stored object as is, or null when the file is missing, empty, unreadable or not an object. */
async function readRaw(): Promise<Record<string, unknown> | null> {
  try {
    const file = settingsFile();
    if (!file.exists || file.size === 0) return null;
    const parsed: unknown = await file.json();
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The settings, each key validated on its own. Anything missing, damaged or of the wrong type
 * falls back to its default (autoOpenNewNote on, so a damaged file never silences the morning
 * prompt; onlineTranscription off, so a damaged file never allows audio to leave the phone).
 * Never throws.
 */
export async function readSettings(): Promise<Settings> {
  const raw = await readRaw();
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

// Writes run one after another so two quick changes end with the last value on disk.
let queue: Promise<void> = Promise.resolve();

async function writeNow(patch: Partial<Settings>): Promise<void> {
  try {
    // Keep keys this version does not know about; a damaged file is replaced by the patch alone.
    const next: Record<string, unknown> = { ...(await readRaw()) };
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
