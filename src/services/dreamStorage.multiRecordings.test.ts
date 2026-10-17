import * as fakeFs from '../test/fakeFileSystem';
import { Dream, recordingsOf } from '../types/dream';
import {
  MAX_VOICE_TRANSCRIPT_LENGTH,
  deleteDream,
  listDreams,
  resetCorruptCopyGuard,
  saveDream,
} from './dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const DOC = 'file:///document';
const INDEX = `${DOC}/dreams.json`;
const BAK = `${DOC}/dreams.json.bak`;
const audio = (name: string) => `${DOC}/dreams/${name}`;
const cache = (name: string) => `file:///cache/${name}`;
const PEAKS = [0.1, 0.5, 1];

const entry = (id: string, extra: Partial<Dream> = {}): Dream => ({
  id,
  createdAt: `2026-10-0${id.slice(-1)}T08:00:00.000Z`,
  durationMs: 0,
  title: `Title ${id}`,
  tags: [],
  ...extra,
});
const multi = (id: string, names: string[], extra: Partial<Dream> = {}): Dream =>
  entry(id, {
    recordings: names.map((fileName, i) => ({ fileName, durationMs: (i + 1) * 1000 })),
    audioFileName: names[0],
    durationMs: 1000,
    ...extra,
  });

function seed(dreams: Dream[]) {
  __fs.put(INDEX, JSON.stringify(dreams));
  __fs.put(BAK, JSON.stringify(dreams));
  for (const d of dreams) {
    for (const r of recordingsOf(d)) __fs.put(audio(r.fileName), `audio-${r.fileName}`);
  }
}
const stored = (): Dream[] => JSON.parse(__fs.read(INDEX) as string);
const details = (d: Dream) => ({ title: d.title, emotion: '', tags: d.tags, transcript: '' });
const save = (d: Dream, extra: Record<string, unknown> = {}) =>
  saveDream({ id: d.id, details: details(d), status: 'saved', requireTitle: false, ...extra });
const put = (name: string) => __fs.put(cache(name), `cache-${name}`);

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
});

