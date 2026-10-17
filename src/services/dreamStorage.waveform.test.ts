import * as fakeFs from '../test/fakeFileSystem';
import { listDreams, resetCorruptCopyGuard, saveDream } from './dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const RECORDING = 'file:///cache/recording.m4a';
const INDEX = 'file:///document/dreams.json';
const PEAKS = [0.1, 0.5, 1, 0.25];

const stored = (extra: Record<string, unknown> = {}) => ({
  id: '1',
  createdAt: '2026-10-01T00:00:00.000Z',
  durationMs: 1000,
  audioFileName: '1.m4a',
  title: 'Old',
  tags: [],
  ...extra,
});
const index = () => JSON.parse(__fs.read(INDEX)!) as Record<string, unknown>[];

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  __fs.put(RECORDING, 'audio-bytes');
});

describe('waveform storage', () => {
  it('stores the waveform with a new recording and loads it back', async () => {
    const dream = await saveDream({
      recordingUri: RECORDING,
      durationMs: 4000,
      waveform: PEAKS,
      details: { title: 'T', tags: [] },
      status: 'saved',
    });
    expect(dream.waveform).toEqual(PEAKS);
    expect(index()[0].waveform).toEqual(PEAKS);
    expect((await listDreams())[0].waveform).toEqual(PEAKS);
  });

  it('stores it on a draft and keeps it when the draft is finished', async () => {
    const draft = await saveDream({
      recordingUri: RECORDING,
      durationMs: 4000,
      waveform: PEAKS,
      details: { title: '', tags: [] },
      status: 'draft',
    });
    await saveDream({
      id: draft.id,
      durationMs: 4000,
      details: { title: 'Done', tags: [] },
      status: 'saved',
    });
    expect(index()[0].waveform).toEqual(PEAKS);
  });

  it('adds no waveform key when none is given', async () => {
    const dream = await saveDream({
      recordingUri: RECORDING,
      durationMs: 4000,
      details: { title: 'T', tags: [] },
      status: 'saved',
    });
    expect(dream).not.toHaveProperty('waveform');
    expect(index()[0]).not.toHaveProperty('waveform');
  });

  it('drops an invalid waveform but still saves the entry and its recording', async () => {
    const dream = await saveDream({
      recordingUri: RECORDING,
      durationMs: 4000,
      waveform: [0.5, 7, NaN],
      details: { title: 'T', tags: [] },
      status: 'saved',
    });
    expect(dream).not.toHaveProperty('waveform');
    expect(dream.audioFileName).toBeDefined();
    expect(__fs.has(RECORDING)).toBe(false);
  });

  it('ignores a waveform when no recording is copied (a written entry, or one with audio)', async () => {
    const written = await saveDream({
      waveform: PEAKS,
      details: { title: 'T', tags: [] },
      status: 'saved',
    });
    expect(written).not.toHaveProperty('waveform');

    __fs.put('file:///document/dreams/1.m4a', 'x');
    __fs.put(INDEX, JSON.stringify([stored({ waveform: [0.3, 0.4] })]));
    await saveDream({
      id: '1',
      waveform: PEAKS,
      details: { title: 'New', tags: [] },
      status: 'saved',
    });
    expect(index()[0].waveform).toEqual([0.3, 0.4]);
  });

  it('keeps an existing waveform when the entry is updated', async () => {
    __fs.put(INDEX, JSON.stringify([stored({ waveform: PEAKS })]));
    await saveDream({ id: '1', details: { title: 'New', tags: ['x'] }, status: 'saved' });
    expect(index()[0]).toMatchObject({ title: 'New', waveform: PEAKS });
  });

  it('leaves entries without a waveform untouched (no migration)', async () => {
    __fs.put(INDEX, JSON.stringify([stored()]));
    expect((await listDreams())[0]).toEqual(stored());
    await saveDream({ id: '1', details: { title: 'New', tags: [] }, status: 'saved' });
    expect(index()[0]).not.toHaveProperty('waveform');
  });

  it.each([
    ['a string', 'loud'],
    ['an empty list', []],
    ['out of range numbers', [0.2, 3]],
    ['non numbers', [0.2, 'x', null]],
    ['an object', { a: 1 }],
    ['null', null],
  ])('loads an entry whose stored waveform is %s, without the waveform', async (_n, bad) => {
    __fs.put(INDEX, JSON.stringify([stored({ waveform: bad }), stored({ id: '2' })]));
    const dreams = await listDreams();
    expect(dreams).toHaveLength(2);
    expect(dreams.find((d) => d.id === '1')).not.toHaveProperty('waveform');
    expect(dreams.find((d) => d.id === '1')?.title).toBe('Old');
  });

  it('drops an invalid stored waveform when that entry is next saved', async () => {
    __fs.put(INDEX, JSON.stringify([stored({ waveform: 'bad' })]));
    await saveDream({ id: '1', details: { title: 'New', tags: [] }, status: 'saved' });
    expect(index()[0]).not.toHaveProperty('waveform');
    expect(index()[0].title).toBe('New');
  });
});
