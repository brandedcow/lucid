import { File } from 'expo-file-system';
import { __fs } from '../test/fakeFileSystem';
import { readSettings, writeSettings } from './settingsStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const FILE = 'file:///document/settings.json';

beforeEach(() => __fs.reset());

describe('readSettings', () => {
  it('defaults to true when the file is missing', async () => {
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: true });
  });

  it.each([
    ['zero-length', ''],
    ['corrupt JSON', '{"autoOpen'],
    ['an array', '[false]'],
    ['null', 'null'],
    ['a string', '"false"'],
    ['an empty object', '{}'],
    ['a string value', '{"autoOpenDreamCapture":"false"}'],
    ['a number value', '{"autoOpenDreamCapture":0}'],
    ['a null value', '{"autoOpenDreamCapture":null}'],
  ])('defaults to true for %s', async (_name, content) => {
    __fs.put(FILE, content);
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: true });
  });

  it('defaults to true when the file cannot be read', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    __fs.failNext('json');
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: true });
  });

  it('reads a stored false', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: false });
  });
});

describe('writeSettings', () => {
  it('round trips true and false', async () => {
    await writeSettings({ autoOpenDreamCapture: false });
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: false });
    await writeSettings({ autoOpenDreamCapture: true });
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: true });
  });

  it('preserves unknown keys in a valid file', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":true,"later":{"a":1}}');
    await writeSettings({ autoOpenDreamCapture: false });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
      later: { a: 1 },
    });
  });

  it('writes only the patched keys over a corrupt file', async () => {
    __fs.put(FILE, '{"autoOpen');
    await writeSettings({ autoOpenDreamCapture: false });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({ autoOpenDreamCapture: false });
  });

  it('writes over a zero-length file', async () => {
    __fs.put(FILE, '');
    await writeSettings({ autoOpenDreamCapture: false });
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: false });
  });

  it('never deletes the file, even when a write fails or leaves damage', async () => {
    const del = jest.spyOn(File.prototype, 'delete');
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    __fs.failNext('write', new Error('disk full'), { leave: 'empty' });
    await writeSettings({ autoOpenDreamCapture: true });
    expect(__fs.has(FILE)).toBe(true);
    await writeSettings({ autoOpenDreamCapture: true });
    expect(__fs.has(FILE)).toBe(true);
    expect(del).not.toHaveBeenCalled();
    del.mockRestore();
  });

  it('swallows a write failure and a read failure', async () => {
    __fs.failNext('write');
    await expect(writeSettings({ autoOpenDreamCapture: false })).resolves.toBeUndefined();
    __fs.put(FILE, '{}');
    __fs.failNext('json');
    await expect(writeSettings({ autoOpenDreamCapture: false })).resolves.toBeUndefined();
  });

  it('ends on the last value after two quick writes', async () => {
    const first = writeSettings({ autoOpenDreamCapture: false });
    const second = writeSettings({ autoOpenDreamCapture: true });
    await Promise.all([first, second]);
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: true });
    const a = writeSettings({ autoOpenDreamCapture: true });
    const b = writeSettings({ autoOpenDreamCapture: false });
    await Promise.all([a, b]);
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: false });
  });
});