describe('saveDream addRecordings', () => {
  it('copies N recordings under free names and mirrors the first', async () => {
    ['a.m4a', 'b.m4a', 'c.m4a'].forEach(put);
    const saved = await saveDream({
      details: { title: 'T', tags: [] },
      status: 'saved',
      addRecordings: [
        { uri: cache('a.m4a'), durationMs: 1000, waveform: PEAKS },
        { uri: cache('b.m4a'), durationMs: 2000 },
        { uri: cache('c.m4a'), durationMs: 3000, waveform: [9] },
      ],
    });
    const names = saved.recordings!.map((r) => r.fileName);
    expect(names).toEqual([`${saved.id}.m4a`, `${saved.id}-1.m4a`, `${saved.id}-2.m4a`]);
    expect(saved.recordings!.map((r) => r.durationMs)).toEqual([1000, 2000, 3000]);
    expect(saved.recordings![0].waveform).toEqual(PEAKS);
    expect(saved.recordings![2]).not.toHaveProperty('waveform');
    expect(saved).toMatchObject({ audioFileName: names[0], durationMs: 1000, waveform: PEAKS });
    expect(names.map((n) => __fs.read(audio(n)))).toEqual([
      'cache-a.m4a',
      'cache-b.m4a',
      'cache-c.m4a',
    ]);
    expect(stored()[0]).toEqual(saved);
    // Sources are deleted only after the commit, and then all of them.
    expect(['a', 'b', 'c'].some((n) => __fs.has(cache(`${n}.m4a`)))).toBe(false);
  });

  it('appends to the recordings an entry keeps and keeps the mirror on the first', async () => {
    const e = multi('1001', ['x.m4a']);
    seed([e]);
    put('n.m4a');
    const saved = await save(e, { addRecordings: [{ uri: cache('n.m4a'), durationMs: 500 }] });
    expect(saved.recordings!.map((r) => r.fileName)).toEqual(['x.m4a', '1001.m4a']);
    expect(saved.audioFileName).toBe('x.m4a');
    expect(saved.durationMs).toBe(1000);
  });

  it('never takes a name another record uses, even when its file is missing', async () => {
    seed([entry('1001'), multi('1002', ['1001.m4a'])]);
    __fs.reset();
    __fs.put(INDEX, JSON.stringify([entry('1001'), multi('1002', ['1001.m4a'])]));
    put('n.m4a');
    const saved = await save(entry('1001'), {
      addRecordings: [{ uri: cache('n.m4a'), durationMs: 1 }],
    });
    expect(saved.recordings![0].fileName).toBe('1001-1.m4a');
  });

  it('converts a legacy entry lazily when it gains a recording, and not before', async () => {
    const legacy = entry('1001', { audioFileName: 'old.m4a', durationMs: 7, waveform: PEAKS });
    seed([legacy]);
    const plain = await save(legacy, { details: { title: 'Renamed', tags: [] } });
    expect(plain).not.toHaveProperty('recordings');
    expect(stored()[0]).toMatchObject({ audioFileName: 'old.m4a', durationMs: 7, waveform: PEAKS });
    put('n.m4a');
    const saved = await save(legacy, { addRecordings: [{ uri: cache('n.m4a'), durationMs: 2 }] });
    expect(saved.recordings).toEqual([
      { fileName: 'old.m4a', durationMs: 7, waveform: PEAKS },
      { fileName: '1001.m4a', durationMs: 2 },
    ]);
    expect(saved).toMatchObject({ audioFileName: 'old.m4a', durationMs: 7, waveform: PEAKS });
  });

  it("rolls back only this save's copies when a later copy fails", async () => {
    const e = multi('1001', ['keep.m4a']);
    seed([e]);
    __fs.put(audio('1001-1.m4a'), 'orphan-from-before');
    ['a.m4a', 'b.m4a', 'c.m4a'].forEach(put);
    const before = __fs.read(INDEX);
    __fs.failWhen('copy', (uri) => uri === cache('c.m4a'), new Error('disk full'), {
      leave: 'partial',
    });
    await expect(
      save(e, {
        addRecordings: ['a', 'b', 'c'].map((n) => ({ uri: cache(`${n}.m4a`), durationMs: 1 })),
      }),
    ).rejects.toThrow('disk full');
    // Names taken by older files were skipped, so the orphan survives; this save's copies are gone.
    expect(__fs.read(audio('1001-1.m4a'))).toBe('orphan-from-before');
    expect(__fs.has(audio('1001.m4a'))).toBe(false);
    expect(__fs.has(audio('1001-2.m4a'))).toBe(false);
    expect(__fs.has(audio('1001-3.m4a'))).toBe(false);
    expect(__fs.has(audio('keep.m4a'))).toBe(true);
    ['a', 'b', 'c'].forEach((n) => expect(__fs.has(cache(`${n}.m4a`))).toBe(true));
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('rolls back every copy when the index write fails', async () => {
    seed([]);
    ['a.m4a', 'b.m4a'].forEach(put);
    __fs.failWhen('write', (uri) => uri === INDEX, new Error('no space'));
    await expect(
      saveDream({
        details: { title: 'T', tags: [] },
        status: 'saved',
        addRecordings: ['a', 'b'].map((n) => ({ uri: cache(`${n}.m4a`), durationMs: 1 })),
      }),
    ).rejects.toThrow('no space');
    expect(__fs.list().filter((u) => u.startsWith(`${DOC}/dreams/`))).toEqual([]);
    expect(__fs.has(cache('a.m4a')) && __fs.has(cache('b.m4a'))).toBe(true);
  });

  it('throws before copying anything when a source is missing', async () => {
    put('a.m4a');
    await expect(
      saveDream({
        details: { title: 'T', tags: [] },
        status: 'saved',
        addRecordings: [
          { uri: cache('a.m4a'), durationMs: 1 },
          { uri: cache('gone.m4a'), durationMs: 1 },
        ],
      }),
    ).rejects.toThrow('could not be found');
    expect(__fs.copies()).toEqual([]);
  });

  it('keeps the single-recording input working, and ignoring it when a recording is kept', async () => {
    put('a.m4a');
    const created = await saveDream({
      recordingUri: cache('a.m4a'),
      durationMs: 4000,
      waveform: PEAKS,
      details: { title: 'T', tags: [] },
      status: 'saved',
    });
    expect(created.recordings).toEqual([
      { fileName: `${created.id}.m4a`, durationMs: 4000, waveform: PEAKS },
    ]);
    expect(created).toMatchObject({ audioFileName: `${created.id}.m4a`, durationMs: 4000 });
    put('b.m4a');
    const again = await save(created, { recordingUri: cache('b.m4a'), durationMs: 1 });
    expect(again.recordings).toHaveLength(1);
    expect(__fs.has(cache('b.m4a'))).toBe(true);
  });
});

describe('saveDream removeRecordings', () => {
  it('removes a subset, re-mirrors the first, rewrites the backup, then deletes the file', async () => {
    const e = multi('1001', ['a.m4a', 'b.m4a', 'c.m4a'], { waveform: PEAKS });
    seed([e, multi('1002', ['z.m4a'])]);
    const ops: string[] = [];
    __fs.failWhen('write', (uri) => (uri === INDEX && ops.push('index'), false));
    __fs.failWhen('write', (uri) => (uri === BAK && ops.push('bak'), false));
    __fs.failWhen('delete', (uri) => (uri === audio('a.m4a') && ops.push('audio'), false));
    const saved = await save(e, { removeRecordings: ['a.m4a'] });
    expect(ops).toEqual(['index', 'bak', 'audio']);
    expect(saved.recordings!.map((r) => r.fileName)).toEqual(['b.m4a', 'c.m4a']);
    expect(saved).toMatchObject({ audioFileName: 'b.m4a', durationMs: 2000 });
    expect(saved).not.toHaveProperty('waveform');
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    expect(['b.m4a', 'c.m4a', 'z.m4a'].every((n) => __fs.has(audio(n)))).toBe(true);
    expect(__fs.read(BAK)).toBe(__fs.read(INDEX));
    expect(__fs.read(BAK)).not.toContain('a.m4a');
  });

  it('removes the legacy fields when the last recording goes (list stays absent)', async () => {
    const e = entry('1001', { audioFileName: 'old.m4a', durationMs: 9, waveform: PEAKS });
    seed([e]);
    const saved = await save(e, { removeRecordings: ['old.m4a'] });
    expect(saved).not.toHaveProperty('audioFileName');
    expect(saved).not.toHaveProperty('waveform');
    expect(saved).not.toHaveProperty('recordings');
    expect(saved.durationMs).toBe(0);
    expect(__fs.has(audio('old.m4a'))).toBe(false);
  });

  it('removeAudio removes every stored recording', async () => {
    const e = multi('1001', ['a.m4a', 'b.m4a']);
    seed([e]);
    const saved = await save(e, { removeAudio: true });
    expect(recordingsOf(saved)).toEqual([]);
    expect(saved).not.toHaveProperty('recordings');
    expect(__fs.list().filter((u) => u.includes('/dreams/'))).toEqual([]);
  });

  it('removes and adds in one save', async () => {
    const e = multi('1001', ['a.m4a', 'b.m4a']);
    seed([e]);
    put('n.m4a');
    const saved = await save(e, {
      removeRecordings: ['a.m4a'],
      addRecordings: [{ uri: cache('n.m4a'), durationMs: 5 }],
    });
    expect(saved.recordings!.map((r) => r.fileName)).toEqual(['b.m4a', '1001.m4a']);
    expect(saved.audioFileName).toBe('b.m4a');
    expect(__fs.has(audio('a.m4a'))).toBe(false);
  });

  it('throws on an unknown name before anything changes', async () => {
    const e = multi('1001', ['a.m4a', 'b.m4a']);
    seed([e, multi('1002', ['other.m4a'])]);
    put('n.m4a');
    const before = [__fs.read(INDEX), __fs.read(BAK)];
    await expect(
      save(e, {
        removeRecordings: ['a.m4a', 'other.m4a'],
        addRecordings: [{ uri: cache('n.m4a'), durationMs: 1 }],
      }),
    ).rejects.toThrow('does not belong');
    expect([__fs.read(INDEX), __fs.read(BAK)]).toEqual(before);
    expect(__fs.has(audio('a.m4a')) && __fs.has(audio('other.m4a'))).toBe(true);
    expect(__fs.has(cache('n.m4a'))).toBe(true);
    expect(__fs.copies()).toEqual([]);
  });

  it('never deletes a file another record still references', async () => {
    const e = multi('1001', ['a.m4a', 'shared.m4a']);
    seed([e, entry('1002', { audioFileName: 'shared.m4a' }), multi('1003', ['a.m4a'])]);
    const saved = await save(e, { removeRecordings: ['a.m4a', 'shared.m4a'] });
    expect(recordingsOf(saved)).toEqual([]);
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(__fs.has(audio('shared.m4a'))).toBe(true);
  });

  it('keeps the files of recordings the entry keeps (names are removed whole)', async () => {
    const e = entry('1001', {
      recordings: [
        { fileName: 'a.m4a', durationMs: 1 },
        { fileName: 'a.m4a', durationMs: 2 },
      ],
    });
    seed([e]);
    // Both items share a name: removing by name drops both, so nothing keeps it and it goes.
    await save(e, { removeRecordings: ['a.m4a'] });
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    // A newly added recording can only take a free name, but a kept one must be protected.
    const k = multi('1002', ['k.m4a', 'r.m4a']);
    seed([k]);
    const saved = await save(k, { removeRecordings: ['r.m4a'] });
    expect(saved.recordings!.map((r) => r.fileName)).toEqual(['k.m4a']);
    expect(__fs.has(audio('k.m4a'))).toBe(true);
    expect(__fs.has(audio('r.m4a'))).toBe(false);
  });

  it('skips unsafe names and tolerates a failing or missing file delete', async () => {
    const e = multi('1001', ['../evil.m4a', 'a.m4a', 'b.m4a', 'gone.m4a']);
    seed([e]);
    __fs.put(`${DOC}/evil.m4a`, 'outside');
    __fs.failWhen('delete', (uri) => uri === audio('a.m4a'), new Error('locked'));
    const saved = await save(e, {
      removeRecordings: ['../evil.m4a', 'a.m4a', 'b.m4a', 'gone.m4a'],
    });
    expect(recordingsOf(saved)).toEqual([]);
    expect(__fs.has(`${DOC}/evil.m4a`)).toBe(true);
    expect(__fs.has(audio('a.m4a'))).toBe(true); // accepted orphan
    expect(__fs.has(audio('b.m4a'))).toBe(false); // later files are still deleted
    expect(stored()[0]).toEqual(saved);
  });
});

describe('deleteDream with several recordings', () => {
  it('deletes every file, but not names another record shares, and writes the index last', async () => {
    const e = multi('1001', ['a.m4a', 'b.m4a', 'shared.m4a']);
    const other = multi('1002', ['shared.m4a', 'o.m4a']);
    seed([e, other]);
    const ops: string[] = [];
    __fs.failWhen('delete', (uri) => (ops.push(`del:${uri.split('/').pop()}`), false));
    __fs.failWhen('write', (uri) => (uri === INDEX && ops.push('index'), false));
    await deleteDream('1001');
    expect(ops).toEqual(['del:a.m4a', 'del:b.m4a', 'index']);
    expect(__fs.has(audio('a.m4a')) || __fs.has(audio('b.m4a'))).toBe(false);
    expect(__fs.has(audio('shared.m4a')) && __fs.has(audio('o.m4a'))).toBe(true);
    expect((await listDreams()).map((d) => d.id)).toEqual(['1002']);
    expect(__fs.read(BAK)).not.toContain('a.m4a');
  });

  it('throws before the index write when one file cannot be deleted, and a retry finishes', async () => {
    const e = multi('1001', ['a.m4a', 'b.m4a']);
    seed([e]);
    const before = __fs.read(INDEX);
    __fs.failWhen('delete', (uri) => uri === audio('b.m4a'), new Error('locked'));
    await expect(deleteDream('1001')).rejects.toThrow('locked');
    expect(__fs.read(INDEX)).toBe(before);
    __fs.clearFailures();
    await deleteDream('1001');
    expect(stored()).toEqual([]);
    expect(__fs.list().filter((u) => u.includes('/dreams/'))).toEqual([]);
  });

  it('matches safety copies by any recording name', async () => {
    const e = multi('1001', ['a.m4a', 'second.m4a'], { title: 'x', transcript: undefined });
    const other = entry('1002');
    seed([e, other]);
    // A copy holding only a stranger's record that names this entry's SECOND recording.
    __fs.put(
      `${DOC}/dreams.corrupt-1.json`,
      JSON.stringify([{ id: 'zzz', recordings: [{ fileName: 'second.m4a' }] }]),
    );
    await expect(deleteDream('1001')).rejects.toMatchObject({
      code: 'SAFETY_COPY_HOLDS_OTHER_DREAMS',
    });
    expect(stored()).toHaveLength(2);
  });
});

describe('loading with recordings', () => {
  it('drops an invalid waveform of a stored recording for display only', async () => {
    const raw = entry('1001', {
      recordings: [
        { fileName: 'a.m4a', durationMs: 1, waveform: [5] },
        { fileName: 'b.m4a', durationMs: 1, waveform: PEAKS },
      ],
    });
    __fs.put(INDEX, JSON.stringify([raw]));
    const [loaded] = await listDreams();
    expect(loaded.recordings![0]).toEqual({ fileName: 'a.m4a', durationMs: 1 });
    expect(loaded.recordings![1].waveform).toEqual(PEAKS);
    expect(JSON.parse(__fs.read(INDEX)!)[0]).toEqual(raw);
  });
});

describe('voiceTranscript', () => {
  const withText = (id: string) =>
    multi(id, ['x.m4a', 'y.m4a']).recordings!.map((r, i) => ({
      ...r,
      ...(i === 0 ? { voiceTranscript: 'hello there' } : {}),
    }));

  it('round-trips with addRecordings (trimmed; "" kept; non-string dropped) and is not mirrored', async () => {
    ['a.m4a', 'b.m4a', 'c.m4a'].forEach(put);
    const saved = await saveDream({
      details: { title: 'T', tags: [] },
      status: 'saved',
      addRecordings: [
        { uri: cache('a.m4a'), durationMs: 1, voiceTranscript: '  spoken words \n' },
        { uri: cache('b.m4a'), durationMs: 2, voiceTranscript: '' },
        { uri: cache('c.m4a'), durationMs: 3, voiceTranscript: 5 as unknown as string },
      ],
    });
    expect(saved.recordings!.map((r) => r.voiceTranscript)).toEqual([
      'spoken words',
      '',
      undefined,
    ]);
    expect('voiceTranscript' in saved.recordings![2]).toBe(false);
    expect(saved).not.toHaveProperty('voiceTranscript');
    expect(saved.audioFileName).toBe(saved.recordings![0].fileName);
    const [listed] = await listDreams();
    expect(recordingsOf(listed).map((r) => r.voiceTranscript)).toEqual([
      'spoken words',
      '',
      undefined,
    ]);
    expect(stored()[0].transcript).toBeUndefined();
  });

  it('old records without the field read as before and survive an unrelated save', async () => {
    const e = multi('1001', ['x.m4a']);
    const legacy = entry('1002', { audioFileName: 'l.m4a', durationMs: 900 });
    seed([e, legacy]);
    expect(recordingsOf(e)[0]).toEqual({ fileName: 'x.m4a', durationMs: 1000 });
    expect(recordingsOf(legacy)).toEqual([{ fileName: 'l.m4a', durationMs: 900 }]);
    await save(e);
    expect(stored()[0].recordings).toEqual(e.recordings);
    expect(stored()[1]).toEqual(legacy);
  });

  it('recordingTexts sets, replaces and clears to "" without touching audio or the mirror', async () => {
    const e = multi('1001', ['x.m4a', 'y.m4a']);
    seed([e]);
    const first = await save(e, { recordingTexts: [{ fileName: 'y.m4a', text: ' one ' }] });
    expect(recordingsOf(first).map((r) => r.voiceTranscript)).toEqual([undefined, 'one']);
    const second = await save(e, {
      recordingTexts: [
        { fileName: 'y.m4a', text: '' },
        { fileName: 'x.m4a', text: 'two' },
      ],
    });
    expect(recordingsOf(second).map((r) => r.voiceTranscript)).toEqual(['two', '']);
    expect(second.audioFileName).toBe('x.m4a');
    expect(second).not.toHaveProperty('voiceTranscript');
    expect(__fs.has(audio('x.m4a')) && __fs.has(audio('y.m4a'))).toBe(true);
    // An unrelated save keeps the text.
    const third = await save(e);
    expect(recordingsOf(third).map((r) => r.voiceTranscript)).toEqual(['two', '']);
  });

  it('recordingTexts converts a legacy entry to a list and caps the length', async () => {
    const legacy = entry('1001', { audioFileName: 'l.m4a', durationMs: 900 });
    seed([legacy]);
    const saved = await save(legacy, {
      recordingTexts: [{ fileName: 'l.m4a', text: 'a'.repeat(MAX_VOICE_TRANSCRIPT_LENGTH + 50) }],
    });
    expect(saved.recordings).toHaveLength(1);
    expect(saved.recordings![0].voiceTranscript).toHaveLength(MAX_VOICE_TRANSCRIPT_LENGTH);
    expect(saved.audioFileName).toBe('l.m4a');
    expect(saved.durationMs).toBe(900);
  });

  it('recordingTexts ignores a non-string text, and throws on an unknown name before changing anything', async () => {
    const e = multi('1001', ['x.m4a'], { recordings: withText('1001').slice(0, 1) });
    seed([e]);
    const same = await save(e, {
      recordingTexts: [{ fileName: 'x.m4a', text: 7 as unknown as string }],
    });
    expect(recordingsOf(same)[0].voiceTranscript).toBe('hello there');
    const before = __fs.read(INDEX);
    await expect(
      save(e, {
        recordingTexts: [
          { fileName: 'x.m4a', text: 'new' },
          { fileName: 'nope.m4a', text: 'zzz' },
        ],
      }),
    ).rejects.toThrow('does not belong');
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('removing a recording drops its text, and the backup is scrubbed too', async () => {
    const e = multi('1001', ['x.m4a', 'y.m4a'], { recordings: withText('1001') });
    seed([e]);
    await save(e, { removeRecordings: ['x.m4a'] });
    expect(stored()[0].recordings).toEqual([{ fileName: 'y.m4a', durationMs: 2000 }]);
    expect(__fs.read(INDEX)).not.toContain('hello there');
    expect(__fs.read(BAK)).not.toContain('hello there');
    expect(__fs.has(audio('x.m4a'))).toBe(false);
  });

  it('a text for a recording removed in the same call is skipped; deleting the entry removes it', async () => {
    const e = multi('1001', ['x.m4a', 'y.m4a'], { recordings: withText('1001') });
    seed([e]);
    const saved = await save(e, {
      removeRecordings: ['y.m4a'],
      recordingTexts: [{ fileName: 'y.m4a', text: 'gone' }],
    });
    expect(recordingsOf(saved).map((r) => r.voiceTranscript)).toEqual(['hello there']);
    await deleteDream(e.id);
    expect(__fs.read(INDEX)).not.toContain('hello there');
  });

  it('rolls back when the index write fails after a text-only change', async () => {
    const e = multi('1001', ['x.m4a'], { recordings: withText('1001').slice(0, 1) });
    seed([e]);
    const before = __fs.read(INDEX);
    __fs.failWhen('write', (uri) => uri === INDEX, new Error('no space'));
    await expect(
      save(e, { recordingTexts: [{ fileName: 'x.m4a', text: 'changed' }] }),
    ).rejects.toThrow('no space');
    expect(stored()[0].recordings![0].voiceTranscript).toBe('hello there');
    expect(__fs.read(INDEX)).toBe(before);
    expect(__fs.has(audio('x.m4a'))).toBe(true);
  });

  it('rolls back new copies (with their texts) when the index write fails', async () => {
    seed([]);
    put('a.m4a');
    __fs.failWhen('write', (uri) => uri === INDEX, new Error('no space'));
    await expect(
      saveDream({
        details: { title: 'T', tags: [] },
        status: 'saved',
        addRecordings: [{ uri: cache('a.m4a'), durationMs: 1, voiceTranscript: 'hi' }],
      }),
    ).rejects.toThrow('no space');
    expect(__fs.list().filter((u) => u.startsWith(`${DOC}/dreams/`))).toEqual([]);
    expect(__fs.has(cache('a.m4a'))).toBe(true);
  });
});
