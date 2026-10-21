import * as fakeFs from '../test/fakeFileSystem';
import {
  NOTE_NOT_FOUND,
  holdRecording,
  listNotes,
  releaseRecording,
  resetCorruptCopyGuard,
  saveNote,
  softDeleteNote,
} from './notesStorage';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const INDEX = 'file:///document/notes.json';
const TMP = 'file:///document/notes.json.tmp';
const A = 'file:///cache/a.m4a';
const B = 'file:///cache/b.m4a';
const audio = (name: string) => `file:///document/notes/${name}`;
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return 'did not throw';
};
const recordings = async (id = '10') =>
  (await listNotes({ includeDeleted: true })).find((n) => n.id === id)?.recordings ?? [];

beforeEach(async () => {
  __fs.reset();
  resetCorruptCopyGuard();
  __fs.put(A, 'bytes-a');
  __fs.put(B, 'bytes-b');
  jest.useFakeTimers().setSystemTime(new Date('2026-10-04T08:00:00Z'));
  await saveNote({
    id: '10',
    body: 'text',
    addRecordings: [
      { uri: A, durationMs: 1 },
      { uri: B, durationMs: 2 },
    ],
  });
  jest.setSystemTime(new Date('2026-10-04T09:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('holdRecording', () => {
  it('marks the recording held in the index and deletes nothing', async () => {
    const files = __fs.list();
    __fs.failWhen('delete', () => true); // a delete attempt would throw and fail the call

    const note = await holdRecording('10', '10.m4a');

    expect(note.recordings?.[0]).toMatchObject({
      fileName: '10.m4a',
      heldAt: '2026-10-04T09:00:00.000Z',
    });
    expect(note.recordings?.[1]).not.toHaveProperty('heldAt');
    expect((await recordings()).map((r) => r.heldAt)).toEqual([
      '2026-10-04T09:00:00.000Z',
      undefined,
    ]);
    for (const uri of files) expect(__fs.has(uri)).toBe(true);
    expect(__fs.read(audio('10.m4a'))).toBe('bytes-a');
  });

  it('does not change updatedAt', async () => {
    const note = await holdRecording('10', '10.m4a');
    expect(note.updatedAt).toBe('2026-10-04T08:00:00.000Z');
  });

  it('holding twice keeps the first time and writes nothing the second time', async () => {
    await holdRecording('10', '10.m4a');
    jest.setSystemTime(new Date('2026-10-04T10:00:00Z'));
    __fs.failWhen('write', () => true);
    const note = await holdRecording('10', '10.m4a');
    expect(note.recordings?.[0].heldAt).toBe('2026-10-04T09:00:00.000Z');
  });

  it('survives the next read (a restart) with the other recording untouched', async () => {
    await holdRecording('10', '10-1.m4a');
    const [, second] = await recordings();
    expect(second.heldAt).toBeDefined();
    expect((await recordings())[0].heldAt).toBeUndefined();
  });

  it('a body autosave afterwards keeps the hold and copies nothing', async () => {
    await holdRecording('10', '10.m4a');
    const copies = __fs.copies().length;
    await saveNote({ id: '10', body: 'more text' });
    expect((await recordings())[0].heldAt).toBe('2026-10-04T09:00:00.000Z');
    expect(
      __fs
        .copies()
        .slice(copies)
        .filter((c) => c.to.includes('/notes/')),
    ).toEqual([]);
  });

  it('a note whose recordings are all held is not empty when its text is cleared', async () => {
    await holdRecording('10', '10.m4a');
    await holdRecording('10', '10-1.m4a');
    const { note } = await saveNote({ id: '10', body: '' });
    expect(note?.deletedAt).toBeUndefined();
    expect(await listNotes()).toHaveLength(1);
  });

  it('a commit failure leaves the recording not held', async () => {
    __fs.failWhen('write', (uri) => uri === TMP, new Error('disk full'));
    await expect(holdRecording('10', '10.m4a')).rejects.toThrow('disk full');
    expect((await recordings())[0].heldAt).toBeUndefined();
  });

  it('works on a legacy recording and on a note in Recently Deleted', async () => {
    __fs.put(
      INDEX,
      JSON.stringify({
        version: 1,
        notes: [
          {
            id: 'old',
            createdAt: 'c',
            updatedAt: 'u',
            body: 'b',
            deletedAt: 'd',
            recordings: [{ fileName: 'd.m4a', durationMs: 1, origin: 'legacy' }],
          },
        ],
      }),
    );
    const note = await holdRecording('old', 'd.m4a');
    expect(note.recordings?.[0]).toMatchObject({ origin: 'legacy', heldAt: expect.any(String) });
    expect(note.deletedAt).toBe('d');
  });

  it('throws NOTE_NOT_FOUND for an unknown note or recording and writes nothing', async () => {
    const before = __fs.read(INDEX);
    __fs.failWhen('write', () => true);
    expect(await codeOf(holdRecording('nope', '10.m4a'))).toBe(NOTE_NOT_FOUND);
    expect(await codeOf(holdRecording('10', 'nope.m4a'))).toBe(NOTE_NOT_FOUND);
    expect(__fs.read(INDEX)).toBe(before);
  });
});

describe('releaseRecording', () => {
  it('clears the hold and keeps everything else about the recording', async () => {
    await saveNote({
      id: '10',
      body: 'text',
      recordingTexts: [{ fileName: '10.m4a', text: 'words' }],
    });
    await holdRecording('10', '10.m4a');
    const note = await releaseRecording('10', '10.m4a');
    expect(note.recordings?.[0]).toEqual({
      fileName: '10.m4a',
      durationMs: 1,
      voiceTranscript: 'words',
    });
    expect(note.recordings?.[0]).not.toHaveProperty('heldAt');
    expect(__fs.read(audio('10.m4a'))).toBe('bytes-a');
  });

  it('releasing a recording that is not held writes nothing', async () => {
    const before = __fs.read(INDEX);
    __fs.failWhen('write', () => true);
    const note = await releaseRecording('10', '10.m4a');
    expect(note.recordings).toHaveLength(2);
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('a commit failure leaves the recording held', async () => {
    await holdRecording('10', '10.m4a');
    __fs.failWhen('write', (uri) => uri === TMP, new Error('disk full'));
    await expect(releaseRecording('10', '10.m4a')).rejects.toThrow('disk full');
    expect((await recordings())[0].heldAt).toBeDefined();
  });

  it('throws NOTE_NOT_FOUND for an unknown note or recording', async () => {
    expect(await codeOf(releaseRecording('nope', '10.m4a'))).toBe(NOTE_NOT_FOUND);
    expect(await codeOf(releaseRecording('10', 'nope.m4a'))).toBe(NOTE_NOT_FOUND);
  });

  it('a soft-deleted note keeps its held recordings and their files', async () => {
    await holdRecording('10', '10.m4a');
    await softDeleteNote('10');
    expect((await recordings())[0].heldAt).toBeDefined();
    expect(__fs.has(audio('10.m4a'))).toBe(true);
  });
});
