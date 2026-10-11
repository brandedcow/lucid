import { File, Paths } from 'expo-file-system';

// The "No dream" marker: one tiny file holding only the latest date the user skipped. It lives
// outside dreams/ and the dream index, so saving, deleting and repairing dreams never touch it.
// This module never deletes it: a stale date is ignored by callers and overwritten on the next skip.
const markerFile = () => new File(Paths.document, 'no-dream.json');

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The stored No dream date (YYYY-MM-DD), or null when absent or unusable. Never throws. */
export async function readNoDreamDate(): Promise<string | null> {
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

/** Replaces the stored No dream date. Never throws; a failed write is simply not persisted. */
export async function writeNoDreamDate(dateKey: string): Promise<void> {
  try {
    // Write creates a missing file itself and replaces the whole content.
    markerFile().write(JSON.stringify({ noDreamDate: dateKey }));
  } catch {
    // Best effort: the caller keeps the value in memory for the session.
  }
}
