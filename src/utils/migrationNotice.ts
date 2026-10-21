import type { MigrationResult } from '../services/legacyImport';
import type { MigrationNotice } from '../screens/NoteListScreen';

export const MIGRATION_COPY = {
  sourceUnreadable:
    'Your earlier notes could not be read, so they were not brought in. Nothing was changed.',
  failed: "Couldn't bring in your earlier notes. They are still on your phone.",
  noneConverted: 'None of your earlier notes could be converted. They were left where they were.',
} as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function importedText(added: number, skipped: number, dropped: number): string {
  const brought =
    added === 1 ? '1 earlier note was brought in.' : `${added} earlier notes were brought in.`;
  if (skipped > 0) {
    const k = skipped + dropped;
    return `${brought} ${k} could not be converted and ${k === 1 ? 'was' : 'were'} left where ${
      k === 1 ? 'it was' : 'they were'
    }.`;
  }
  if (dropped > 0) {
    return `${brought} ${plural(dropped, 'voice note', 'voice notes')} could not be converted and ${
      dropped === 1 ? 'was' : 'were'
    } left where ${dropped === 1 ? 'it was' : 'they were'}.`;
  }
  return brought;
}

/**
 * The line above the note list about the import of earlier notes, or null for none. Pure; the
 * provider owns the state (`settled`, `retrying`, `dismissed`) and the two actions. `working` shows
 * while the import is still running (the launch cap opened the list first) or being retried.
 * `info` lines can be dismissed for the session; `retry` stays until the retry works. No note text
 * or id ever appears in a notice.
 */
export function migrationNotice(args: {
  settled: boolean;
  result: MigrationResult | null;
  retrying: boolean;
  dismissed: boolean;
  onDismiss: () => void;
  onRetry: () => void;
}): MigrationNotice | null {
  const { settled, result, retrying, dismissed, onDismiss, onRetry } = args;
  if (retrying || !settled) return { kind: 'working' };
  if (!result) return null;
  const info = (text: string): MigrationNotice | null =>
    dismissed ? null : { kind: 'info', text, onDismiss };
  switch (result.status) {
    case 'already-done':
    case 'no-source':
    case 'notes-unreadable':
      return null;
    case 'source-unreadable':
      return info(MIGRATION_COPY.sourceUnreadable);
    case 'failed':
      return { kind: 'retry', text: MIGRATION_COPY.failed, onRetry };
    case 'imported': {
      if (result.added > 0) {
        return info(
          importedText(result.added, result.skipped.length, result.droppedRecordings.length),
        );
      }
      if (result.read > 0 && result.skipped.length === result.read) {
        return info(MIGRATION_COPY.noneConverted);
      }
      return null;
    }
  }
}
