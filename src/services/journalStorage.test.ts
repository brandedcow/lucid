import { __fs } from '../test/fakeFileSystem';
import {
  addJournal,
  JournalError,
  loadJournals,
  removeJournal,
  renameJournal,
  resetJournalStorageForTests,
} from './journalStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const FILE = 'file:///document/journals.json';
const TEMP = 'file:///document/journals.tmp.json';
const stored = () => JSON.parse(__fs.read(FILE) ?? 'null');
const corruptCopies = () => __fs.list().filter((u) => /journals\.corrupt-\d+\.json$/.test(u));

const j = (id: string, name: string) => ({
  id,
  name,
  kind: 'journal',
  createdAt: '2026-10-10T00:00:00.000Z',
});

beforeEach(() => {
  __fs.reset();
  resetJournalStorageForTests();
});

describe('loadJournals', () => {
  it('is empty when the file is missing', async () => {
    expect(await loadJournals()).toEqual([]);
  });

  it.each([
    ['zero-length', ''],
    ['corrupt JSON', '{"version":1,"jour'],
    ['an array', '[]'],
    ['null', 'null'],
    ['journals not an array', '{"version":1,"journals":{}}'],
    ['no journals key', '{"version":1}'],
  ])('is empty for %s and leaves the file alone', async (_n, content) => {
    __fs.put(FILE, content);
    expect(await loadJournals()).toEqual([]);
    expect(__fs.read(FILE)).toBe(content);
  });

  it('is empty when the file cannot be read', async () => {
    __fs.put(FILE, JSON.stringify({ version: 1, journals: [j('j_a', 'A')] }));
    __fs.failNext('text');
    expect(await loadJournals()).toEqual([]);
  });

  it('drops bad journals individually and does not touch the file', async () => {
    const content = JSON.stringify({
      version: 1,
      journals: [
        j('j_good', 'Good'),
        null,
        'x',
        { ...j('j_noname', ''), name: '  ' },
        { ...j('j_badkind', 'Kind'), kind: 'dream' },
        { ...j('j_nodate', 'Date'), createdAt: 5 },
        j('dreams', 'Dreams'),
        j('life', 'Life'),
        j('__proto__', 'Proto'),
        j('toString', 'ToString'),
        j('j_good', 'Duplicate id'),
        j('j_two', 'Two'),
      ],
    });
    __fs.put(FILE, content);
    expect(await loadJournals()).toEqual([
      { id: 'j_good', name: 'Good', kind: 'journal' },
      { id: 'j_two', name: 'Two', kind: 'journal' },
    ]);
    expect(__fs.read(FILE)).toBe(content);
  });
});

