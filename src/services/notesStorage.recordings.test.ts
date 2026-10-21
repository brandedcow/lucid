import * as fakeFs from '../test/fakeFileSystem';
import {
  Note,
  NoteRecording,
  listNotes,
  recordingUri,
  resetCorruptCopyGuard,
  saveNote,
} from './notesStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const INDEX = 'file:///document/notes.json';
const TMP = 'file:///document/notes.json.tmp';
const A = 'file:///cache/a.m4a';
const B = 'file:///cache/b.m4a';
const C = 'file:///cache/c.m4a';
const PEAKS = [0.1, 0.5, 1];
const audio = (name: string) => `file:///document/notes/${name}`;
const isTmp = (uri: string) => uri === TMP;
const isNotesAudio = (uri: string) => uri.startsWith('file:///document/notes/');
const stored = (): Note[] => JSON.parse(__fs.read(INDEX) as string).notes;

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  __fs.put(A, 'bytes-a');
  __fs.put(B, 'bytes-b');
  __fs.put(C, 'bytes-c');
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T08:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('copy-in', () => {
  it('copies into notes/ under the note id, indexes it, returns it and deletes the cache source', async () => {
    const { note, added } = await saveNote({
      id: '10',
      body: 'with voice',
      addRecordings: [{ uri: A, durationMs: 4200, waveform: PEAKS }],
    });

    expect(added).toEqual([{ fileName: '10.m4a', durationMs: 4200, waveform: PEAKS }]);
    expect(note?.recordings).toEqual(added);
    expect(stored()[0].recordings).toEqual(added);
    expect(__fs.read(audio('10.m4a'))).toBe('bytes-a');
    expect(__fs.has(A)).toBe(false);
    expect(recordingUri(added[0])).toBe(audio('10.m4a'));
  });

  it('stores file names only, never a path', async () => {
    await saveNote({ id: '10', body: 'x', addRecordings: [{ uri: A, durationMs: 1 }] });
    expect(__fs.read(INDEX)).not.toContain('file:///');
    expect(__fs.read(INDEX)).not.toContain('/document');
  });

  it('adds several in input order under distinct names', async () => {
    const { added } = await saveNote({
      id: '10',
      body: 'x',
      addRecordings: [
        { uri: A, durationMs: 1 },
        { uri: B, durationMs: 2 },
        { uri: C, durationMs: 3 },
      ],
    });
    expect(added.map((r) => [r.fileName, r.durationMs])).toEqual([
      ['10.m4a', 1],
      ['10-1.m4a', 2],
      ['10-2.m4a', 3],
    ]);
    expect(__fs.read(audio('10-2.m4a'))).toBe('bytes-c');
  });

  it('a later save appends after the recordings the note already has', async () => {
    await saveNote({ id: '10', body: 'x', addRecordings: [{ uri: A, durationMs: 1 }] });
    const { note, added } = await saveNote({
      id: '10',
      body: 'x',
      addRecordings: [{ uri: B, durationMs: 2 }],
    });
    expect(added.map((r) => r.fileName)).toEqual(['10-1.m4a']);
    expect(note?.recordings?.map((r) => r.fileName)).toEqual(['10.m4a', '10-1.m4a']);
  });

  it('never overwrites a stale file: the next free name is used and the stale content stays', async () => {
    __fs.put(audio('10.m4a'), 'stale');
    const { added } = await saveNote({
      id: '10',
      body: 'x',
      addRecordings: [{ uri: A, durationMs: 1 }],
    });
    expect(added[0].fileName).toBe('10-1.m4a');
    expect(__fs.read(audio('10.m4a'))).toBe('stale');
  });

  it('skips a name another note references even when no file is there', async () => {
    __fs.put(
      INDEX,
      JSON.stringify({
        version: 1,
        notes: [
          {
            id: 'other',
            createdAt: 'c',
            updatedAt: 'u',
            body: 'o',
            recordings: [{ fileName: '10.m4a', durationMs: 1 }],
          },
        ],
      }),
    );
    const { added } = await saveNote({
      id: '10',
      body: 'x',
      addRecordings: [{ uri: A, durationMs: 1 }],
    });
    expect(added[0].fileName).toBe('10-1.m4a');
  });

  it('typing never re-copies: saves without additions copy nothing', async () => {
    await saveNote({ id: '10', body: 'a', addRecordings: [{ uri: A, durationMs: 1 }] });
    const copies = __fs.copies().length;
    await saveNote({ id: '10', body: 'ab' });
    await saveNote({ id: '10', body: 'abc' });
    await saveNote({ id: '10', body: 'abc' });
    // Only the index backup was copied; no audio.
    expect(
      __fs
        .copies()
        .slice(copies)
        .filter((c) => isNotesAudio(c.to)),
    ).toEqual([]);
    expect(stored()[0].recordings).toHaveLength(1);
  });

  it('keeps unknown fields on a stored recording through later saves and additions', async () => {
    __fs.put(
      INDEX,
      JSON.stringify({
        version: 1,
        notes: [
          {
            id: '10',
            createdAt: 'c',
            updatedAt: 'u',
            body: 'b',
            recordings: [
              { fileName: 'old.m4a', durationMs: 5, heldAt: 'h', origin: 'legacy', future: [1] },
            ],
          },
        ],
      }),
    );
    await saveNote({ id: '10', body: 'b2' });
    await saveNote({ id: '10', body: 'b2', addRecordings: [{ uri: A, durationMs: 1 }] });
    expect(stored()[0].recordings?.[0]).toEqual({
      fileName: 'old.m4a',
      durationMs: 5,
      heldAt: 'h',
      origin: 'legacy',
      future: [1],
    });
    expect(stored()[0].recordings).toHaveLength(2);
  });

  it('refuses a missing source before creating anything', async () => {
    await expect(
      saveNote({
        id: '10',
        body: 'x',
        addRecordings: [
          { uri: A, durationMs: 1 },
          { uri: 'file:///cache/gone.m4a', durationMs: 1 },
        ],
      }),
    ).rejects.toThrow('could not be found');
    expect(__fs.list().filter(isNotesAudio)).toEqual([]);
    expect(__fs.has(INDEX)).toBe(false);
    expect(__fs.has(A)).toBe(true);
  });

  it.each([
    ['a stored note recording', audio('9.m4a')],
    ['a legacy dream recording', 'file:///document/dreams/9.m4a'],
  ])('refuses %s as a source (its source would be deleted)', async (_n, uri) => {
    __fs.put(uri, 'precious');
    await expect(
      saveNote({ id: '10', body: 'x', addRecordings: [{ uri, durationMs: 1 }] }),
    ).rejects.toThrow('cannot be added');
    expect(__fs.read(uri)).toBe('precious');
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('cleans metadata: invalid waveform dropped, bad duration becomes 0, transcript trimmed', async () => {
    const { added } = await saveNote({
      id: '10',
      body: 'x',
      addRecordings: [
        { uri: A, durationMs: NaN, waveform: [5, 1], voiceTranscript: '  hello there  ' },
        { uri: B, durationMs: 2, voiceTranscript: '' },
        { uri: C, durationMs: 3, voiceTranscript: 42 as unknown as string },
      ],
    });
    expect(added).toEqual([
      { fileName: '10.m4a', durationMs: 0, voiceTranscript: 'hello there' },
      { fileName: '10-1.m4a', durationMs: 2, voiceTranscript: '' },
      { fileName: '10-2.m4a', durationMs: 3 },
    ]);
  });

  it('caps a very long transcript', async () => {
    const { added } = await saveNote({
      id: '10',
      body: 'x',
      addRecordings: [{ uri: A, durationMs: 1, voiceTranscript: 'a'.repeat(30000) }],
    });
    expect(added[0].voiceTranscript).toHaveLength(20000);
  });
});

describe('rollback when the copy-in or the commit fails', () => {
  it('the k-th of n copies failing (partial file) removes only this save copies; sources stay; retry works', async () => {
    const adds = [
      { uri: A, durationMs: 1 },
      { uri: B, durationMs: 2 },
      { uri: C, durationMs: 3 },
    ];
    __fs.put(audio('keep.m4a'), 'earlier'); // already stored: must survive
    __fs.failNth('copy', 2, new Error('copy failed'), { leave: 'partial' });

    await expect(saveNote({ id: '10', body: 'x', addRecordings: adds })).rejects.toThrow(
      'copy failed',
    );

    expect(__fs.list().filter(isNotesAudio)).toEqual([audio('keep.m4a')]);
    expect(__fs.read(audio('keep.m4a'))).toBe('earlier');
    for (const uri of [A, B, C]) expect(__fs.has(uri)).toBe(true);
    expect(__fs.has(INDEX)).toBe(false);

    const { added } = await saveNote({ id: '10', body: 'x', addRecordings: adds });
    expect(added.map((r) => r.fileName)).toEqual(['10.m4a', '10-1.m4a', '10-2.m4a']);
    expect(__fs.has(A)).toBe(false);
  });

  it('the first copy failing leaves no file and no index', async () => {
    __fs.failNth('copy', 1, new Error('copy failed'), { leave: 'partial' });
    await expect(
      saveNote({ id: '10', body: 'x', addRecordings: [{ uri: A, durationMs: 1 }] }),
    ).rejects.toThrow('copy failed');
    expect(__fs.list().filter(isNotesAudio)).toEqual([]);
    expect(__fs.has(A)).toBe(true);
  });

  it('a failed index write on an existing note deletes only this save copies, not earlier audio', async () => {
    await saveNote({ id: '10', body: 'x', addRecordings: [{ uri: A, durationMs: 1 }] });
    const before = __fs.read(INDEX);
    __fs.failWhen('write', isTmp, new Error('disk full'));

    await expect(
      saveNote({ id: '10', body: 'x2', addRecordings: [{ uri: B, durationMs: 2 }] }),
    ).rejects.toThrow('disk full');

    expect(__fs.read(audio('10.m4a'))).toBe('bytes-a');
    expect(__fs.has(audio('10-1.m4a'))).toBe(false);
    expect(__fs.has(B)).toBe(true);
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('a copy that cannot be removed again during rollback does not hide the original error', async () => {
    __fs.failWhen('write', isTmp, new Error('disk full'));
    __fs.failWhen('delete', isNotesAudio, new Error('delete failed'));
    await expect(
      saveNote({ id: '10', body: 'x', addRecordings: [{ uri: A, durationMs: 1 }] }),
    ).rejects.toThrow('disk full');
    expect(__fs.has(A)).toBe(true);
  });

  it('a failing cache source delete after the commit does not fail the save', async () => {
    __fs.failWhen('delete', (uri) => uri === A, new Error('delete failed'));
    const { note, added } = await saveNote({
      id: '10',
      body: 'x',
      addRecordings: [
        { uri: A, durationMs: 1 },
        { uri: B, durationMs: 2 },
      ],
    });
    expect(note?.recordings).toEqual(added);
    expect(stored()[0].recordings).toHaveLength(2);
    expect(__fs.has(A)).toBe(true); // left behind, harmless
    expect(__fs.has(B)).toBe(false); // the next one is still cleaned up
    expect(__fs.has(audio('10.m4a'))).toBe(true);
  });

  it('keeps every cache source until the index is committed', async () => {
    let sourcesAtCommit: boolean[] = [];
    __fs.failWhen('write', (uri) => {
      if (isTmp(uri)) sourcesAtCommit = [__fs.has(A), __fs.has(B)];
      return false;
    });
    await saveNote({
      id: '10',
      body: 'x',
      addRecordings: [
        { uri: A, durationMs: 1 },
        { uri: B, durationMs: 2 },
      ],
    });
    expect(sourcesAtCommit).toEqual([true, true]);
    expect(__fs.has(A) || __fs.has(B)).toBe(false);
  });
});

describe('recordingTexts', () => {
  const seed = () =>
    saveNote({
      id: '10',
      body: 'x',
      addRecordings: [
        { uri: A, durationMs: 1, voiceTranscript: 'draft' },
        { uri: B, durationMs: 2 },
      ],
    });

  it('sets and replaces the text of stored recordings by file name, without touching files', async () => {
    await seed();
    const files = __fs.list().filter(isNotesAudio);
    jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));

    const { note, added } = await saveNote({
      id: '10',
      body: 'x',
      recordingTexts: [
        { fileName: '10.m4a', text: '  final  ' },
        { fileName: '10-1.m4a', text: 'second' },
      ],
    });

    expect(added).toEqual([]);
    expect(note?.recordings?.map((r) => r.voiceTranscript)).toEqual(['final', 'second']);
    expect(note?.updatedAt).toBe('2026-10-04T09:00:00.000Z');
    expect(__fs.list().filter(isNotesAudio)).toEqual(files);
  });

  it('an unchanged text writes nothing', async () => {
    await seed();
    const before = __fs.read(INDEX);
    __fs.failWhen('write', () => true);
    await saveNote({
      id: '10',
      body: 'x',
      recordingTexts: [{ fileName: '10.m4a', text: 'draft' }],
    });
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('ignores a non-string text', async () => {
    await seed();
    const before = __fs.read(INDEX);
    await saveNote({
      id: '10',
      body: 'x',
      recordingTexts: [{ fileName: '10.m4a', text: 7 as unknown as string }],
    });
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('a name that is not the note recording throws before anything changes', async () => {
    await seed();
    const before = __fs.read(INDEX);
    __fs.put(C, 'bytes-c');
    await expect(
      saveNote({
        id: '10',
        body: 'changed',
        addRecordings: [{ uri: C, durationMs: 1 }],
        recordingTexts: [{ fileName: 'nope.m4a', text: 't' }],
      }),
    ).rejects.toThrow('does not belong');
    expect(__fs.read(INDEX)).toBe(before);
    expect(__fs.has(audio('10-2.m4a'))).toBe(false);
    expect(__fs.has(C)).toBe(true);
  });

  it('a text for a note that does not exist yet throws', async () => {
    await expect(
      saveNote({ id: '11', body: 'x', recordingTexts: [{ fileName: '11.m4a', text: 't' }] }),
    ).rejects.toThrow('does not belong');
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('works for a held recording too', async () => {
    await seed();
    const list = stored();
    list[0].recordings![0] = { ...list[0].recordings![0], heldAt: 'h' } as NoteRecording;
    __fs.put(INDEX, JSON.stringify({ version: 1, notes: list }));
    const { note } = await saveNote({
      id: '10',
      body: 'x',
      recordingTexts: [{ fileName: '10.m4a', text: 'edited' }],
    });
    expect(note?.recordings?.[0]).toMatchObject({ heldAt: 'h', voiceTranscript: 'edited' });
  });
});

describe('recordingUri', () => {
  it('resolves a normal recording into notes/ and a legacy one into dreams/', () => {
    expect(recordingUri({ fileName: 'a.m4a', durationMs: 1 })).toBe(audio('a.m4a'));
    expect(recordingUri({ fileName: 'a.m4a', durationMs: 1, origin: 'legacy' })).toBe(
      'file:///document/dreams/a.m4a',
    );
  });
});

describe('listing a note with recordings', () => {
  it('returns the stored recordings, held ones included', async () => {
    await saveNote({ id: '10', body: 'x', addRecordings: [{ uri: A, durationMs: 1 }] });
    const [n] = await listNotes();
    expect(n.recordings?.map((r) => r.fileName)).toEqual(['10.m4a']);
  });
});
