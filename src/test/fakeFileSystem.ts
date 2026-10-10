// In-memory stand-in for expo-file-system's File/Directory/Paths, for Jest.
// Usage: jest.mock('expo-file-system', () => require('../test/fakeFileSystem'));
//
// It mirrors the real library where storage code depends on it: write() creates a missing file,
// create() fails on an existing file unless overwrite is set (and then resets it), delete() of a
// missing path throws, and writing, copying or creating into a missing parent directory throws.
//
// Failed write/copy calls can leave damage behind (see `leave` below). The real overwrite copy
// removes the destination first and then copies, so a failing overwrite copy can leave the
// destination missing: `leave: 'missing'` models that (an existing destination is deleted).

const files = new Map<string, string>();
const dirs = new Set<string>();

type Op = 'move' | 'copy' | 'write' | 'create' | 'delete' | 'json' | 'text' | 'list';
/**
 * What a failed write or copy leaves behind. Without it the file is left unchanged.
 * 'empty' (write only) truncates the file; 'partial' leaves half the content; 'missing' (copy only)
 * deletes an existing destination (remove-then-copy).
 */
type Leave = { leave?: 'empty' | 'partial' | 'missing' };
type Failure = { error: Error; leave?: Leave['leave'] };
const failOnce = new Map<Op, Failure>();
const failPredicates: { op: Op; predicate: (uri: string) => boolean; failure: Failure }[] = [];
const copyLog: { from: string; to: string }[] = [];

/** The failure to inject for this call, if any. A one-shot failure is consumed. */
function injected(op: Op, uri: string): Failure | undefined {
  const once = failOnce.get(op);
  if (once) {
    failOnce.delete(op);
    return once;
  }
  return failPredicates.find((f) => f.op === op && f.predicate(uri))?.failure;
}

type Part = string | { uri: string };

function join(parts: Part[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p : p.uri))
    .join('/')
    .replace(/([^:/])\/{2,}/g, '$1/');
}

const DOCUMENT = 'file:///document';
const CACHE = 'file:///cache';
const parentOf = (uri: string) => uri.slice(0, uri.lastIndexOf('/'));
const dirExists = (uri: string) => uri === DOCUMENT || uri === CACHE || dirs.has(uri);

function requireParent(uri: string) {
  if (!dirExists(parentOf(uri))) throw new Error(`Parent directory does not exist: ${uri}`);
}

const half = (content: string) => content.slice(0, Math.floor(content.length / 2));

export class Directory {
  uri: string;
  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }
  get exists() {
    return dirExists(this.uri);
  }
  /** Direct children only, files and directories, like the real list(); throws if missing. */
  list(): (File | Directory)[] {
    const failure = injected('list', this.uri);
    if (failure) throw failure.error;
    if (!this.exists) throw new Error('Directory does not exist');
    return [
      ...[...files.keys()].filter((uri) => parentOf(uri) === this.uri).map((uri) => new File(uri)),
      ...[...dirs].filter((uri) => parentOf(uri) === this.uri).map((uri) => new Directory(uri)),
    ];
  }
  create(opts?: { intermediates?: boolean; idempotent?: boolean }) {
    if (this.exists) {
      if (opts?.idempotent) return;
      throw new Error('Directory already exists');
    }
    if (!opts?.intermediates) requireParent(this.uri);
    // Intermediates: register every missing ancestor below the implicit roots.
    for (let dir = this.uri; !dirExists(dir) && dir.includes('/'); dir = parentOf(dir)) {
      dirs.add(dir);
    }
  }
}