describe('addJournal', () => {
  it('creates the file with a normalized name and an opaque id', async () => {
    const { journal, journals } = await addJournal('  Grati   tude ');
    expect(journal).toMatchObject({ name: 'Grati tude', kind: 'journal' });
    expect(journal.id).toMatch(/^j_[a-z0-9]+$/);
    expect(journals).toEqual([journal]);
    const file = stored();
    expect(file.version).toBe(1);
    expect(file.journals).toHaveLength(1);
    expect(file.journals[0]).toMatchObject({ id: journal.id, name: 'Grati tude', kind: 'journal' });
    expect(Number.isNaN(Date.parse(file.journals[0].createdAt))).toBe(false);
    expect(await loadJournals()).toEqual([journal]);
  });

  it('never stores built-in journals', async () => {
    await addJournal('One');
    expect(stored().journals.map((x: { id: string }) => x.id)).not.toContain('dreams');
    expect(stored().journals).toHaveLength(1);
  });

  it('keeps creation order and gives unique ids that are never built-in or prototype keys', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push((await addJournal(`J${i}`)).journal.id);
    expect(new Set(ids).size).toBe(30);
    for (const id of ids) {
      expect(['dreams', 'life', '__proto__', 'toString', 'constructor']).not.toContain(id);
    }
    expect((await loadJournals()).map((x) => x.id)).toEqual(ids);
  });

  it('does not derive the id from the name', async () => {
    const a = await addJournal('dreams 2');
    expect(a.journal.id).not.toContain('dreams');
    const b = await addJournal('toString');
    const c = await addJournal('__proto__');
    expect(b.journal.id).not.toBe('toString');
    expect(c.journal.id).not.toBe('__proto__');
  });

  it('accepts toString and __proto__ as names without breaking lookups', async () => {
    const a = await addJournal('toString');
    const b = await addJournal('__proto__');
    const c = await addJournal('Other');
    expect((await loadJournals()).map((x) => x.name)).toEqual(['toString', '__proto__', 'Other']);
    const renamed = await renameJournal(c.journal.id, 'constructor');
    expect(renamed.journal.name).toBe('constructor');
    await removeJournal(b.journal.id);
    expect((await loadJournals()).map((x) => x.id)).toEqual([a.journal.id, c.journal.id]);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['x'.repeat(25), 'too-long'],
    ['dreams', 'duplicate'],
    [' LIFE ', 'duplicate'],
  ])('rejects %j as %s without writing', async (name, reason) => {
    await expect(addJournal(name)).rejects.toMatchObject({ code: 'invalid-name', reason });
    expect(__fs.has(FILE)).toBe(false);
    expect(__fs.has(TEMP)).toBe(false);
  });

  it('rejects a case-insensitive duplicate of a custom journal', async () => {
    await addJournal('Gratitude');
    const err = await addJournal('gRaTiTuDe').catch((e) => e);
    expect(err).toBeInstanceOf(JournalError);
    expect(err).toMatchObject({ code: 'invalid-name', reason: 'duplicate' });
    expect(await loadJournals()).toHaveLength(1);
  });

  it('preserves unknown top-level keys and unknown keys on journals', async () => {
    __fs.put(
      FILE,
      JSON.stringify({
        version: 1,
        future: { a: 1 },
        journals: [{ ...j('j_a', 'A'), color: 'red' }],
      }),
    );
    await addJournal('B');
    const file = stored();
    expect(file.future).toEqual({ a: 1 });
    expect(file.journals[0].color).toBe('red');
    expect(file.journals).toHaveLength(2);
  });

  it('writes the temp file first, then moves it over journals.json, and never deletes', async () => {
    const order: string[] = [];
    const fs =
      jest.requireActual<typeof import('../test/fakeFileSystem')>('../test/fakeFileSystem');
    const origWrite = fs.File.prototype.write;
    const origMove = fs.File.prototype.move;
    const origDelete = fs.File.prototype.delete;
    const w = jest.spyOn(fs.File.prototype, 'write').mockImplementation(function (
      this: { uri: string },
      c: string,
    ) {
      order.push(`write ${this.uri}`);
      return origWrite.call(this, c);
    });
    const m = jest.spyOn(fs.File.prototype, 'move').mockImplementation(async function (
      this: { uri: string },
      d: InstanceType<typeof fs.File>,
      o?: { overwrite?: boolean },
    ) {
      order.push(`move ${this.uri} -> ${d.uri}`);
      return origMove.call(this, d, o);
    });
    const d = jest.spyOn(fs.File.prototype, 'delete').mockImplementation(function (this: {
      uri: string;
    }) {
      order.push(`delete ${this.uri}`);
      return origDelete.call(this);
    });
    try {
      await addJournal('A');
      await addJournal('B');
      await removeJournal((await loadJournals())[0].id);
    } finally {
      w.mockRestore();
      m.mockRestore();
      d.mockRestore();
    }
    expect(order.slice(0, 2)).toEqual([`write ${TEMP}`, `move ${TEMP} -> ${FILE}`]);
    expect(order.some((o) => o.startsWith('delete'))).toBe(false);
    expect(order.filter((o) => o.startsWith('write') && o.endsWith('journals.json'))).toEqual([]);
  });

  it('leaves the existing file intact when the temp write fails', async () => {
    await addJournal('A');
    const before = __fs.read(FILE);
    __fs.failNext('write', new Error('disk full'), { leave: 'empty' });
    await expect(addJournal('B')).rejects.toThrow('disk full');
    expect(__fs.read(FILE)).toBe(before);
  });

  it('leaves the existing file intact when the move fails', async () => {
    await addJournal('A');
    const before = __fs.read(FILE);
    __fs.failNext('move', new Error('nope'));
    await expect(addJournal('B')).rejects.toThrow('nope');
    expect(__fs.read(FILE)).toBe(before);
    expect(await loadJournals()).toHaveLength(1);
  });

  it('never writes a zero-length journals.json', async () => {
    await addJournal('A');
    expect(__fs.read(FILE)).not.toBe('');
    await removeJournal((await loadJournals())[0].id);
    expect(__fs.read(FILE)).toBe('{"version":1,"journals":[]}');
  });

  it('serializes concurrent adds so none is lost', async () => {
    const results = await Promise.all(['A', 'B', 'C', 'D'].map((n) => addJournal(n)));
    expect((await loadJournals()).map((x) => x.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(results.map((r) => r.journal.id)).size).toBe(4);
  });

  it('serializes concurrent duplicate names: exactly one wins', async () => {
    const results = await Promise.allSettled([addJournal('Same'), addJournal('same')]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await loadJournals()).toHaveLength(1);
  });

  it('keeps working after a failed change', async () => {
    __fs.failNext('write', new Error('x'));
    await expect(addJournal('A')).rejects.toThrow('x');
    await addJournal('A');
    expect(await loadJournals()).toHaveLength(1);
  });
});

