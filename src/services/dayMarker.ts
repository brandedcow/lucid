import { File, Paths } from 'expo-file-system';

// The day marker: one tiny file holding only the latest date the user finished or skipped the
// launch note. It lives outside notes/ and the notes index, so saving, deleting and repairing notes
// never touch it. This module never deletes it: a stale date is ignored by callers and overwritten
// on the next mark.
// The file name `no-dream.json` and the JSON key `noDreamDate` are legacy on-disk names, kept on
// purpose so an existing marker survives the pivot and a build downgrade.
const markerFile = () => new File(Paths.document, 'no-dream.json');

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The stored done date (YYYY-MM-DD), or null when absent or unusable. Never throws. */
export async function readDoneDate(): Promise<string | null> {
  try {
    const file = markerFile();
    if (!file.exists || file.size === 0) return null;
    const data: unknown = await file.json();
    const value = (data as { noDreamDate?: unknown } | null)?.noDreamDate;
    return typeof value === 'string' && DATE_KEY.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Replaces the stored done date. Never throws; a failed write is simply not persisted. */
export async function writeDoneDate(dateKey: string): Promise<void> {
  try {
    // Write creates a missing file itself and replaces the whole content.
    markerFile().write(JSON.stringify({ noDreamDate: dateKey }));
  } catch {
    // Best effort: the caller keeps the value in memory for the session.
  }
}
