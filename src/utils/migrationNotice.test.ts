import type { MigrationResult } from '../services/legacyImport';
import { migrationNotice } from './migrationNotice';

const onDismiss = jest.fn();
const onRetry = jest.fn();
const base = { settled: true, retrying: false, dismissed: false, onDismiss, onRetry };

const skip = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ index: i, id: `s${i}`, reason: 'invalid' as const }));
const dropped = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `d${i}`, fileName: `f${i}.m4a` }));
const imported = (over: Partial<Extract<MigrationResult, { status: 'imported' }>> = {}) =>
  ({
    status: 'imported',
    read: 3,
    added: 3,
    alreadyPresent: 0,
    skipped: [],
    droppedRecordings: [],
    usedBackup: false,
    markerWritten: true,
    ...over,
  }) as MigrationResult;
const text = (result: MigrationResult | null, over = {}) => {
  const n = migrationNotice({ ...base, result, ...over });
  return n && n.kind !== 'working' ? n.text : n;
};

describe('migrationNotice', () => {
  it('shows the working line while not settled or retrying, whatever the result', () => {
    expect(migrationNotice({ ...base, settled: false, result: null })).toEqual({ kind: 'working' });
    expect(migrationNotice({ ...base, settled: false, result: imported() })).toEqual({
      kind: 'working',
    });
    expect(migrationNotice({ ...base, retrying: true, result: { status: 'failed' } })).toEqual({
      kind: 'working',
    });
  });

  it('shows nothing for no result, already-done, no-source and notes-unreadable', () => {
    for (const result of [
      null,
      { status: 'already-done' },
      { status: 'no-source' },
      { status: 'notes-unreadable' },
    ] as (MigrationResult | null)[]) {
      expect(migrationNotice({ ...base, result })).toBeNull();
    }
  });

  it('source-unreadable is an info line with the agreed text', () => {
    const n = migrationNotice({ ...base, result: { status: 'source-unreadable' } });
    expect(n).toEqual({
      kind: 'info',
      text: 'Your earlier notes could not be read, so they were not brought in. Nothing was changed.',
      onDismiss,
    });
  });

  it('failed is a retry line whose button calls onRetry', () => {
    const n = migrationNotice({ ...base, result: { status: 'failed' } });
    expect(n).toEqual({
      kind: 'retry',
      text: "Couldn't bring in your earlier notes. They are still on your phone.",
      onRetry,
    });
  });

  it('dismissed hides info lines but never the retry line', () => {
    expect(migrationNotice({ ...base, dismissed: true, result: imported() })).toBeNull();
    expect(
      migrationNotice({ ...base, dismissed: true, result: { status: 'source-unreadable' } }),
    ).toBeNull();
    expect(migrationNotice({ ...base, dismissed: true, result: { status: 'failed' } })?.kind).toBe(
      'retry',
    );
  });

  it.each([
    ['one, nothing skipped', imported({ read: 1, added: 1 }), '1 earlier note was brought in.'],
    ['two, nothing skipped', imported({ read: 2, added: 2 }), '2 earlier notes were brought in.'],
    [
      'one in, one skipped',
      imported({ read: 2, added: 1, skipped: skip(1) }),
      '1 earlier note was brought in. 1 could not be converted and was left where it was.',
    ],
    [
      'two in, two skipped',
      imported({ read: 4, added: 2, skipped: skip(2) }),
      '2 earlier notes were brought in. 2 could not be converted and were left where they were.',
    ],
    [
      'skips plus dropped voice notes add up',
      imported({ read: 4, added: 2, skipped: skip(1), droppedRecordings: dropped(2) }),
      '2 earlier notes were brought in. 3 could not be converted and were left where they were.',
    ],
    [
      'only one dropped voice note says so',
      imported({ added: 3, droppedRecordings: dropped(1) }),
      '3 earlier notes were brought in. 1 voice note could not be converted and was left where it was.',
    ],
    [
      'only two dropped voice notes say so',
      imported({ added: 3, droppedRecordings: dropped(2) }),
      '3 earlier notes were brought in. 2 voice notes could not be converted and were left where they were.',
    ],
    [
      'every note skipped',
      imported({ read: 2, added: 0, skipped: skip(2) }),
      'None of your earlier notes could be converted. They were left where they were.',
    ],
  ])('imported: %s', (_name, result, expected) => {
    expect(text(result)).toBe(expected);
  });

  it('imported with nothing added and nothing skipped (all already present) shows nothing', () => {
    expect(
      migrationNotice({
        ...base,
        result: imported({ read: 2, added: 0, alreadyPresent: 2 }),
      }),
    ).toBeNull();
    expect(
      migrationNotice({
        ...base,
        result: imported({ read: 0, added: 0 }),
      }),
    ).toBeNull();
  });

  it('adds nothing for an unwritten marker (the import repeats next launch)', () => {
    expect(text(imported({ read: 2, added: 2, markerWritten: false }))).toBe(
      '2 earlier notes were brought in.',
    );
  });

  it('the info line passes onDismiss through', () => {
    const n = migrationNotice({ ...base, result: imported() });
    if (n?.kind !== 'info') throw new Error('expected info');
    n.onDismiss();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
