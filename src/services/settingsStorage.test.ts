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
      loadImages: false,
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
      loadImages: false,
    });
  });

  it('defaults to true when the file cannot be read', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    __fs.failNext('text');
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: false,
      tagSort: 'alpha',
      loadImages: false,
    });
  });

  it('reads a stored false', async () => {
    __fs.put(FILE, '{"autoOpenDreamCapture":false}');
    expect(await readSettings()).toEqual({
      autoOpenNewNote: false,
      onlineTranscription: false,
      tagSort: 'alpha',
      loadImages: false,
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
      loadImages: false,
    });
    await writeSettings({ autoOpenNewNote: true });
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: false,
      tagSort: 'alpha',
      loadImages: false,
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
      loadImages: false,
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
    __fs.failNext('text');
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
      loadImages: false,
    });
    const a = writeSettings({ autoOpenNewNote: true });
    const b = writeSettings({ autoOpenNewNote: false });
    await Promise.all([a, b]);
    expect(await readSettings()).toEqual({
      autoOpenNewNote: false,
      onlineTranscription: false,
      tagSort: 'alpha',
      loadImages: false,
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
    __fs.failNext('text');
    expect((await readSettings()).onlineTranscription).toBe(false);
  });

  it('write then read persists, and each key is validated on its own', async () => {
    await writeSettings({ onlineTranscription: true });
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: true,
      tagSort: 'alpha',
      loadImages: false,
    });
    __fs.put(FILE, '{"autoOpenDreamCapture":"x","onlineTranscription":true}');
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: true,
      tagSort: 'alpha',
      loadImages: false,
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
    __fs.failNext('text');
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
      loadImages: false,
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

describe('loadImages', () => {
  it('defaults to false when the file is missing', async () => {
    expect((await readSettings()).loadImages).toBe(false);
  });

  it.each([
    ['a string', '{"loadImages":"true"}'],
    ['a number', '{"loadImages":1}'],
    ['null', '{"loadImages":null}'],
    ['an object', '{"loadImages":{"a":true}}'],
    ['corrupt JSON', '{"loadImages":tru'],
    ['an array file', '[true]'],
    ['zero-length', ''],
    ['absent from a file written by the previous build', '{"onlineTranscription":true}'],
  ])('is false for %s', async (_name, content) => {
    __fs.put(FILE, content);
    expect((await readSettings()).loadImages).toBe(false);
  });

  it('is false when the file cannot be read, and the next read finds the stored value', async () => {
    __fs.put(FILE, '{"loadImages":true}');
    __fs.failNext('text');
    expect((await readSettings()).loadImages).toBe(false);
    expect((await readSettings()).loadImages).toBe(true);
  });

  it('writes the on-disk key loadImages and reads it back, each key validated on its own', async () => {
    await writeSettings({ loadImages: true });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({ loadImages: true });
    expect(await readSettings()).toEqual({
      autoOpenNewNote: true,
      onlineTranscription: false,
      tagSort: 'alpha',
      loadImages: true,
    });
    await writeSettings({ loadImages: false });
    expect((await readSettings()).loadImages).toBe(false);
  });

  it('patching loadImages:true keeps the other keys and unknown keys in the written file', async () => {
    __fs.put(
      FILE,
      '{"autoOpenDreamCapture":false,"onlineTranscription":true,"tagSort":"count","later":{"a":1}}',
    );
    await writeSettings({ loadImages: true });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: true,
      tagSort: 'count',
      later: { a: 1 },
      loadImages: true,
    });
  });

  it('writing the other settings keeps loadImages, and does not write it when the patch lacks it', async () => {
    __fs.put(FILE, '{"loadImages":true}');
    await writeSettings({ tagSort: 'count' });
    await writeSettings({ autoOpenNewNote: false });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      loadImages: true,
      tagSort: 'count',
      autoOpenDreamCapture: false,
    });
    __fs.reset();
    await writeSettings({ onlineTranscription: true });
    expect(JSON.parse(__fs.read(FILE) ?? '')).not.toHaveProperty('loadImages');
  });

  it('two quick writes end with the last value', async () => {
    const a = writeSettings({ loadImages: true });
    const b = writeSettings({ loadImages: false });
    await Promise.all([a, b]);
    expect((await readSettings()).loadImages).toBe(false);
    const c = writeSettings({ loadImages: false });
    const d = writeSettings({ loadImages: true });
    await Promise.all([c, d]);
    expect((await readSettings()).loadImages).toBe(true);
  });

  it('a persistent read failure writes nothing and later reads default to false', async () => {
    const stored = '{"onlineTranscription":true,"later":1}';
    __fs.put(FILE, stored);
    __fs.failWhen('text', (uri) => uri === FILE);
    const write = jest.spyOn(File.prototype, 'write');
    await expect(writeSettings({ loadImages: true })).resolves.toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
    expect((await readSettings()).loadImages).toBe(false);
    expect(__fs.read(FILE)).toBe(stored);
  });

  it('a corrupt file is replaced by the patch alone', async () => {
    __fs.put(FILE, '{garbage');
    await writeSettings({ loadImages: true });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({ loadImages: true });
  });

  it('a failed write never throws and the value stays false on disk', async () => {
    __fs.failNext('write');
    await expect(writeSettings({ loadImages: true })).resolves.toBeUndefined();
    expect((await readSettings()).loadImages).toBe(false);
  });
});

