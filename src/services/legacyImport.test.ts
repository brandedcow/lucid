import * as fakeFs from '../test/fakeFileSystem';
import { inlineTags } from '../utils/inlineTags';
import { noteTitle } from '../utils/noteTitle';
import {
  MigrationResult,
  migrateLegacyDreams,
  readMigrationMarker,
  resetLegacyImportForTests,
} from './legacyImport';
import {
  Note,
  deletableAudioFiles,
  deleteNoteForever,
  listNotes,
  recordingUri,
  resetCorruptCopyGuard,
  softDeleteNote,
} from './notesStorage';

// Node's fs, for the source audit below (the project has no Node type definitions).
const nodeFs = jest.requireActual('fs') as { readFileSync(path: string, encoding: 'utf8'): string };

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const DOC = 'file:///document/';
const SOURCE = DOC + 'dreams.json';
const BACKUP = DOC + 'dreams.json.bak';
const JOURNALS = DOC + 'journals.json';
const INDEX = DOC + 'notes.json';
const MARKER = DOC + 'migrated.json';

const putDreams = (...dreams: unknown[]) => __fs.put(SOURCE, JSON.stringify(dreams));
const dream = (extra: Record<string, unknown> = {}) => ({
  id: '1760000000000',
  createdAt: '2026-10-01T08:00:00.000Z',
  status: 'finished',
  journalId: 'dreams',
  ...extra,
});
const imported = (result: MigrationResult) => {
  if (result.status !== 'imported') throw new Error(`status was ${result.status}`);
  return result;
};
const storedNotes = (): Note[] => JSON.parse(__fs.read(INDEX) as string).notes;
const storedMarker = () => JSON.parse(__fs.read(MARKER) as string);
const bodyOf = async (id = '1760000000000') => (await listNotes()).find((n) => n.id === id)?.body;

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  resetLegacyImportForTests();
  jest.useFakeTimers().setSystemTime(new Date('2026-10-18T08:00:00Z'));
});

afterEach(() => jest.useRealTimers());

