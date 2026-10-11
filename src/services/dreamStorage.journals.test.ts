import * as fakeFs from '../test/fakeFileSystem';
import { Dream } from '../types/dream';
import { entriesFor } from '../utils/journals';
import { deleteDream, listDreams, resetCorruptCopyGuard, saveDream } from './dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const DOC = 'file:///document';
const INDEX = `${DOC}/dreams.json`;
const BAK = `${DOC}/dreams.json.bak`;

const rec = (id: string, extra: Partial<Dream> = {}): Dream => ({
  id,
  createdAt: `2026-10-0${id.slice(-1)}T08:00:00.000Z`,
  durationMs: 0,
  title: `Title ${id}`,
  tags: [],
  ...extra,
});
const raw = () => JSON.parse(__fs.read(INDEX)!) as Dream[];
const rawOf = (id: string) => raw().find((d) => d.id === id);
const ids = (list: Dream[]) => list.map((d) => d.id).sort();

const LEGACY = rec('2001', { transcript: 'legacy dream words here' });
const DREAM = rec('2002', { journalId: 'dreams', transcript: 'new dream words here' });
const LIFE = rec('2003', { journalId: 'life', transcript: 'life entry secret words' });
const FUTURE = rec('2004', { journalId: 'work', transcript: 'future journal words' });

function seed(list: Dream[]) {
  __fs.put(INDEX, JSON.stringify(list));
  __fs.put(BAK, JSON.stringify(list));
}

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
});

describe('journalId reads', () => {
  it('lists a legacy record as dreams without rewriting it', async () => {
    seed([LEGACY, LIFE]);
    const before = __fs.read(INDEX);
    const all = await listDreams();
    expect(all.find((d) => d.id === '2001')).not.toHaveProperty('journalId');
    expect(ids(entriesFor(all, 'dreams'))).toEqual(['2001']);
    expect(ids(entriesFor(all, 'life'))).toEqual(['2003']);
    expect(__fs.read(INDEX)).toBe(before);
  });
});

describe('journalId on save', () => {
  it('editing a legacy record keeps its stored shape (no journalId added or changed)', async () => {
    seed([LEGACY, LIFE]);
    await saveDream({
      id: '2001',
      journalId: 'life', // ignored on update
      details: { title: 'Edited title', tags: ['x'] },
      status: 'saved',
    });
    const stored = rawOf('2001')!;
    expect(stored).not.toHaveProperty('journalId');
    expect(stored.title).toBe('Edited title');
    expect(rawOf('2003')).toEqual(LIFE);
  });

  it('editing a stamped record never changes its journal', async () => {
    seed([LIFE]);
    await saveDream({
      id: '2003',
      journalId: 'dreams',
      details: { title: 'Renamed', tags: [] },
      status: 'saved',
    });
    expect(rawOf('2003')!.journalId).toBe('life');
  });

  it('a new save is stamped dreams by default and life when asked, leaving others byte-identical', async () => {
    seed([LEGACY, FUTURE]);
    const a = await saveDream({ details: { title: 'A dream', tags: [] }, status: 'saved' });
    expect(a.journalId).toBe('dreams');
    expect(rawOf(a.id)!.journalId).toBe('dreams');

    const beforeOthers = [rawOf('2001'), rawOf('2004')];
    const life = await saveDream({
      journalId: 'life',
      requireTitle: false,
      details: { title: '', tags: [], transcript: 'a day' },
      status: 'saved',
    });
    expect(rawOf(life.id)!.journalId).toBe('life');
    expect([rawOf('2001'), rawOf('2004')]).toEqual(beforeOthers);
    expect(rawOf('2001')).toEqual(LEGACY);
    expect(rawOf('2004')).toEqual(FUTURE);
  });

  it('keeps an unknown journalId through a save and a delete of other records', async () => {
    seed([LEGACY, LIFE, FUTURE]);
    await saveDream({
      id: '2001',
      details: { title: 'Edited', tags: [] },
      status: 'saved',
    });
    expect(rawOf('2004')).toEqual(FUTURE);
    await deleteDream('2003');
    expect(rawOf('2004')).toEqual(FUTURE);
    expect(JSON.parse(__fs.read(BAK)!).find((d: Dream) => d.id === '2004')).toEqual(FUTURE);
    const all = await listDreams();
    expect(ids(entriesFor(all, 'dreams'))).toEqual(['2001']);
    expect(entriesFor(all, 'life')).toEqual([]);
    expect(ids(entriesFor(all, 'work'))).toEqual(['2004']);
  });
});

describe('requireTitle', () => {
  it('saves an untitled finished entry when requireTitle is false', async () => {
    const e = await saveDream({
      journalId: 'life',
      requireTitle: false,
      details: { title: '  ', tags: [], transcript: 'Today' },
      status: 'saved',
    });
    expect(e.title).toBe('');
    expect(e.status).toBeUndefined();
    expect(rawOf(e.id)).toMatchObject({ title: '', journalId: 'life' });
  });

  it('still requires a title by default', async () => {
    await expect(saveDream({ details: { title: ' ', tags: [] }, status: 'saved' })).rejects.toThrow(
      'A title is required',
    );
    await expect(
      saveDream({ journalId: 'life', details: { title: '', tags: [] }, status: 'saved' }),
    ).rejects.toThrow('A title is required');
    expect(__fs.has(INDEX)).toBe(false);
  });
});

describe('deleteDream across journals', () => {
  it('scrubs a Life entry from the backup and a safety copy, leaving Dreams entries', async () => {
    seed([LEGACY, DREAM, LIFE]);
    const copy = `${DOC}/dreams.corrupt-1700000000000.json`;
    __fs.put(copy, JSON.stringify([LEGACY, DREAM, LIFE]).slice(0, -20)); // cut, all ids live
    await deleteDream('2003');
    expect(ids(await listDreams())).toEqual(['2001', '2002']);
    expect(__fs.read(BAK)).not.toContain('life entry secret words');
    expect(__fs.read(BAK)).not.toContain('"2003"');
    expect(__fs.read(INDEX)).not.toContain('2003');
    expect(__fs.has(copy)).toBe(false);
    expect(rawOf('2001')).toEqual(LEGACY);
    expect(rawOf('2002')).toEqual(DREAM);
  });

  it('a safety copy holding an id missing from the live index still blocks the delete', async () => {
    seed([DREAM, LIFE]);
    const ghost = rec('2009', { journalId: 'dreams' });
    const copy = `${DOC}/dreams.corrupt-1.json`;
    __fs.put(copy, JSON.stringify([DREAM, LIFE, ghost]));
    await expect(deleteDream('2003')).rejects.toMatchObject({
      code: 'SAFETY_COPY_HOLDS_OTHER_DREAMS',
    });
    expect(__fs.has(copy)).toBe(true);
    expect(ids(await listDreams())).toEqual(['2002', '2003']);
  });
});
