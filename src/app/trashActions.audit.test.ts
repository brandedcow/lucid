// Typed by hand, like the other source-audit tests: the project has no Node type definitions.
const fs = jest.requireActual('fs') as {
  readdirSync(path: string): string[];
  statSync(path: string): { isDirectory(): boolean };
  readFileSync(path: string, encoding: 'utf8'): string;
};
const path = jest.requireActual('path') as {
  sep: string;
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
};

// The proof that only the provider can delete notes for good: it alone calls `deleteForever` and
// `emptyTrash`, and the only files that import the write functions from notesStorage are the two
// hooks. A new caller fails here and must be reviewed on purpose.
const ROOT = process.cwd();
const rel = (file: string) => path.relative(ROOT, file).split(path.sep).join('/');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file) || file.includes('/src/test/');
const files = sources(path.join(ROOT, 'src'))
  .filter((f) => !isTest(f) && !rel(f).startsWith('src/services/'))
  .map((f) => ({ name: rel(f), source: fs.readFileSync(f, 'utf8') }));
const withText = (re: RegExp) =>
  files
    .filter((f) => re.test(f.source))
    .map((f) => f.name)
    .sort();

describe('only the provider deletes notes for good', () => {
  it('scans the real source tree', () => {
    const names = files.map((f) => f.name);
    expect(names).toContain('src/app/AppFlowProvider.tsx');
    expect(names).toContain('src/hooks/useNotes.ts');
  });

  it('calls .deleteForever( and .emptyTrash( only in the provider', () => {
    expect(withText(/\.deleteForever\(/)).toEqual(['src/app/AppFlowProvider.tsx']);
    expect(withText(/\.emptyTrash\(/)).toEqual(['src/app/AppFlowProvider.tsx']);
  });

  it('references the two confirm dialogs only from the provider (and their own file)', () => {
    expect(withText(/\bconfirmDeleteForever\b/)).toEqual([
      'src/app/AppFlowProvider.tsx',
      'src/utils/confirmForever.ts',
    ]);
    expect(withText(/\bconfirmEmptyTrash\b/)).toEqual([
      'src/app/AppFlowProvider.tsx',
      'src/utils/confirmForever.ts',
    ]);
  });

  it('only the two note hooks import the write functions from notesStorage', () => {
    const writers =
      /\b(softDeleteNote|restoreNote|setPinned|deleteNoteForever|emptyRecentlyDeleted)\b/;
    const importing = files
      .filter((f) => {
        // Every import statement from notesStorage in the file, names included.
        const imports = f.source.match(/import\s[^;]*?from\s+['"][^'"]*notesStorage['"]/g) ?? [];
        return imports.some((i) => writers.test(i));
      })
      .map((f) => f.name)
      .sort();
    expect(importing).toEqual(['src/hooks/useNoteSession.ts', 'src/hooks/useNotes.ts']);
  });

  it('screens, components, navigation and the provider import only types and error codes from notesStorage', () => {
    const allowed = new Set(['Note', 'type Note', 'INDEX_UNREADABLE', 'NOTE_IN_TRASH']);
    const ui = files.filter((f) => /^src\/(screens|components|navigation|app)\//.test(f.name));
    const found: string[] = [];
    for (const f of ui) {
      for (const m of f.source.matchAll(
        /import\s*\{([^}]*)\}\s*from\s+['"][^'"]*notesStorage['"]/g,
      )) {
        for (const raw of m[1].split(',')) {
          const name = raw.trim().replace(/\s+/g, ' ');
          if (name && !allowed.has(name)) found.push(`${f.name}: ${name}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
