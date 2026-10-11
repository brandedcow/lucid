import { File, Paths } from 'expo-file-system';
import { BUILT_IN_JOURNALS, Journal } from '../utils/journals';
import { JournalNameProblem, validateJournalName } from '../utils/journalName';

// User-created journals: one small file beside (not inside) the dream index. Only custom journals
// are stored; Dreams and Life are built in and never written. The app NEVER deletes journals.json:
// it is replaced atomically (temp file, then move) and, when the content is damaged, copied once to
// journals.corrupt-<n>.json before the first overwrite. A copy is never a deletion.
const journalsFile = () => new File(Paths.document, 'journals.json');
const tempFile = () => new File(Paths.document, 'journals.tmp.json');

const CUSTOM_ID = /^j_[a-z0-9]+$/;

export type JournalErrorCode = 'invalid-name' | 'built-in' | 'not-found';

/** What went wrong with a journal change. Write failures surface as the underlying error instead. */
export class JournalError extends Error {
  code: JournalErrorCode;
  /** Set when code is 'invalid-name'. */
  reason?: JournalNameProblem;
  constructor(code: JournalErrorCode, reason?: JournalNameProblem) {
    super(reason ? `${code}: ${reason}` : code);
    this.name = 'JournalError';
    this.code = code;
    this.reason = reason;
  }
}

type Raw = Record<string, unknown>;
type Entry = { journal: Journal; raw: Raw };

const isPlainObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored file state. `damaged` means a write must first keep a copy of `text`. */
type Snapshot = {
  entries: Entry[];
  /** Top-level keys other than version and journals, kept on write. */
  extras: Raw;
  damaged: boolean;
  text: string | null;
};

const BUILT_IN_IDS = new Set<string>(BUILT_IN_JOURNALS.map((j) => j.id));

function validEntry(value: unknown, seen: Set<string>): Entry | null {
  if (!isPlainObject(value)) return null;
  const { id, name, kind, createdAt } = value;
  if (typeof id !== 'string' || !CUSTOM_ID.test(id) || BUILT_IN_IDS.has(id) || seen.has(id)) {
    return null;
  }
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (kind !== 'journal' || typeof createdAt !== 'string') return null;
  seen.add(id);
  return { journal: { id, name, kind: 'journal' }, raw: value };
}

function parseSnapshot(text: string): Snapshot {
  const empty: Snapshot = { entries: [], extras: {}, damaged: false, text: null };
  if (text.trim().length === 0) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...empty, damaged: true, text };
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.journals)) {
    return { ...empty, damaged: true, text };
  }
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const item of parsed.journals) {
    const entry = validEntry(item, seen);
    if (entry) entries.push(entry);
  }
  const extras: Raw = {};
  for (const key of Object.keys(parsed)) {
    if (key !== 'version' && key !== 'journals') extras[key] = parsed[key];
  }
  return { entries, extras, damaged: entries.length !== parsed.journals.length, text };
}

/** The tmp file left by an interrupted write, when it holds a fully valid snapshot; else null. */
async function readTempSnapshot(): Promise<Snapshot | null> {
  try {
    const temp = tempFile();
    if (!temp.exists || temp.size === 0) return null;
    const snapshot = parseSnapshot(await temp.text());
    return snapshot.damaged || snapshot.text === null ? null : snapshot;
  } catch {
    return null;
  }
}

async function readSnapshot(): Promise<Snapshot> {
  const empty: Snapshot = { entries: [], extras: {}, damaged: false, text: null };
  const file = journalsFile();
  let text = '';
  if (file.exists && file.size !== 0) {
    try {
      text = await file.text();
    } catch {
      return { ...empty, damaged: true };
    }
  }
  if (text.trim().length > 0) return parseSnapshot(text);
  // journals.json is missing or empty: an interrupted write may have left the new content in the
  // tmp file. Read only; the next normal write replaces journals.json and heals the state.
  return (await readTempSnapshot()) ?? empty;
}

/**
 * The custom journals in creation order. Fails open: a missing, empty, unreadable, corrupt or
 * wrong-shape file gives []; each journal is validated on its own and bad ones are dropped in
 * memory (the file is not touched). Runs in the same queue as the changes, so it never sees a
 * half-finished replace. Never throws.
 */