export class File {
  uri: string;
  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }
  get exists() {
    return files.has(this.uri);
  }
  /** Length in bytes (characters here), 0 for an empty file, null when the file is missing. */
  get size(): number | null {
    return files.has(this.uri) ? (files.get(this.uri) ?? '').length : null;
  }
  create(opts?: { overwrite?: boolean }) {
    const failure = injected('create', this.uri);
    if (failure) throw failure.error;
    requireParent(this.uri);
    if (files.has(this.uri) && !opts?.overwrite) throw new Error('File already exists');
    files.set(this.uri, '');
  }
  write(content: string) {
    requireParent(this.uri);
    const failure = injected('write', this.uri);
    if (failure) {
      if (failure.leave === 'empty') files.set(this.uri, '');
      if (failure.leave === 'partial') files.set(this.uri, half(content));
      throw failure.error;
    }
    files.set(this.uri, content);
  }
  async json() {
    const failure = injected('json', this.uri);
    if (failure) throw failure.error;
    return JSON.parse(files.get(this.uri) ?? '');
  }
  async text(): Promise<string> {
    const failure = injected('text', this.uri);
    if (failure) throw failure.error;
    if (!files.has(this.uri)) throw new Error('File does not exist');
    return files.get(this.uri) ?? '';
  }
  // move and copy are async in the real library; the leading await lets tests observe races.
  async move(destination: File, opts?: { overwrite?: boolean }) {
    await Promise.resolve();
    const failure = injected('move', this.uri);
    if (failure) throw failure.error;
    if (!files.has(this.uri)) throw new Error('Source does not exist');
    requireParent(destination.uri);
    if (files.has(destination.uri) && !opts?.overwrite) {
      throw new Error('DestinationAlreadyExists');
    }
    files.set(destination.uri, files.get(this.uri) ?? '');
    files.delete(this.uri);
    this.uri = destination.uri;
  }
  async copy(destination: File, opts?: { overwrite?: boolean }) {
    await Promise.resolve();
    copyLog.push({ from: this.uri, to: destination.uri });
    const failure = injected('copy', this.uri);
    if (failure) {
      if (failure.leave === 'missing') files.delete(destination.uri);
      if (
        failure.leave === 'partial' &&
        files.has(this.uri) &&
        dirExists(parentOf(destination.uri))
      ) {
        files.set(destination.uri, half(files.get(this.uri) ?? ''));
      }
      throw failure.error;
    }
    if (!files.has(this.uri)) throw new Error('Source does not exist');
    requireParent(destination.uri);
    if (files.has(destination.uri) && !opts?.overwrite) {
      throw new Error('DestinationAlreadyExists');
    }
    files.set(destination.uri, files.get(this.uri) ?? '');
  }
  delete() {
    const failure = injected('delete', this.uri);
    if (failure) throw failure.error;
    if (!files.has(this.uri)) throw new Error('path does not exist');
    files.delete(this.uri);
  }
}

export const Paths = { document: DOCUMENT, cache: CACHE };

/** Test helpers (not part of expo-file-system). */
export const __fs = {
  reset: () => {
    files.clear();
    dirs.clear();
    __fs.clearFailures();
    copyLog.length = 0;
  },
  /** Stores a file directly, creating its parent directories (a test fixture, not a file op). */
  put: (uri: string, content = '') => {
    new Directory(parentOf(uri)).create({ intermediates: true, idempotent: true });
    files.set(uri, content);
  },
  has: (uri: string) => files.has(uri),
  read: (uri: string) => files.get(uri),
  /** All stored file URIs. */
  list: () => [...files.keys()],
  /** Every copy() attempted since reset (including failed ones), in order. */
  copies: () => [...copyLog],
  /**
   * Fail the next call of this operation once (move/copy/json reject; the others throw). For write
   * and copy, `leave` says what the failed call leaves behind: an 'empty' (write only), a
   * 'partial' file, or (copy only) a 'missing' destination. Without it the file is unchanged.
   */
  failNext: (op: Op, error: Error = new Error(`${op} failed`), opts: Leave = {}) => {
    failOnce.set(op, { error, leave: opts.leave });
  },
  /** Fail every call of this operation whose file URI matches the predicate. */
  failWhen: (
    op: Op,
    predicate: (uri: string) => boolean,
    error: Error = new Error(`${op} failed`),
    opts: Leave = {},
  ) => {
    failPredicates.push({ op, predicate, failure: { error, leave: opts.leave } });
  },
  clearFailures: () => {
    failOnce.clear();
    failPredicates.length = 0;
  },
};
