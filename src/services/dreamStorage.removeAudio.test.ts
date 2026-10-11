import * as fakeFs from '../test/fakeFileSystem';
import { Dream } from '../types/dream';
import { deleteDream, listDreams, resetCorruptCopyGuard, saveDream } from './dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const DOC = 'file:///document';
const INDEX = `${DOC}/dreams.json`;
const BAK = `${DOC}/dreams.json.bak`;
const RECORDING = 'file:///cache/new.m4a';
const audioUri = (name: string) => `${DOC}/dreams/${name}`;
const isIndex = (uri: string) => uri === INDEX;
const isBak = (uri: string) => uri === BAK;

const WAVE = Array.from({ length: 48 }, (_, i) => (i % 10) / 10);
const base = (id: string, extra: Partial<Dream> = {}): Dream => ({
  id,
  createdAt: `2026-10-0${id.slice(-1)}T08:00:00.000Z`,
  durationMs: 5000,
  title: `Title ${id}`,
  tags: ['a'],
  ...extra,
});
const X = base('1001', {
  audioFileName: '1001.m4a',
  waveform: WAVE,
  transcript: 'some words here',
  emotion: 'calm',
  journalId: 'life',
});
const Y = base('1002', { audioFileName: '1002.m4a' });

function seed(dreams: Dream[], bak: Dream[] | null = dreams) {
  __fs.put(INDEX, JSON.stringify(dreams));
  if (bak) __fs.put(BAK, JSON.stringify(bak));
  for (const d of dreams) if (d.audioFileName) __fs.put(audioUri(d.audioFileName), `audio-${d.id}`);
}
const stored = (): Dream[] => JSON.parse(__fs.read(INDEX) as string);
const details = (d: Dream) => ({
  title: d.title,
  emotion: d.emotion ?? '',
  tags: d.tags,
  transcript: d.transcript ?? '',
});
const remove = (d: Dream, extra: Record<string, unknown> = {}) =>
  saveDream({
    id: d.id,
    details: details(d),
    status: d.status === 'draft' ? 'draft' : 'saved',
    durationMs: 0,
    removeAudio: true,
    requireTitle: false,
    ...extra,
  });

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
});