describe('conversion', () => {
  it('lays out title, text, emotion and tags exactly', async () => {
    putDreams(
      dream({
        title: 'Flying home',
        transcript: 'I was over the sea.\nThen a storm.',
        emotion: 'sad, afraid',
        tags: ['sea', 'storm'],
      }),
    );
    const result = imported(await migrateLegacyDreams());
    expect(result).toMatchObject({ read: 1, added: 1, alreadyPresent: 0, markerWritten: true });

    const [note] = storedNotes();
    expect(note.body).toBe(
      'Flying home\n\nI was over the sea.\nThen a storm.\n\nEmotion: sad, afraid\n\n#dreams #sea #storm',
    );
    expect(note).toMatchObject({
      id: '1760000000000',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z',
    });
    expect(Object.keys(note).sort()).toEqual(['body', 'createdAt', 'id', 'updatedAt']);
    expect(noteTitle(note.body)).toBe('Flying home');
    expect(inlineTags(note.body)).toEqual(['dreams', 'sea', 'storm']);
  });

  it('imports a Life entry without a title and tags a missing journal as dreams', async () => {
    putDreams(
      dream({ id: 'a1', journalId: 'life', transcript: 'Bought bread\nand milk' }),
      dream({ id: 'a2', journalId: undefined, transcript: 'Just text' }),
    );
    imported(await migrateLegacyDreams());
    expect(await bodyOf('a1')).toBe('Bought bread\nand milk\n\n#life');
    expect(noteTitle((await bodyOf('a1')) as string)).toBe('Bought bread');
    expect(await bodyOf('a2')).toBe('Just text\n\n#dreams');
  });

  it('turns a custom journal name into a tag, with fallbacks', async () => {
    __fs.put(
      JOURNALS,
      JSON.stringify({
        version: 1,
        journals: [
          { id: 'j_a', name: 'Dream work' },
          { id: 'j_b', name: '2024' },
          { id: 'j_bad', name: '' },
        ],
      }),
    );
    putDreams(
      dream({ id: 'b1', journalId: 'j_a', transcript: 'x' }),
      dream({ id: 'b2', journalId: 'j_b', transcript: 'x' }),
      dream({ id: 'b3', journalId: 'j_missing', transcript: 'x' }),
      dream({ id: 'b4', journalId: 'j_bad', transcript: 'x' }),
    );
    imported(await migrateLegacyDreams());
    expect(await bodyOf('b1')).toBe('x\n\n#dream-work');
    expect(await bodyOf('b2')).toBe('x\n\n#journal-2024');
    expect(await bodyOf('b3')).toBe('x\n\n#j_missing');
    expect(await bodyOf('b4')).toBe('x\n\n#j_bad');
  });

  it('falls back to the id as the tag when the registry is unreadable', async () => {
    __fs.put(JOURNALS, '{ not json');
    putDreams(dream({ journalId: 'j_a', transcript: 'x' }));
    imported(await migrateLegacyDreams());
    expect(await bodyOf()).toBe('x\n\n#j_a');
  });

  it('imports a draft like any other entry, with no extra field', async () => {
    putDreams(dream({ status: 'draft', transcript: 'half a thought' }));
    imported(await migrateLegacyDreams());
    const [note] = storedNotes();
    expect(note.body).toBe('half a thought\n\n#dreams');
    expect(Object.keys(note).sort()).toEqual(['body', 'createdAt', 'id', 'updatedAt']);
  });

  it('collapses the emotion to one line and omits an empty one', async () => {
    putDreams(
      dream({ id: 'e1', transcript: 't', emotion: '  sad,\n  afraid   ' }),
      dream({ id: 'e2', transcript: 't', emotion: '' }),
      dream({ id: 'e3', transcript: 't', emotion: ' \n ' }),
    );
    imported(await migrateLegacyDreams());
    expect(await bodyOf('e1')).toBe('t\n\nEmotion: sad, afraid\n\n#dreams');
    expect(await bodyOf('e2')).toBe('t\n\n#dreams');
    expect(await bodyOf('e3')).toBe('t\n\n#dreams');
  });

  it('keeps only tags that can be inline, once each, and skips ones already in the text', async () => {
    putDreams(
      dream({
        transcript: 'I felt #scared today',
        tags: ['123', 'x'.repeat(41), 'bad dream', 'dreams', 'scared', 'bad dream', 7, 'ok'],
      }),
    );
    imported(await migrateLegacyDreams());
    expect(await bodyOf()).toBe('I felt #scared today\n\n#dreams #bad-dream #ok');
  });

  it('ignores a tags value that is not a list', async () => {
    putDreams(dream({ transcript: 'x', tags: 'sea' }));
    imported(await migrateLegacyDreams());
    expect(await bodyOf()).toBe('x\n\n#dreams');
  });

  it('normalizes Windows line endings', async () => {
    putDreams(dream({ title: 'A\r\nB', transcript: 'one\r\ntwo\r\n' }));
    imported(await migrateLegacyDreams());
    expect(await bodyOf()).toBe('A B\n\none\ntwo\n\n#dreams');
  });

  it('skips an entry with nothing in it but imports a recording-only or tags-only one', async () => {
    putDreams(
      dream({ id: 'n1', title: ' ', transcript: '', emotion: '', tags: [] }),
      dream({ id: 'n2', audioFileName: 'a.m4a', durationMs: 1000 }),
      dream({ id: 'n3', tags: ['sea'] }),
    );
    const result = imported(await migrateLegacyDreams());
    expect(result.skipped).toEqual([{ index: 0, id: 'n1', reason: 'empty' }]);
    expect(await bodyOf('n2')).toBe('#dreams');
    expect(await bodyOf('n3')).toBe('#dreams #sea');
  });

  it('pins the title edge: a #word title is a tag and the text stays intact', async () => {
    putDreams(dream({ title: '# big', transcript: 'x' }));
    imported(await migrateLegacyDreams());
    expect(await bodyOf()).toBe('# big\n\nx\n\n#dreams');
  });
});

