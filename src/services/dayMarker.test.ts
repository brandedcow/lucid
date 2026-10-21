import { File } from 'expo-file-system';
import * as fakeFs from '../test/fakeFileSystem';
import { readDoneDate, writeDoneDate } from './dayMarker';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const MARKER = 'file:///document/no-dream.json';

beforeEach(() => __fs.reset());
afterEach(() => jest.restoreAllMocks());

describe('readDoneDate', () => {
  it('is null when the file is missing', async () => {
    expect(await readDoneDate()).toBeNull();
  });

  it.each([
    ['zero-length', ''],
    ['corrupt JSON', '{"noDream'],
    ['a list', '[]'],
    ['null', 'null'],
    ['wrong shape', '{"other":"2026-10-10"}'],
    ['a non-string date', '{"noDreamDate":20261010}'],
    ['a bad date', '{"noDreamDate":"2026-1-5"}'],
    ['a date with text', '{"noDreamDate":"2026-10-10T08:00"}'],
  ])('is null for %s', async (_name, content) => {
    __fs.put(MARKER, content);
    expect(await readDoneDate()).toBeNull();
  });

  it('is null when reading fails', async () => {
    __fs.put(MARKER, '{"noDreamDate":"2026-10-10"}');
    __fs.failNext('json');
    expect(await readDoneDate()).toBeNull();
  });

  it('reads a stored date', async () => {
    __fs.put(MARKER, '{"noDreamDate":"2026-10-10"}');
    expect(await readDoneDate()).toBe('2026-10-10');
  });
});

describe('writeDoneDate', () => {
  it('round trips and stores only the date', async () => {
    await writeDoneDate('2026-10-10');
    expect(await readDoneDate()).toBe('2026-10-10');
    expect(JSON.parse(__fs.read(MARKER) ?? '')).toEqual({ noDreamDate: '2026-10-10' });
  });

  it('overwrites the previous date', async () => {
    await writeDoneDate('2026-10-09');
    await writeDoneDate('2026-10-10');
    expect(await readDoneDate()).toBe('2026-10-10');
    expect(__fs.read(MARKER)).not.toContain('2026-10-09');
  });

  it('lives outside dreams/ and the index', async () => {
    await writeDoneDate('2026-10-10');
    expect(__fs.list()).toEqual([MARKER]);
  });

  it('never deletes the file', async () => {
    const del = jest.spyOn(File.prototype, 'delete');
    await writeDoneDate('2026-10-09');
    await writeDoneDate('2026-10-10');
    await readDoneDate();
    __fs.put(MARKER, 'garbage');
    await readDoneDate();
    await writeDoneDate('2026-10-11');
    expect(del).not.toHaveBeenCalled();
    expect(__fs.has(MARKER)).toBe(true);
  });

  it('swallows a write failure and keeps the old file', async () => {
    await writeDoneDate('2026-10-09');
    __fs.failNext('write');
    await expect(writeDoneDate('2026-10-10')).resolves.toBeUndefined();
    expect(await readDoneDate()).toBe('2026-10-09');
  });
});
