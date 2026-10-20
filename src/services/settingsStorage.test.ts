import { File } from 'expo-file-system';
import { __fs } from '../test/fakeFileSystem';
import { readSettings, writeSettings } from './settingsStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const FILE = 'file:///document/settings.json';

beforeEach(() => __fs.reset());

describe('readSettings', () => {
  it('defaults to on (capture) and off (online transcription) when the file is missing', async () => {
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: false,
      tagSort: 'alpha',
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
      autoOpenNewNote: true,
      onlineTranscription: false,
      tagSort: 'alpha',
    });
  });

  it('defaults to true when the file cannot be read', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    __fs.failNext('json');
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: false,
      tagSort: 'alpha',
    });
  });

  it('reads a stored false', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    expect(await readSettings()).toEqual({
      autoOpenNewNote: false,
      onlineTranscription: false,
      tagSort: 'alpha',
    });
  });
});

describe('writeSettings', () => {
  it('round trips true and false', async () => {
    await writeSettings({ autoOpenNewNote: false });
    expect(await readSettings()).toEqual({
      autoOpenNewNote: false,
      onlineTranscription: false,
      tagSort: 'alpha',
    });
    await writeSettings({ autoOpenNewNote: true });
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: false,
      tagSort: 'alpha',
    });
  });

  it('preserves unknown keys in a valid file', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":true,"later":{"a":1}}');
    await writeSettings({ autoOpenNewNote: false });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
      later: { a: 1 },
    });
  });

  it('writes only the patched keys over a corrupt file', async () => {
    __fs.put(FILE, '{"autoOpen');
    await writeSettings({ autoOpenNewNote: false });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
    });
  });

  it('keeps the legacy on-disk key autoOpenDreamCapture (existing users keep their toggle)', async () => {
    await writeSettings({ autoOpenNewNote: false });
    const raw = JSON.parse(__fs.read(FILE) ?? '');
    expect(raw).toEqual({ autoOpenDreamCapture: false });
    expect(raw).not.toHaveProperty('autoOpenNewNote');
    // And a file written by an earlier build is read through the new name.
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    expect((await readSettings()).autoOpenNewNote).toBe(false);
  });

  it('writes over a zero-length file', async () => {
    __fs.put(FILE, '');
    await writeSettings({ autoOpenNewNote: false });
    expect(await readSettings()).toEqual({
      autoOpenNewNote: false,
      onlineTranscription: false,
      tagSort: 'alpha',
    });
  });

  it('never deletes the file, even when a write fails or leaves damage', async () => {
    const del = jest.spyOn(File.prototype, 'delete');
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    __fs.failNext('write', new Error('disk full'), { leave: 'empty' });
    await writeSettings({ autoOpenNewNote: true });
    expect(__fs.has(FILE)).toBe(true);
    await writeSettings({ autoOpenNewNote: true });
    expect(__fs.has(FILE)).toBe(true);
    expect(del).not.toHaveBeenCalled();
    del.mockRestore();
  });

  it('swallows a write failure and a read failure', async () => {
    __fs.failNext('write');
    await expect(writeSettings({ autoOpenNewNote: false })).resolves.toBeUndefined();
    __fs.put(FILE, '{}');
    __fs.failNext('json');
    await expect(writeSettings({ autoOpenNewNote: false })).resolves.toBeUndefined();
  });

  it('ends on the last value after two quick writes', async () => {
    const first = writeSettings({ autoOpenNewNote: false });
    const second = writeSettings({ autoOpenNewNote: true });
    await Promise.all([first, second]);
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: false,
      tagSort: 'alpha',
    });
    const a = writeSettings({ autoOpenNewNote: true });
    const b = writeSettings({ autoOpenNewNote: false });
    await Promise.all([a, b]);
    expect(await readSettings()).toEqual({
      autoOpenNewNote: false,
      onlineTranscription: false,
      tagSort: 'alpha',
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
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: true,
      tagSort: 'alpha',
    });
    __fs.put(FILE, '{"autoOpenDreamCapture":"x","onlineTranscription":true}');
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: true,
      tagSort: 'alpha',
    });
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

describe('tagSort', () => {
  it('defaults to alpha when the file is missing', async () => {
    expect((await readSettings()).tagSort).toBe('alpha');
  });

  it.each([
    ['zero-length', ''],
    ['corrupt JSON', '{"tagSort":"cou'],
    ['an array file', '["count"]'],
    ['null', 'null'],
    ['an empty object', '{}'],
    ['a number', '{"tagSort":1}'],
    ['null value', '{"tagSort":null}'],
    ['a boolean', '{"tagSort":true}'],
    ['an unknown string', '{"tagSort":"newest"}'],
    ['a wrong-case string', '{"tagSort":"Count"}'],
  ])('is alpha for %s', async (_name, content) => {
    __fs.put(FILE, content);
    expect((await readSettings()).tagSort).toBe('alpha');
  });

  it('is alpha when the file cannot be read', async () => {
    __fs.put(FILE, '{"tagSort":"count"}');
    __fs.failNext('json');
    expect((await readSettings()).tagSort).toBe('alpha');
  });

  it('count round trips and the raw JSON holds the key', async () => {
    await writeSettings({ tagSort: 'count' });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({ tagSort: 'count' });
    expect((await readSettings()).tagSort).toBe('count');
    await writeSettings({ tagSort: 'alpha' });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({ tagSort: 'alpha' });
    expect((await readSettings()).tagSort).toBe('alpha');
  });

  it('writing tagSort keeps the legacy key, onlineTranscription and unknown keys', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false,"onlineTranscription":true,"later":{"a":1}}');
    await writeSettings({ tagSort: 'count' });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: true,
      later: { a: 1 },
      tagSort: 'count',
    });
  });

  it('writing the other settings keeps tagSort', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":true,"tagSort":"count"}');
    await writeSettings({ autoOpenNewNote: false });
    await writeSettings({ onlineTranscription: true });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: true,
      tagSort: 'count',
    });
  });

  it('does not write tagSort when the patch lacks it', async () => {
    await writeSettings({ autoOpenNewNote: false });
    expect(JSON.parse(__fs.read(FILE) ?? '')).not.toHaveProperty('tagSort');
  });

  it('a file written by the previous build loads with alpha and keeps its other keys', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false,"onlineTranscription":true,"later":7}');
    expect(await readSettings()).toEqual({
      autoOpenNewNote: false,
      onlineTranscription: true,
      tagSort: 'alpha',
    });
    await writeSettings({ tagSort: 'count' });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: true,
      later: 7,
      tagSort: 'count',
    });
  });

  it('two quick writes end with the last value', async () => {
    const a = writeSettings({ tagSort: 'count' });
    const b = writeSettings({ tagSort: 'alpha' });
    await Promise.all([a, b]);
    expect((await readSettings()).tagSort).toBe('alpha');
    const c = writeSettings({ tagSort: 'alpha' });
    const d = writeSettings({ tagSort: 'count' });
    await Promise.all([c, d]);
    expect((await readSettings()).tagSort).toBe('count');
  });

  it('a failed write never throws and nothing changes on disk', async () => {
    __fs.put(FILE, '{"tagSort":"alpha"}');
    __fs.failNext('write');
    await expect(writeSettings({ tagSort: 'count' })).resolves.toBeUndefined();
    expect((await readSettings()).tagSort).toBe('alpha');
  });
});