describe('corrupt files', () => {
  it('copies a corrupt file once before the first overwrite and keeps the original content in the copy', async () => {
    const bad = '{"version":1,"journals":[{"id":';
    __fs.put(FILE, bad);
    await addJournal('A');
    const copies = corruptCopies();
    expect(copies).toHaveLength(1);
    expect(__fs.read(copies[0])).toBe(bad);
    expect(stored().journals).toHaveLength(1);
    // File is clean now: further changes make no more copies.
    await addJournal('B');
    expect(corruptCopies()).toHaveLength(1);
  });

  it('does not overwrite a corrupt file when the copy fails', async () => {
    const bad = 'not json';
    __fs.put(FILE, bad);
    __fs.failNext('copy', new Error('no space'));
    await expect(addJournal('A')).rejects.toThrow('no space');
    expect(__fs.read(FILE)).toBe(bad);
    expect(__fs.has(TEMP)).toBe(false);
    expect(corruptCopies()).toHaveLength(0);
  });

  it('copies only once when a write fails and is retried', async () => {
    __fs.put(FILE, 'garbage');
    __fs.failNext('write', new Error('disk full'));
    await expect(addJournal('A')).rejects.toThrow('disk full');
    expect(corruptCopies()).toHaveLength(1);
    await addJournal('A');
    expect(corruptCopies()).toHaveLength(1);
    expect(__fs.read(corruptCopies()[0])).toBe('garbage');
  });

  it('treats wrong-shape files as corrupt', async () => {
    __fs.put(FILE, '[1,2]');
    await addJournal('A');
    expect(corruptCopies()).toHaveLength(1);
  });

  it('copies a file that had dropped journals, so no stored data is lost silently', async () => {
    const content = JSON.stringify({ version: 1, journals: [j('j_a', 'A'), { id: 5 }] });
    __fs.put(FILE, content);
    await addJournal('B');
    expect(corruptCopies()).toHaveLength(1);
    expect(__fs.read(corruptCopies()[0])).toBe(content);
    expect(stored().journals).toHaveLength(2);
  });

  it('does not copy a missing or zero-length file', async () => {
    __fs.put(FILE, '');
    await addJournal('A');
    expect(corruptCopies()).toHaveLength(0);
  });

  it('does not copy a healthy file', async () => {
    await addJournal('A');
    await addJournal('B');
    expect(corruptCopies()).toHaveLength(0);
  });

  it('never overwrites an existing corrupt copy', async () => {
    __fs.put(FILE, 'bad one');
    await addJournal('A');
    const first = corruptCopies()[0];
    __fs.put(FILE, 'bad two');
    resetJournalStorageForTests();
    await addJournal('B');
    expect(corruptCopies()).toHaveLength(2);
    expect(__fs.read(first)).toBe('bad one');
  });
});