describe('saveDream removeAudio', () => {
  it('forgets the audio and keeps every other field', async () => {
    seed([X, Y]);
    const saved = await remove(X);
    expect(saved).not.toHaveProperty('audioFileName');
    expect(saved).not.toHaveProperty('waveform');
    expect(saved.durationMs).toBe(0);
    expect(saved).toMatchObject({
      title: X.title,
      tags: X.tags,
      transcript: X.transcript,
      emotion: 'calm',
      createdAt: X.createdAt,
      journalId: 'life',
    });
    expect(saved.status).toBeUndefined();
    const listed = stored();
    expect(listed.find((d) => d.id === '1001')).toEqual(saved);
    expect(listed.find((d) => d.id === '1002')).toEqual(Y);
    expect(__fs.has(audioUri('1001.m4a'))).toBe(false);
    expect(__fs.has(audioUri('1002.m4a'))).toBe(true);
  });

  it('deletes the file only after the index is written, and scrubs the backup', async () => {
    seed([X, Y]);
    const ops: string[] = [];
    __fs.failWhen('write', (uri) => (isIndex(uri) && ops.push('index'), false));
    __fs.failWhen('write', (uri) => (isBak(uri) && ops.push('bak'), false));
    __fs.failWhen('delete', (uri) => (uri === audioUri('1001.m4a') && ops.push('audio'), false));
    await remove(X);
    expect(ops).toEqual(['index', 'bak', 'audio']);
    const bak = JSON.parse(__fs.read(BAK) as string) as Dream[];
    expect(bak).toEqual(stored());
    expect(JSON.stringify(bak)).not.toContain('1001.m4a');
  });

  it('keeps file, entry and old backup when the index write fails', async () => {
    seed([X, Y]);
    const before = __fs.read(INDEX);
    __fs.failWhen('write', isIndex, new Error('disk full'));
    await expect(remove(X)).rejects.toThrow('disk full');
    expect(__fs.has(audioUri('1001.m4a'))).toBe(true);
    expect(__fs.read(INDEX)).toBe(before);
    expect(__fs.read(BAK)).toBe(before);
    expect((await listDreams()).find((d) => d.id === '1001')?.audioFileName).toBe('1001.m4a');
  });

  it('still saves when the file cannot be deleted afterwards (orphan accepted)', async () => {
    seed([X, Y]);
    __fs.failWhen('delete', (uri) => uri === audioUri('1001.m4a'), new Error('locked'));
    const saved = await remove(X);
    expect(saved.audioFileName).toBeUndefined();
    expect(stored().find((d) => d.id === '1001')).not.toHaveProperty('audioFileName');
    expect(__fs.has(audioUri('1001.m4a'))).toBe(true);
  });

  it('deletes the backup when it cannot be rewritten', async () => {
    seed([X, Y]);
    __fs.failWhen('write', isBak, new Error('bak write'));
    await remove(X);
    expect(__fs.has(BAK)).toBe(false);
    expect(__fs.has(audioUri('1001.m4a'))).toBe(false);
  });

  it('still deletes the file when the backup can neither be written nor deleted', async () => {
    seed([X, Y]);
    __fs.failWhen('write', isBak, new Error('bak write'));
    __fs.failWhen('delete', isBak, new Error('bak delete'));
    await expect(remove(X)).resolves.toBeDefined();
    expect(__fs.has(audioUri('1001.m4a'))).toBe(false);
  });

  it('succeeds when the file is already missing', async () => {
    seed([X, Y]);
    __fs.reset();
    __fs.put(INDEX, JSON.stringify([X, Y]));
    const saved = await remove(X);
    expect(saved.audioFileName).toBeUndefined();
  });

  it('keeps a file another entry references, without touching that entry', async () => {
    const A = base('1001', { audioFileName: 'shared.m4a' });
    const B = base('1002', { audioFileName: 'shared.m4a' });
    seed([A, B]);
    const saved = await remove(A);
    expect(saved.audioFileName).toBeUndefined();
    expect(__fs.has(audioUri('shared.m4a'))).toBe(true);
    expect(stored().find((d) => d.id === '1002')).toEqual(B);
  });

  it.each(['../dreams.json', 'a/b.m4a', '%2e%2e', '..', 'a\\b.m4a', '/etc/passwd'])(
    'never deletes anything for the audio name %j but still removes the pointer',
    async (name) => {
      const bad = base('1001', { audioFileName: name });
      seed([bad, Y]);
      __fs.put(`${DOC}/dreams/b.m4a`, 'b');
      __fs.put(`${DOC}/dreams.json.keep`, 'keep');
      const files = __fs.list().filter((u) => u !== INDEX && u !== BAK);
      const saved = await remove(bad);
      expect(saved.audioFileName).toBeUndefined();
      expect(__fs.list().filter((u) => u !== INDEX && u !== BAK)).toEqual(files);
    },
  );

  it.each(['draft', 'saved'] as const)('works on a reopened %s', async (status) => {
    const D = base('1001', {
      audioFileName: '1001.m4a',
      ...(status === 'draft' ? { status } : {}),
    });
    seed([D]);
    const saved = await remove(D, { status });
    expect(saved.audioFileName).toBeUndefined();
    expect(saved.status).toBe(status === 'draft' ? 'draft' : undefined);
    expect(__fs.has(audioUri('1001.m4a'))).toBe(false);
  });

  it('replaces the old recording when a new one arrives in the same save', async () => {
    seed([X, Y]);
    __fs.put(RECORDING, 'new-audio');
    const saved = await remove(X, { recordingUri: RECORDING, durationMs: 7000, waveform: WAVE });
    expect(saved.audioFileName).toBeDefined();
    expect(saved.audioFileName).not.toBe('1001.m4a');
    expect(saved.durationMs).toBe(7000);
    expect(saved.waveform).toEqual(WAVE);
    expect(__fs.read(audioUri(saved.audioFileName as string))).toBe('new-audio');
    expect(__fs.has(audioUri('1001.m4a'))).toBe(false);
    expect(__fs.has(RECORDING)).toBe(false);
  });

  it('keeps the old file and cleans up the replacement when the index write fails', async () => {
    seed([X, Y]);
    __fs.put(RECORDING, 'new-audio');
    __fs.failWhen('write', isIndex, new Error('disk full'));
    await expect(remove(X, { recordingUri: RECORDING, durationMs: 7000 })).rejects.toThrow();
    expect(__fs.has(audioUri('1001.m4a'))).toBe(true);
    expect(__fs.has(RECORDING)).toBe(true);
    expect(
      __fs
        .list()
        .filter((u) => u.startsWith(`${DOC}/dreams/`))
        .sort(),
    ).toEqual([audioUri('1001.m4a'), audioUri('1002.m4a')]);
  });

  it('is a no-op on a record without audio', async () => {
    const T = base('1001');
    seed([T]);
    const saved = await remove(T, { durationMs: undefined });
    expect(saved).toEqual(T);
  });

  it('is a no-op on create', async () => {
    const saved = await saveDream({
      details: { title: 'New', tags: [], transcript: 'hi' },
      status: 'saved',
      removeAudio: true,
    });
    expect(saved.title).toBe('New');
    expect(saved).not.toHaveProperty('audioFileName');
  });

  it('never touches safety copies', async () => {
    seed([X, Y]);
    const copy = `${DOC}/dreams.corrupt-1.json`;
    __fs.put(copy, JSON.stringify([X, Y]));
    await remove(X);
    expect(__fs.read(copy)).toBe(JSON.stringify([X, Y]));
  });

  it('keeps the new file when the old one was missing and the replacement took its name', async () => {
    seed([X, Y]);
    __fs.reset();
    __fs.put(INDEX, JSON.stringify([X, Y]));
    __fs.put(BAK, JSON.stringify([X, Y]));
    __fs.put(audioUri('1002.m4a'), 'audio-1002');
    __fs.put(RECORDING, 'new-audio');
    const saved = await remove(X, { recordingUri: RECORDING, durationMs: 7000 });
    expect(saved.audioFileName).toBe('1001.m4a');
    expect(__fs.read(audioUri('1001.m4a'))).toBe('new-audio');
    expect(stored().find((d) => d.id === '1001')?.audioFileName).toBe('1001.m4a');
    expect(JSON.parse(__fs.read(BAK) as string)).toEqual(stored());
  });

  it('a second removeAudio save finds no pointer and deletes nothing', async () => {
    seed([X, Y]);
    await remove(X);
    const files = __fs.list().sort();
    const again = await remove(stored().find((d) => d.id === '1001') as Dream);
    expect(again).not.toHaveProperty('audioFileName');
    expect(__fs.list().sort()).toEqual(files);
  });

  it('a removeAudio save queued behind deleteDream fails not-found and deletes nothing', async () => {
    seed([X, Y]);
    const del = deleteDream('1001');
    const rem = remove(X);
    await del;
    await expect(rem).rejects.toThrow('Dream not found');
    expect(__fs.has(audioUri('1002.m4a'))).toBe(true);
    expect(stored().map((d) => d.id)).toEqual(['1002']);
  });

  it('with a shared name the backup is rewritten without the pointer on this entry only', async () => {
    const A = base('1001', { audioFileName: 'shared.m4a' });
    const B = base('1002', { audioFileName: 'shared.m4a' });
    seed([A, B]);
    await remove(A);
    const bak = JSON.parse(__fs.read(BAK) as string) as Dream[];
    expect(bak).toEqual(stored());
    expect(bak.find((d) => d.id === '1002')?.audioFileName).toBe('shared.m4a');
    expect(__fs.has(audioUri('shared.m4a'))).toBe(true);
  });
});
