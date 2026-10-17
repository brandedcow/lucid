import { File } from 'expo-file-system';
import { __fs } from '../test/fakeFileSystem';
import { readSettings, writeSettings } from './settingsStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const FILE = 'file:///document/settings.json';

beforeEach(() => __fs.reset());

describe('readSettings', () => {
  it('defaults to on (capture) and off (online transcription) when the file is missing', async () => {
    expect(await readSettings()).toEqual({
      autoOpenDreamCapture: true,
      onlineTranscription: false,
    });
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
    expect(await readSettings()).toEqual({
      autoOpenDreamCapture: true,
      onlineTranscription: false,
    });
  });

  it('defaults to true when the file cannot be read', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    __fs.failNext('json');
    expect(await readSettings()).toEqual({
      autoOpenDreamCapture: true,
      onlineTranscription: false,
    });
  });

  it('reads a stored false', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    expect(await readSettings()).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: false,
    });
  });
});

describe('writeSettings', () => {
  it('round trips true and false', async () => {
    await writeSettings({ autoOpenDreamCapture: false });
    expect(await readSettings()).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: false,
    });
    await writeSettings({ autoOpenDreamCapture: true });
    expect(await readSettings()).toEqual({
      autoOpenDreamCapture: true,
      onlineTranscription: false,
    });
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
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
    });
  });

  it('writes over a zero-length file', async () => {
    __fs.put(FILE, '');
    await writeSettings({ autoOpenDreamCapture: false });
    expect(await readSettings()).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: false,
    });
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
    expect(await readSettings()).toEqual({
      autoOpenDreamCapture: true,
      onlineTranscription: false,
    });
    const a = writeSettings({ autoOpenDreamCapture: true });
    const b = writeSettings({ autoOpenDreamCapture: false });
    await Promise.all([a, b]);
    expect(await readSettings()).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: false,
    });
  });
});

describe('onlineTranscription', () => {
  it('defaults to false', async () => {
    expect((await readSettings()).onlineTranscription).toBe(false);
  });

  it.each([
    ['a string', '{"onlineTranscription":"true"}'],
    ['a number', '{"onlineTranscription":1}'],
    ['null', '{"onlineTranscription":null}'],
    ['an object', '{"onlineTranscription":{"a":true}}'],
    ['corrupt JSON', '{"onlineTranscription":tru'],
    ['an array file', '[true]'],
    ['zero-length', ''],
  ])('is false for %s', async (_name, content) => {
    __fs.put(FILE, content);
    expect((await readSettings()).onlineTranscription).toBe(false);
  });

  it('is false when the file cannot be read', async () => {
    __fs.put(FILE, '{"onlineTranscription":true}');
    __fs.failNext('json');
    expect((await readSettings()).onlineTranscription).toBe(false);
  });

  it('write then read persists, and each key is validated on its own', async () => {
    await writeSettings({ onlineTranscription: true });
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: true, onlineTranscription: true });
    __fs.put(FILE, '{"autoOpenDreamCapture":"x","onlineTranscription":true}');
    expect(await readSettings()).toEqual({ autoOpenDreamCapture: true, onlineTranscription: true });
    await writeSettings({ onlineTranscription: false });
    expect((await readSettings()).onlineTranscription).toBe(false);
  });

  it('keeps the other key and unknown keys when written', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false,"later":1}');
    await writeSettings({ onlineTranscription: true });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: true,
      later: 1,
    });
  });

  it('a failed write never throws and the value stays false on disk', async () => {
    __fs.failNext('write');
    await expect(writeSettings({ onlineTranscription: true })).resolves.toBeUndefined();
    expect((await readSettings()).onlineTranscription).toBe(false);
  });
});
