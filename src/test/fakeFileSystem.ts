// In-memory stand-in for expo-file-system's File/Directory/Paths, for Jest.
// Usage: jest.mock('expo-file-system', () => require('../test/fakeFileSystem'));

const files = new Map<string, string>();

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
    if (!files.has(this.uri)) files.set(this.uri, '');
  }
  write(content: string) {
    files.set(this.uri, content);
  }
  async json() {
    return JSON.parse(files.get(this.uri) ?? '');
  }
  move(destination: File) {
    files.set(destination.uri, files.get(this.uri) ?? '');
    files.delete(this.uri);
    this.uri = destination.uri;
  }
  copy(destination: File) {
    files.set(destination.uri, files.get(this.uri) ?? '');
  }
  delete() {
    files.delete(this.uri);
  }
}

export const Paths = { document: 'file:///document', cache: 'file:///cache' };

/** Test helpers (not part of expo-file-system). */
export const __fs = {
  reset: () => files.clear(),
  put: (uri: string, content = '') => files.set(uri, content),
  has: (uri: string) => files.has(uri),
  read: (uri: string) => files.get(uri),
};
