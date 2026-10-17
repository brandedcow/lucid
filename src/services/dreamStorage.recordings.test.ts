import * as fakeFs from '../test/fakeFileSystem';
import { Dream, hasAudio, recordingsOf } from '../types/dream';
import {
  deletableAudioFiles,
  dreamAudioUri,
  listDreams,
  recordingUri,
  resetCorruptCopyGuard,
  saveDream,
} from './dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const INDEX = 'file:///document/dreams.json';
const PEAKS = [0.1, 0.5, 1];

const dream = (extra: Record<string, unknown> = {}): Dream =>
  ({
    id: '1',
    createdAt: '2026-10-01T00:00:00.000Z',
    durationMs: 0,
    title: 'T',
    tags: [],
    ...extra,
  }) as Dream;

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
});

describe('recordingsOf', () => {
  it('is empty for an entry with no audio', () => {
    expect(recordingsOf(dream())).toEqual([]);
    expect(hasAudio(dream())).toBe(false);
  });

  it('turns a legacy entry into one recording', () => {
    const d = dream({ audioFileName: 'a.m4a', durationMs: 4000, waveform: PEAKS });
    expect(recordingsOf(d)).toEqual([{ fileName: 'a.m4a', durationMs: 4000, waveform: PEAKS }]);
    expect(hasAudio(d)).toBe(true);
  });

  it('drops an invalid legacy waveform and a non-finite duration', () => {
    const d = dream({ audioFileName: 'a.m4a', durationMs: NaN, waveform: [5] });
    expect(recordingsOf(d)).toEqual([{ fileName: 'a.m4a', durationMs: 0 }]);
  });

  it('returns recordings when only they are present', () => {
    const d = dream({
      recordings: [
        { fileName: 'a.m4a', durationMs: 1000 },
        { fileName: 'b.m4a', durationMs: 2000 },
      ],
    });
    expect(recordingsOf(d).map((r) => r.fileName)).toEqual(['a.m4a', 'b.m4a']);
    expect(hasAudio(d)).toBe(true);
  });

  it('lets recordings win over the legacy fields', () => {
    const d = dream({
      audioFileName: 'old.m4a',
      durationMs: 9,
      recordings: [{ fileName: 'new.m4a', durationMs: 5 }],
    });
    expect(recordingsOf(d)).toEqual([{ fileName: 'new.m4a', durationMs: 5 }]);
  });

  it.each([
    ['a string', 'nope'],
    ['an object', {}],
    ['an empty list', []],
    ['junk items', [1, null, 'x']],
    [
      'bad names',
      [
        { fileName: '', durationMs: 1 },
        { fileName: 3, durationMs: 1 },
      ],
    ],
  ])('falls back to the legacy fields when recordings is %s', (_label, recordings) => {
    const d = dream({ audioFileName: 'old.m4a', durationMs: 7, recordings });
    expect(recordingsOf(d)).toEqual([{ fileName: 'old.m4a', durationMs: 7 }]);
  });

  it('is empty when recordings is malformed and there are no legacy fields', () => {
    expect(recordingsOf(dream({ recordings: 'nope' }))).toEqual([]);
    expect(hasAudio(dream({ recordings: [{ fileName: '' }] }))).toBe(false);
  });

  it('keeps the usable items of a partly bad list', () => {
    const d = dream({
      recordings: [
        { fileName: '', durationMs: 1 },
        { fileName: 'ok.m4a', durationMs: 'x' },
      ],
    });
    expect(recordingsOf(d)).toEqual([{ fileName: 'ok.m4a', durationMs: 0 }]);
  });

  it('sanitizes the waveform of each recording on its own', () => {
    const d = dream({
      recordings: [
        { fileName: 'a.m4a', durationMs: 1, waveform: PEAKS },
        { fileName: 'b.m4a', durationMs: 1, waveform: [2, 3] },
        { fileName: 'c.m4a', durationMs: 1, waveform: 'x' },
      ],
    });
    const [a, b, c] = recordingsOf(d);
    expect(a.waveform).toEqual(PEAKS);
    expect('waveform' in b).toBe(false);
    expect('waveform' in c).toBe(false);
  });
});