describe('write guard (unreadable vs corrupt vs missing)', () => {
  const STORED =
    '{"autoOpenDreamCapture":false,"onlineTranscription":true,"tagSort":"count","later":{"a":1}}';
  const unreadable = () => __fs.failWhen('text', (uri) => uri === FILE);

  it('a transient read failure is retried once and the write keeps every prior key', async () => {
    __fs.put(FILE, STORED);
    __fs.failNext('text');
    await writeSettings({ tagSort: 'alpha' });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({
      autoOpenDreamCapture: false,
      onlineTranscription: true,
      tagSort: 'alpha',
      later: { a: 1 },
    });
  });

  it.each([
    ['autoOpenNewNote', { autoOpenNewNote: true }],
    ['onlineTranscription', { onlineTranscription: false }],
    ['tagSort', { tagSort: 'alpha' as const }],
    ['loadImages', { loadImages: true }],
  ])('a persistent read failure leaves the disk byte-identical (%s)', async (_name, patch) => {
    __fs.put(FILE, STORED);
    unreadable();
    const write = jest.spyOn(File.prototype, 'write');
    await expect(writeSettings(patch)).resolves.toBeUndefined();
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
    expect(__fs.read(FILE)).toBe(STORED);
    __fs.clearFailures();
    expect((await readSettings()).tagSort).toBe('count'); // nothing was lost
  });

  it('after a skipped write the next setter works once the file is readable again', async () => {
    __fs.put(FILE, STORED);
    unreadable();
    await writeSettings({ tagSort: 'alpha' });
    __fs.clearFailures();
    await writeSettings({ tagSort: 'alpha' });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toMatchObject({ tagSort: 'alpha', later: { a: 1 } });
  });

  it.each([
    ['garbage', 'not json at all'],
    ['truncated JSON', '{"autoOpenDreamCapture":false,"tagS'],
    ['an empty array', '[]'],
    ['null', 'null'],
    ['a string', '"x"'],
    ['a number', '42'],
  ])(
    'a corrupt file (%s) is overwritten by the patch; later reads see patch + defaults',
    async (_n, content) => {
      __fs.put(FILE, content);
      await writeSettings({ tagSort: 'count' });
      expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({ tagSort: 'count' });
      expect(await readSettings()).toEqual({
        autoOpenNewNote: true,
        onlineTranscription: false,
        tagSort: 'count',
        loadImages: false,
      });
    },
  );

  it('a missing and a zero-length file get the patch over defaults', async () => {
    await writeSettings({ onlineTranscription: true });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({ onlineTranscription: true });
    __fs.put(FILE, '');
    await writeSettings({ onlineTranscription: true });
    expect(JSON.parse(__fs.read(FILE) ?? '')).toEqual({ onlineTranscription: true });
  });

  it('never deletes, moves or copies, even when the read fails', async () => {
    __fs.put(FILE, STORED);
    unreadable();
    const del = jest.spyOn(File.prototype, 'delete');
    const move = jest.spyOn(File.prototype, 'move');
    const copy = jest.spyOn(File.prototype, 'copy');
    await writeSettings({ tagSort: 'alpha' });
    expect(del).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    del.mockRestore();
    move.mockRestore();
    copy.mockRestore();
  });

  it('readSettings waits for a queued write and returns the written value', async () => {
    __fs.put(FILE, '{"tagSort":"alpha"}');
    const write = writeSettings({ tagSort: 'count' });
    const read = readSettings(); // started while the write is queued
    expect((await read).tagSort).toBe('count');
    await write;
  });

  it('readSettings does not wait forever after a failed write', async () => {
    __fs.failNext('write');
    await writeSettings({ tagSort: 'count' });
    await expect(readSettings()).resolves.toMatchObject({ tagSort: 'alpha' });
  });
});
