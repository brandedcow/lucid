// Typed by hand, like the other source-audit tests: the project has no Node type definitions.
const fs = jest.requireActual('fs') as {
  existsSync(path: string): boolean;
  statSync(path: string): { isFile(): boolean };
  readFileSync(path: string, encoding: 'utf8'): string;
};
const path = jest.requireActual('path') as {
  sep: string;
  resolve(...parts: string[]): string;
  dirname(p: string): string;
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
};

// The proof that the old UI is stopped from writing `dreams.json`: nothing reachable from App.tsx
// imports the old writers, and the file name appears only in the read-only importer.
const ROOT = process.cwd();
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
const IMPORT =
  /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]*)['"]|require\(\s*['"](\.{1,2}\/[^'"]*)['"]\s*\)/g;

function resolve(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  return null;
}

function closure(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    seen.set(file, source);
    for (const match of source.matchAll(IMPORT)) {
      const target = resolve(file, match[1] ?? match[2]);
      // Only source files are followed; assets (images, json) are leaves.
      if (target && /\.tsx?$/.test(target)) queue.push(target);
    }
  }
  return seen;
}

const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

describe('nothing reachable from App.tsx writes dreams.json', () => {
  const files = closure(path.join(ROOT, 'App.tsx'));
  const names = [...files.keys()].map(rel);

  it('follows the real import graph', () => {
    expect(names).toContain('App.tsx');
    expect(names).toContain('src/app/AppFlowProvider.tsx');
    expect(names).toContain('src/services/legacyImport.ts');
    expect(names).toContain('src/services/notesStorage.ts');
  });

  it.each([
    'src/services/dreamStorage.ts',
    'src/services/journalStorage.ts',
    'src/hooks/useDreamLibrary.ts',
    'src/hooks/useEntrySession.ts',
    'src/hooks/useJournals.ts',
  ])('does not reach %s', (writer) => {
    expect(names).not.toContain(writer);
  });

  it('mentions dreams.json only in the read-only importer', () => {
    const mentions = [...files.entries()]
      .filter(([, source]) => source.includes('dreams.json'))
      .map(([file]) => rel(file));
    expect(mentions).toEqual(['src/services/legacyImport.ts']);
  });
});