describe('recordings', () => {
  it('maps a recordings list to legacy records and keeps what is valid', async () => {
    putDreams(
      dream({
        transcript: 't',
        recordings: [
          { fileName: 'a.m4a', durationMs: 1500, waveform: [0, 0.5, 1], voiceTranscript: 'hello' },
          { fileName: 'b.m4a', durationMs: 'x', waveform: [2, 3], voiceTranscript: 5 },
          { fileName: '' },
          null,
        ],
      }),
    );
    imported(await migrateLegacyDreams());
    const [note] = storedNotes();
    expect(note.recordings).toEqual([
      {
        fileName: 'a.m4a',
        durationMs: 1500,
        waveform: [0, 0.5, 1],
        voiceTranscript: 'hello',
        origin: 'legacy',
      },
      { fileName: 'b.m4a', durationMs: 0, origin: 'legacy' },
    ]);
    expect(note.recordings?.some((r) => 'heldAt' in r)).toBe(false);
  });

  it('maps the single legacy audio fields to one record', async () => {
    putDreams(dream({ transcript: 't', audioFileName: 'one.m4a', durationMs: 900, waveform: [1] }));
    imported(await migrateLegacyDreams());
    expect(storedNotes()[0].recordings).toEqual([
      { fileName: 'one.m4a', durationMs: 900, waveform: [1], origin: 'legacy' },
    ]);
  });

  it('drops a recording with an unsafe name, lists it, and still imports the rest', async () => {
    putDreams(
      dream({
        transcript: 't',
        recordings: [
          { fileName: '../x', durationMs: 1 },
          { fileName: 'a/b', durationMs: 1 },
          { fileName: 7, durationMs: 1 },
          { fileName: 'good.m4a', durationMs: 1 },
        ],
      }),
    );
    const result = imported(await migrateLegacyDreams());
    expect(storedNotes()[0].recordings?.map((r) => r.fileName)).toEqual(['good.m4a']);
    expect(result.droppedRecordings).toEqual([
      { id: '1760000000000', fileName: '../x' },
      { id: '1760000000000', fileName: 'a/b' },
    ]);
  });

  it('omits recordings when none remain', async () => {
    putDreams(dream({ transcript: 't', audioFileName: '../x' }));
    const result = imported(await migrateLegacyDreams());
    expect(storedNotes()[0]).not.toHaveProperty('recordings');
    expect(result.droppedRecordings).toHaveLength(1);
  });

  it('resolves imported audio in dreams/ and never offers it for deletion', async () => {
    putDreams(dream({ transcript: 't', audioFileName: 'one.m4a', durationMs: 900 }));
    __fs.put(DOC + 'dreams/one.m4a', 'audio');
    imported(await migrateLegacyDreams());
    const notes = await listNotes();
    expect(recordingUri(notes[0].recordings![0])).toBe(DOC + 'dreams/one.m4a');
    expect(deletableAudioFiles(notes[0], notes)).toEqual([]);
    await softDeleteNote(notes[0].id);
    await deleteNoteForever(notes[0].id);
    expect(__fs.has(DOC + 'dreams/one.m4a')).toBe(true);
  });
});