describe('renameJournal', () => {
  it('renames only that journal and keeps id, order, date and unknown keys', async () => {
    __fs.put(
      FILE,
      JSON.stringify({ version: 1, extra: true, journals: [j('j_a', 'A'), j('j_b', 'B')] }),
    );
    const { journal } = await renameJournal('j_a', '  New   name ');
    expect(journal).toEqual({ id: 'j_a', name: 'New name', kind: 'journal' });
    const file = stored();
    expect(file.extra).toBe(true);
    expect(file.journals[0]).toEqual({ ...j('j_a', 'New name') });
    expect(file.journals[1]).toEqual(j('j_b', 'B'));
  });

  it('returns a new journal object, not the old one changed (copy is cached by object identity)', async () => {
    __fs.put(FILE, JSON.stringify({ version: 1, journals: [j('j_a', 'A')] }));
    const [before] = await loadJournals();
    const { journal, journals } = await renameJournal('j_a', 'B');
    expect(journal).not.toBe(before);
    expect(journals[0]).toBe(journal);
    expect(before.name).toBe('A');
  });

  it('allows keeping or recasing its own name but not taking another journal name', async () => {
    __fs.put(FILE, JSON.stringify({ version: 1, journals: [j('j_a', 'A'), j('j_b', 'B')] }));
    await expect(renameJournal('j_a', 'a')).resolves.toBeDefined();
    await expect(renameJournal('j_a', 'b')).rejects.toMatchObject({ reason: 'duplicate' });
    await expect(renameJournal('j_a', 'Dreams')).rejects.toMatchObject({ reason: 'duplicate' });
    await expect(renameJournal('j_a', '')).rejects.toMatchObject({ reason: 'empty' });
    await expect(renameJournal('j_a', 'x'.repeat(25))).rejects.toMatchObject({
      reason: 'too-long',
    });
  });

  it.each(['dreams', 'life'])('refuses built-in id %s and writes nothing', async (id) => {
    await expect(renameJournal(id, 'Anything')).rejects.toMatchObject({ code: 'built-in' });
    expect(__fs.has(FILE)).toBe(false);
  });

  it.each(['j_missing', '__proto__', 'toString'])(
    'refuses unknown id %s and writes nothing',
    async (id) => {
      await addJournal('A');
      const before = __fs.read(FILE);
      await expect(renameJournal(id, 'Other')).rejects.toMatchObject({ code: 'not-found' });
      expect(__fs.read(FILE)).toBe(before);
    },
  );
});

describe('removeJournal', () => {
  it('removes only that journal, preserving others and unknown keys', async () => {
    __fs.put(
      FILE,
      JSON.stringify({
        version: 1,
        future: [1],
        journals: [j('j_a', 'A'), j('j_b', 'B'), j('j_c', 'C')],
      }),
    );
    const { journals } = await removeJournal('j_b');
    expect(journals.map((x) => x.id)).toEqual(['j_a', 'j_c']);
    const file = stored();
    expect(file.future).toEqual([1]);
    expect(file.journals).toEqual([j('j_a', 'A'), j('j_c', 'C')]);
  });

  it('writes an empty list, not an empty file, when the last journal goes', async () => {
    __fs.put(FILE, JSON.stringify({ version: 1, journals: [j('j_a', 'A')] }));
    await removeJournal('j_a');
    expect(__fs.has(FILE)).toBe(true);
    expect(__fs.read(FILE)).toBe('{"version":1,"journals":[]}');
  });

  it.each(['dreams', 'life'])('refuses built-in id %s', async (id) => {
    await addJournal('A');
    const before = __fs.read(FILE);
    await expect(removeJournal(id)).rejects.toMatchObject({ code: 'built-in' });
    expect(__fs.read(FILE)).toBe(before);
  });

  it.each(['j_missing', '__proto__', 'toString'])('refuses unknown id %s', async (id) => {
    await addJournal('A');
    const before = __fs.read(FILE);
    await expect(removeJournal(id)).rejects.toMatchObject({ code: 'not-found' });
    expect(__fs.read(FILE)).toBe(before);
  });
});

