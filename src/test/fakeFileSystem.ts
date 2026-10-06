// In-memory stand-in for expo-file-system's File/Directory/Paths, for Jest.
// Usage: jest.mock('expo-file-system', () => require('../test/fakeFileSystem'));

const files = new Map<string, string>();

type Op = 'move' | 'copy' | 'write' | 'create' | 'delete' | 'json';
const failOnce = new Map<Op, Error>();
const failPredicates: { op: Op; predicate: (uri: string) => boolean; error: Error }[] = [];
const copyLog: { from: string; to: string }[] = [];

/** The error to inject for this call, if any. A one-shot failure is consumed. */
function injected(op: Op, uri: string): Error | undefined {
  const once = failOnce.get(op);
  if (once) {
    failOnce.delete(op);
    return once;
  }
  return failPredicates.find((f) => f.op === op && f.predicate(uri))?.error;
}

type Part = string | { uri: string };

function join(parts: Part[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p : p.uri))
    .join('/')
    .replace(/([^:/])\/{2,}/g, '$1/');
}

export class Directory {
  uri: string;
  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }
  create() {}
}

export class File {
  uri: string;
  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }
  get exists() {
    return files.has(this.uri);
  }
  create() {
    const error = injected('create', this.uri);
    if (error) throw error;
    if (!files.has(this.uri)) files.set(this.uri, '');
  }
  write(content: string) {
    const error = injected('write', this.uri);
    if (error) throw error;
    files.set(this.uri, content);
  }
  async json() {
    const error = injected('json', this.uri);
    if (error) throw error;
    return JSON.parse(files.get(this.uri) ?? '');
  }
  // move and copy are async in the real library; the leading await lets tests observe races.
  async move(destination: File, opts?: { overwrite?: boolean }) {
    await Promise.resolve();
    const error = injected('move', this.uri);
    if (error) throw error;
    if (!files.has(this.uri)) throw new Error('Source does not exist');
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
    const error = injected('copy', this.uri);
    if (error) throw error;
    if (!files.has(this.uri)) throw new Error('Source does not exist');
    if (files.has(destination.uri) && !opts?.overwrite) {
      throw new Error('DestinationAlreadyExists');
    }
    files.set(destination.uri, files.get(this.uri) ?? '');
  }
  delete() {
    const error = injected('delete', this.uri);
    if (error) throw error;
    files.delete(this.uri);
  }
}

export const Paths = { document: 'file:///document', cache: 'file:///cache' };

/** Test helpers (not part of expo-file-system). */
export const __fs = {
  reset: () => {
    files.clear();
    __fs.clearFailures();
    copyLog.length = 0;
  },
  put: (uri: string, content = '') => files.set(uri, content),
  has: (uri: string) => files.has(uri),
  read: (uri: string) => files.get(uri),
  /** All stored file URIs. */
  list: () => [...files.keys()],
  /** Every copy() attempted since reset (including failed ones), in order. */
  copies: () => [...copyLog],
  /** Fail the next call of this operation once (move/copy/json reject; the others throw). */
  failNext: (op: Op, error: Error = new Error(`${op} failed`)) => {
    failOnce.set(op, error);
  },
  /** Fail every call of this operation whose file URI matches the predicate. */
  failWhen: (
    op: Op,
    predicate: (uri: string) => boolean,
    error: Error = new Error(`${op} failed`),
  ) => {
    failPredicates.push({ op, predicate, error });
  },
  clearFailures: () => {
    failOnce.clear();
    failPredicates.length = 0;
  },
};