describe('ids and timestamps', () => {
  it('stringifies a numeric id, skips unsafe ids and suffixes duplicates', async () => {
    putDreams(
      dream({ id: 1760000000001, transcript: 'num' }),
      dream({ id: 'a/b', transcript: 'slash' }),
      dream({ id: '..', transcript: 'dots' }),
      dream({ id: 'dup', transcript: 'one' }),
      dream({ id: 'dup', transcript: 'two' }),
      dream({ id: 'dup', transcript: 'three' }),
      dream({ id: undefined, transcript: 'none' }),
    );
    const result = imported(await migrateLegacyDreams());
    expect(storedNotes().map((n) => n.id)).toEqual(['1760000000001', 'dup', 'dup-d2', 'dup-d3']);
    expect(result.skipped).toEqual([
      { index: 1, id: 'a/b', reason: 'bad-id' },
      { index: 2, id: '..', reason: 'bad-id' },
      { index: 6, reason: 'bad-id' },
    ]);
  });

  it('falls back to the id date for a bad createdAt, else skips', async () => {
    putDreams(
      dream({ id: '1760000000000', createdAt: 'nonsense', transcript: 'a' }),
      dream({ id: 'abc', createdAt: undefined, transcript: 'b' }),
      dream({ id: '5', createdAt: 5, transcript: 'c' }),
    );
    const result = imported(await migrateLegacyDreams());
    expect(storedNotes()).toHaveLength(1);
    expect(storedNotes()[0]).toMatchObject({
      createdAt: new Date(1760000000000).toISOString(),
      updatedAt: new Date(1760000000000).toISOString(),
    });
    expect(result.skipped).toEqual([
      { index: 1, id: 'abc', reason: 'bad-created-at' },
      { index: 2, id: '5', reason: 'bad-created-at' },
    ]);
  });

  it('skips non-objects and null and still imports the rest in one batch', async () => {
    putDreams(null, 'text', 4, [1], dream({ transcript: 'ok' }));
    const result = imported(await migrateLegacyDreams());
    expect(result.added).toBe(1);
    expect(result.read).toBe(5);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'not-an-object',
      'not-an-object',
      'not-an-object',
      'not-an-object',
    ]);
  });
});