describe('audio URIs', () => {
  it('keeps dreamAudioUri for legacy entries and null without audio', () => {
    expect(dreamAudioUri(dream({ audioFileName: 'a.m4a' }))).toBe('file:///document/dreams/a.m4a');
    expect(dreamAudioUri(dream())).toBeNull();
  });

  it('gives the first recording for dreamAudioUri and a URI per recording', () => {
    const d = dream({
      recordings: [
        { fileName: 'x.m4a', durationMs: 1 },
        { fileName: 'y.m4a', durationMs: 1 },
      ],
    });
    expect(dreamAudioUri(d)).toBe('file:///document/dreams/x.m4a');
    expect(recordingsOf(d).map(recordingUri)).toEqual([
      'file:///document/dreams/x.m4a',
      'file:///document/dreams/y.m4a',
    ]);
  });
});

describe('deletableAudioFiles', () => {
  const names = (files: { uri: string }[]) => files.map((f) => f.uri.split('/').pop());

  it('returns every recording of the record, legacy or listed', () => {
    const legacy = dream({ id: 'l', audioFileName: 'l.m4a' });
    const multi = dream({
      id: 'm',
      recordings: [
        { fileName: 'a.m4a', durationMs: 1 },
        { fileName: 'b.m4a', durationMs: 1 },
      ],
    });
    expect(names(deletableAudioFiles(legacy, [legacy, multi]))).toEqual(['l.m4a']);
    expect(names(deletableAudioFiles(multi, [legacy, multi]))).toEqual(['a.m4a', 'b.m4a']);
  });

  it('skips a name any recording of another record uses, legacy or listed', () => {
    const mine = dream({
      id: 'm',
      recordings: [
        { fileName: 'a.m4a', durationMs: 1 },
        { fileName: 'b.m4a', durationMs: 1 },
        { fileName: 'c.m4a', durationMs: 1 },
      ],
    });
    const otherLegacy = dream({ id: 'o1', audioFileName: 'a.m4a' });
    const otherListed = dream({ id: 'o2', recordings: [{ fileName: 'b.m4a', durationMs: 1 }] });
    expect(names(deletableAudioFiles(mine, [mine, otherLegacy, otherListed]))).toEqual(['c.m4a']);
  });

  it('skips unsafe names and never returns a file outside dreams/', () => {
    const mine = dream({
      recordings: [
        '../x.m4a',
        'a/b.m4a',
        'a\\b.m4a',
        'file:x',
        '%2e%2e',
        '..',
        '.',
        'a..b.m4a',
        'ok.m4a',
      ].map((fileName) => ({ fileName, durationMs: 1 })),
    });
    // 'a..b.m4a' is rejected too, like deletableAudio.
    expect(names(deletableAudioFiles(mine, [mine]))).toEqual(['ok.m4a']);
  });

  it('returns each file once and nothing for an entry without audio', () => {
    const twice = dream({
      recordings: [
        { fileName: 'a.m4a', durationMs: 1 },
        { fileName: 'a.m4a', durationMs: 1 },
      ],
    });
    expect(names(deletableAudioFiles(twice, [twice]))).toEqual(['a.m4a']);
    expect(deletableAudioFiles(dream(), [dream()])).toEqual([]);
  });
});

describe('loading', () => {
  it('does not crash or drop an entry with a malformed recordings field', async () => {
    __fs.put(
      INDEX,
      JSON.stringify([
        {
          ...dream({ audioFileName: 'old.m4a', durationMs: 5, recordings: 'junk' }),
          extra: 'kept',
        },
        dream({ id: '2', recordings: [null, 4] }),
      ]),
    );
    const loaded = await listDreams();
    expect(loaded).toHaveLength(2);
    const first = loaded.find((d) => d.id === '1')!;
    expect(recordingsOf(first)).toEqual([{ fileName: 'old.m4a', durationMs: 5 }]);
    expect(hasAudio(loaded.find((d) => d.id === '2')!)).toBe(false);
  });

  it('keeps recordings and unknown fields on the stored record through a save', async () => {
    const stored = {
      ...dream({ recordings: [{ fileName: 'a.m4a', durationMs: 3 }], mystery: 42 }),
      status: 'draft',
    };
    __fs.put(INDEX, JSON.stringify([stored]));
    await saveDream({ id: '1', details: { title: 'T2', tags: [] }, status: 'saved' });
    const after = JSON.parse(__fs.read(INDEX)!)[0];
    expect(after.mystery).toBe(42);
    expect(after.recordings).toEqual([{ fileName: 'a.m4a', durationMs: 3 }]);
  });
});