describe('tmp file recovery', () => {
  const good = (id: string, name: string) =>
    JSON.stringify({ version: 1, journals: [j(id, name)] });
  const ops = () => {
    const fs =
      jest.requireActual<typeof import('../test/fakeFileSystem')>('../test/fakeFileSystem');
    const log: string[] = [];
    const spies = (['write', 'delete'] as const).map((op) =>
      jest.spyOn(fs.File.prototype, op).mockImplementation(function (this: unknown) {
        log.push(op);
        throw new Error('read must not call ' + op);
      }),
    );
    const move = jest.spyOn(fs.File.prototype, 'move').mockImplementation(async () => {
      log.push('move');
      throw new Error('read must not move');
    });
    const copy = jest.spyOn(fs.File.prototype, 'copy').mockImplementation(async () => {
      log.push('copy');
      throw new Error('read must not copy');
    });
    return { log, restore: () => [...spies, move, copy].forEach((s) => s.mockRestore()) };
  };

  it('loads the tmp file when journals.json is missing', async () => {
    __fs.put(TEMP, good('j_t', 'Tmp'));
    expect((await loadJournals()).map((x) => x.id)).toEqual(['j_t']);
  });

  it('loads the tmp file when journals.json is zero-length', async () => {
    __fs.put(FILE, '');
    __fs.put(TEMP, good('j_t', 'Tmp'));
    expect((await loadJournals()).map((x) => x.id)).toEqual(['j_t']);
  });

  it('ignores a corrupt tmp file: empty, no throw, nothing deleted', async () => {
    __fs.put(TEMP, '{"journ');
    expect(await loadJournals()).toEqual([]);
    expect(__fs.read(TEMP)).toBe('{"journ');
    expect(__fs.has(FILE)).toBe(false);
  });

  it('ignores an unreadable tmp file', async () => {
    __fs.put(TEMP, good('j_t', 'Tmp'));
    __fs.failNext('text');
    expect(await loadJournals()).toEqual([]);
  });

  it('main wins over a different tmp when both are valid', async () => {
    __fs.put(FILE, good('j_m', 'Main'));
    __fs.put(TEMP, good('j_t', 'Tmp'));
    expect((await loadJournals()).map((x) => x.id)).toEqual(['j_m']);
  });

  it('does not consult tmp when journals.json is non-empty and corrupt', async () => {
    __fs.put(FILE, 'garbage');
    __fs.put(TEMP, good('j_t', 'Tmp'));
    expect(await loadJournals()).toEqual([]);
    await addJournal('New');
    expect(corruptCopies()).toHaveLength(1);
    expect(__fs.read(corruptCopies()[0])).toBe('garbage');
    expect((await loadJournals()).map((x) => x.name)).toEqual(['New']);
  });

  it('the next write after recovery keeps the recovered journal and adds the new one', async () => {
    __fs.put(TEMP, good('j_t', 'Tmp'));
    await addJournal('New');
    expect((stored().journals as { name: string }[]).map((x) => x.name)).toEqual(['Tmp', 'New']);
    expect(corruptCopies()).toHaveLength(0);
    expect((await loadJournals()).map((x) => x.name)).toEqual(['Tmp', 'New']);
  });

  it('a read never writes, moves, copies or deletes', async () => {
    __fs.put(TEMP, good('j_t', 'Tmp'));
    const spy = ops();
    try {
      expect(await loadJournals()).toHaveLength(1);
      __fs.put(FILE, 'garbage');
      expect(await loadJournals()).toEqual([]);
    } finally {
      spy.restore();
    }
    expect(spy.log).toEqual([]);
    expect(__fs.has(TEMP)).toBe(true);
    expect(__fs.read(FILE)).toBe('garbage');
  });

  it('a read during an in-flight write sees the old or new list, never empty', async () => {
    await addJournal('Old');
    const fs =
      jest.requireActual<typeof import('../test/fakeFileSystem')>('../test/fakeFileSystem');
    const origMove = fs.File.prototype.move;
    // The replace removes the destination first, then yields before finishing.
    const move = jest.spyOn(fs.File.prototype, 'move').mockImplementation(async function (
      this: InstanceType<typeof fs.File>,
      d,
      o,
    ) {
      if (d.exists) d.delete();
      await new Promise((r) => setTimeout(r, 5));
      return origMove.call(this, d, o);
    });
    try {
      const write = addJournal('New');
      const reads = await Promise.all([loadJournals(), loadJournals()]);
      await write;
      for (const r of reads) {
        expect([1, 2]).toContain(r.length);
        expect(r[0].name).toBe('Old');
      }
    } finally {
      move.mockRestore();
    }
  });

  it('a rejected queued task does not block later reads and writes', async () => {
    await expect(addJournal('')).rejects.toBeInstanceOf(JournalError);
    __fs.failNext('write', new Error('x'));
    await expect(addJournal('A')).rejects.toThrow('x');
    expect(await loadJournals()).toEqual([]);
    await addJournal('B');
    expect((await loadJournals()).map((x) => x.name)).toEqual(['B']);
  });
});