describe('running once', () => {
  it('imports on the first run, writes the marker, and does nothing on the second', async () => {
    putDreams(dream({ id: 'a', transcript: 'one' }), dream({ id: 'b', transcript: '' }));
    const first = imported(await migrateLegacyDreams());
    expect(first).toMatchObject({ read: 2, added: 1, markerWritten: true, usedBackup: false });
    expect(storedMarker()).toMatchObject({
      version: 1,
      source: 'dreams.json',
      usedBackup: false,
      read: 2,
      added: 1,
      alreadyPresent: 0,
      skipped: [{ index: 1, id: 'b', reason: 'empty' }],
      droppedRecordings: [],
    });
    expect(typeof (await readMigrationMarker())?.importedAt).toBe('string');
    expect(__fs.read(MARKER)).not.toContain('one');

    const before = __fs.read(INDEX);
    expect(await migrateLegacyDreams()).toEqual({ status: 'already-done' });
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('does not bring a Deleted-forever note back, and a lost marker re-adds only what is missing', async () => {
    putDreams(dream({ id: 'a', transcript: 'one' }), dream({ id: 'b', transcript: 'two' }));
    imported(await migrateLegacyDreams());
    await softDeleteNote('a');
    await deleteNoteForever('a');

    expect(await migrateLegacyDreams()).toEqual({ status: 'already-done' });
    expect((await listNotes({ includeDeleted: true })).map((n) => n.id)).toEqual(['b']);

    __fs.put(MARKER, ''); // a zero-length marker counts as absent
    const again = imported(await migrateLegacyDreams());
    expect(again).toMatchObject({ added: 1, alreadyPresent: 1 });
    expect((await listNotes()).map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  it('survives a failed marker write and finishes on the next call', async () => {
    putDreams(dream({ id: 'a', transcript: 'one' }));
    __fs.failWhen('write', (uri) => uri.endsWith('migrated.json'));
    const first = imported(await migrateLegacyDreams());
    expect(first).toMatchObject({ added: 1, markerWritten: false });
    expect(__fs.has(MARKER)).toBe(false);

    __fs.clearFailures();
    const second = imported(await migrateLegacyDreams());
    expect(second).toMatchObject({ added: 0, alreadyPresent: 1, markerWritten: true });
    expect(await migrateLegacyDreams()).toEqual({ status: 'already-done' });
  });

  it.each(['{', ''])('treats a corrupt or zero-length marker (%j) as absent', async (content) => {
    __fs.put(MARKER, content);
    putDreams(dream({ transcript: 'x' }));
    expect(imported(await migrateLegacyDreams()).added).toBe(1);
  });

  it('treats a marker of another shape as absent', async () => {
    __fs.put(MARKER, JSON.stringify({ version: 2, importedAt: 'x' }));
    expect(await readMigrationMarker()).toBeNull();
    __fs.put(MARKER, JSON.stringify({ version: 1 }));
    expect(await readMigrationMarker()).toBeNull();
  });

  it('keeps existing notes and does not duplicate a note with the same id', async () => {
    __fs.put(
      INDEX,
      JSON.stringify({
        version: 1,
        notes: [
          { id: 'x', createdAt: 'c', updatedAt: 'u', body: 'mine' },
          { id: 'a', createdAt: 'c', updatedAt: 'u', body: 'already there' },
        ],
      }),
    );
    putDreams(dream({ id: 'a', transcript: 'one' }), dream({ id: 'b', transcript: 'two' }));
    const result = imported(await migrateLegacyDreams());
    expect(result).toMatchObject({ added: 1, alreadyPresent: 1 });
    expect(storedNotes().map((n) => [n.id, n.body])).toEqual([
      ['x', 'mine'],
      ['a', 'already there'],
      ['b', 'two\n\n#dreams'],
    ]);
  });

  it('runs once for two concurrent calls', async () => {
    putDreams(dream({ transcript: 'x' }));
    const first = migrateLegacyDreams();
    const second = migrateLegacyDreams();
    expect(second).toBe(first);
    expect(imported(await first).added).toBe(1);
    expect(storedNotes()).toHaveLength(1);
  });
});

describe('source and error policy', () => {
  it('reports no-source and creates nothing', async () => {
    expect(await migrateLegacyDreams()).toEqual({ status: 'no-source' });
    expect(__fs.list()).toEqual([]);
  });

  it('uses the backup only when dreams.json is missing or zero-length', async () => {
    __fs.put(BACKUP, JSON.stringify([dream({ transcript: 'from backup' })]));
    __fs.put(SOURCE, '');
    const result = imported(await migrateLegacyDreams());
    expect(result.usedBackup).toBe(true);
    expect(storedMarker().usedBackup).toBe(true);
    expect(await bodyOf()).toBe('from backup\n\n#dreams');
  });

  it('reports no-source for a zero-length dreams.json without a backup', async () => {
    __fs.put(SOURCE, '');
    expect(await migrateLegacyDreams()).toEqual({ status: 'no-source' });
    expect(__fs.has(MARKER)).toBe(false);
  });

  it('treats an empty array as a valid source: marker only, no notes.json', async () => {
    putDreams();
    const result = imported(await migrateLegacyDreams());
    expect(result).toMatchObject({ read: 0, added: 0, markerWritten: true });
    expect(__fs.has(INDEX)).toBe(false);
  });

  it.each([['{ corrupt'], [JSON.stringify({ a: 1 })]])(
    'does not import an unreadable dreams.json (%s) even with a good backup',
    async (content) => {
      __fs.put(SOURCE, content);
      __fs.put(BACKUP, JSON.stringify([dream({ transcript: 'x' })]));
      const before = __fs.list().sort();
      expect(await migrateLegacyDreams()).toEqual({ status: 'source-unreadable' });
      expect(__fs.list().sort()).toEqual(before);
      expect(__fs.read(SOURCE)).toBe(content);
    },
  );

  it('reports notes-unreadable without a marker and leaves notes.json alone', async () => {
    __fs.put(INDEX, '{ broken');
    putDreams(dream({ transcript: 'x' }));
    expect(await migrateLegacyDreams()).toEqual({ status: 'notes-unreadable' });
    expect(__fs.has(MARKER)).toBe(false);
    expect(__fs.read(INDEX)).toBe('{ broken');
  });

  it('reports failed without a marker when the notes cannot be written, and a retry imports', async () => {
    putDreams(dream({ id: 'a', transcript: 'x' }), dream({ id: 'b', transcript: 'y' }));
    __fs.failWhen('move', (uri) => uri === INDEX + '.tmp');
    expect(await migrateLegacyDreams()).toEqual({ status: 'failed' });
    expect(__fs.has(MARKER)).toBe(false);

    __fs.clearFailures();
    const result = imported(await migrateLegacyDreams());
    // With no notes.json yet, a failed move leaves the complete temp file, which storage recovery
    // reads as the base: the notes are then already present and the retry only writes the marker.
    expect(result).toMatchObject({ markerWritten: true });
    expect(result.added + result.alreadyPresent).toBe(2);
    expect((await listNotes()).map((n) => n.id).sort()).toEqual(['a', 'b']);
  });
});

describe('legacy data is never modified', () => {
  const legacyUris = () =>
    __fs
      .list()
      .filter((u) => /dreams|journals/.test(u))
      .sort();
  const snapshot = () => legacyUris().map((u) => [u, __fs.read(u)]);

  const fixtures = () => {
    __fs.put(BACKUP, JSON.stringify([dream({ id: 'old' })]));
    __fs.put(JOURNALS, JSON.stringify({ version: 1, journals: [{ id: 'j_a', name: 'Work' }] }));
    __fs.put(DOC + 'dreams/a.m4a', 'audio');
  };

  it('leaves every legacy file identical after a normal run', async () => {
    fixtures();
    putDreams(
      dream({ id: 'a', transcript: 'x', journalId: 'j_a', audioFileName: 'a.m4a' }),
      dream({ id: 'b', transcript: 'y', audioFileName: '../x' }),
    );
    const before = snapshot();
    const urisBefore = new Set(__fs.list());
    imported(await migrateLegacyDreams());
    expect(snapshot()).toEqual(before);
    const added = __fs.list().filter((u) => !urisBefore.has(u));
    expect(added.every((u) => [INDEX, MARKER].includes(u))).toBe(true);
  });

  it('leaves them identical with skipped records and after a failing run', async () => {
    fixtures();
    putDreams(null, dream({ id: 'a/b' }), dream({ id: 'c', transcript: 'z' }));
    const before = snapshot();
    imported(await migrateLegacyDreams());
    expect(snapshot()).toEqual(before);

    __fs.reset();
    resetLegacyImportForTests();
    fixtures();
    putDreams(dream({ id: 'c', transcript: 'z' }));
    const failingBefore = snapshot();
    __fs.failWhen('move', () => true);
    expect(await migrateLegacyDreams()).toEqual({ status: 'failed' });
    expect(snapshot()).toEqual(failingBefore);
    const allowed = ['notes.json', 'notes.json.tmp', 'notes.json.bak', 'migrated.json'];
    expect(
      __fs
        .list()
        .filter((u) => !legacyUris().includes(u) && !allowed.includes(u.slice(DOC.length))),
    ).toEqual([]);
  });
});

describe('source audit', () => {
  it('has no way to delete, move, create or copy, and exactly one write', () => {
    const source = nodeFs.readFileSync(`${process.cwd()}/src/services/legacyImport.ts`, 'utf8');
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toMatch(
      /\.delete\(|\.move\(|\.create\(|\.copy\(|\.remove\(|\.rename\(|unlink|deleteAsync|rmdir|\.rm\(|Directory/,
    );
    expect(code.match(/\.write\(/g)).toHaveLength(1);
    expect(code).toMatch(/markerFile\(\)\.write\(/);
  });
});