export function loadJournals(): Promise<Journal[]> {
  return serialized(async () => {
    try {
      return (await readSnapshot()).entries.map((e) => e.journal);
    } catch {
      return [];
    }
  });
}

// Changes run one after another, each reading the file fresh, so none is lost to a race.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

// The damaged text already copied this session, so a retry after a failed write does not copy again.
let copiedText: string | null = null;

/** Test-only: forget which damaged content was already copied. */
export function resetJournalStorageForTests(): void {
  copiedText = null;
}

async function keepCorruptCopy(snapshot: Snapshot): Promise<void> {
  if (!snapshot.damaged) return;
  if (snapshot.text !== null && snapshot.text === copiedText) return;
  let n = Date.now();
  while (new File(Paths.document, `journals.corrupt-${n}.json`).exists) n += 1;
  await journalsFile().copy(new File(Paths.document, `journals.corrupt-${n}.json`));
  copiedText = snapshot.text;
}

async function writeEntries(snapshot: Snapshot, entries: Entry[]): Promise<void> {
  await keepCorruptCopy(snapshot);
  const body = JSON.stringify({
    ...snapshot.extras,
    version: 1,
    journals: entries.map((e) => ({ ...e.raw, ...e.journal })),
  });
  const temp = tempFile();
  temp.write(body);
  await temp.move(journalsFile(), { overwrite: true });
}

const allJournals = (entries: Entry[]) => [...BUILT_IN_JOURNALS, ...entries.map((e) => e.journal)];

function newId(taken: Set<string>): string {
  for (;;) {
    const id = `j_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (CUSTOM_ID.test(id) && !taken.has(id) && !BUILT_IN_IDS.has(id)) return id;
  }
}

/** Creates a custom journal at the end of the list. Rejects with a JournalError for a bad name. */
export function addJournal(name: string): Promise<{ journal: Journal; journals: Journal[] }> {
  return serialized(async () => {
    const snapshot = await readSnapshot();
    const check = validateJournalName(name, allJournals(snapshot.entries));
    if (!check.ok) throw new JournalError('invalid-name', check.reason);
    const journal: Journal = {
      id: newId(new Set(snapshot.entries.map((e) => e.journal.id))),
      name: check.name,
      kind: 'journal',
    };
    const entry: Entry = { journal, raw: { createdAt: new Date().toISOString() } };
    const entries = [...snapshot.entries, entry];
    await writeEntries(snapshot, entries);
    return { journal, journals: entries.map((e) => e.journal) };
  });
}

/** Renames one custom journal; its id, kind and date stay. Built-in and unknown ids are refused. */
export function renameJournal(
  id: string,
  name: string,
): Promise<{ journal: Journal; journals: Journal[] }> {
  return serialized(async () => {
    if (BUILT_IN_IDS.has(id)) throw new JournalError('built-in');
    const snapshot = await readSnapshot();
    const index = snapshot.entries.findIndex((e) => e.journal.id === id);
    if (index < 0) throw new JournalError('not-found');
    const check = validateJournalName(name, allJournals(snapshot.entries), id);
    if (!check.ok) throw new JournalError('invalid-name', check.reason);
    const journal: Journal = { ...snapshot.entries[index].journal, name: check.name };
    const entries = snapshot.entries.map((e, i) => (i === index ? { ...e, journal } : e));
    await writeEntries(snapshot, entries);
    return { journal, journals: entries.map((e) => e.journal) };
  });
}

/**
 * Removes only that journal from journals.json (its entries are not this module's business). Built-in
 * and unknown ids are refused. The last removal writes an empty list, never an empty file.
 */
export function removeJournal(id: string): Promise<{ journals: Journal[] }> {
  return serialized(async () => {
    if (BUILT_IN_IDS.has(id)) throw new JournalError('built-in');
    const snapshot = await readSnapshot();
    if (!snapshot.entries.some((e) => e.journal.id === id)) throw new JournalError('not-found');
    const entries = snapshot.entries.filter((e) => e.journal.id !== id);
    await writeEntries(snapshot, entries);
    return { journals: entries.map((e) => e.journal) };
  });
}
