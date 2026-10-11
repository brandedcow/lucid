import { File, Paths } from 'expo-file-system';

/** The persisted settings. One small file on the device; nothing here ever leaves the phone. */
export type Settings = {
  /** Open Dream capture on the morning prompt. Defaults to on. */
  autoOpenDreamCapture: boolean;
};

export const DEFAULT_SETTINGS: Settings = { autoOpenDreamCapture: true };

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
 * falls back to its default (on), so a damaged file never silences the morning prompt.
 * Never throws.
 */
export async function readSettings(): Promise<Settings> {
  const raw = await readRaw();
  return {
    autoOpenDreamCapture:
      typeof raw?.autoOpenDreamCapture === 'boolean'
        ? raw.autoOpenDreamCapture
        : DEFAULT_SETTINGS.autoOpenDreamCapture,
  };
}

// Writes run one after another so two quick changes end with the last value on disk.
let queue: Promise<void> = Promise.resolve();

async function writeNow(patch: Partial<Settings>): Promise<void> {
  try {
    // Keep keys this version does not know about; a damaged file is replaced by the patch alone.
    const next: Record<string, unknown> = { ...(await readRaw()) };
    if (patch.autoOpenDreamCapture !== undefined) {
      next.autoOpenDreamCapture = patch.autoOpenDreamCapture;
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
