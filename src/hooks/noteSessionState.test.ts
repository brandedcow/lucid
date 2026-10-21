import { Note } from '../services/notesStorage';
import {
  NoteSession,
  isSessionEmpty,
  newSession,
  noteSessionReducer,
  sessionFromNote,
} from './noteSessionState';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const reduce = (s: NoteSession | null, ...actions: Parameters<typeof noteSessionReducer>[1][]) =>
  actions.reduce(noteSessionReducer, s);
const A = { uri: 'file:///cache/a.m4a', durationMs: 1000 };

describe('sessionFromNote', () => {
  const note: Note = {
    id: '5',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    body: 'hello',
    pinned: true,
    recordings: [
      { fileName: '5.m4a', durationMs: 10, voiceTranscript: 'hi', waveform: [0.5] },
      { fileName: '5-1.m4a', durationMs: 20, heldAt: '2026-10-02T00:00:00.000Z' },
      { fileName: 'old.m4a', durationMs: 30, origin: 'legacy' },
    ],
  };

  it('keeps visible recordings only, persisted, with stored baselines and the right URIs', () => {
    const s = sessionFromNote(note);
    expect(s).toMatchObject({
      id: '5',
      stored: true,
      createdAt: note.createdAt,
      pinned: true,
      body: 'hello',
      saveState: 'idle',
    });
    expect(s.recordings).toHaveLength(2);
    expect(s.recordings[0]).toMatchObject({
      uri: 'file:///document/notes/5.m4a',
      fileName: '5.m4a',
      persisted: true,
      removed: false,
      voiceTranscript: 'hi',
      baseVoiceTranscript: 'hi',
      waveform: [0.5],
    });
    expect(s.recordings[1].uri).toBe('file:///document/dreams/old.m4a');
    expect(s.recordings[1].baseVoiceTranscript).toBeUndefined();
    expect(new Set(s.recordings.map((r) => r.id)).size).toBe(2);
  });

  it('copes with a note without recordings and not pinned', () => {
    const s = sessionFromNote({ ...note, recordings: undefined, pinned: undefined });
    expect(s.recordings).toEqual([]);
    expect(s.pinned).toBe(false);
  });
});

describe('noteSessionReducer', () => {
  it('ignores everything but open while there is no session', () => {
    expect(noteSessionReducer(null, { type: 'setBody', text: 'x' })).toBeNull();
    expect(noteSessionReducer(null, { type: 'open', session: newSession('1') })).toEqual(
      newSession('1'),
    );
  });

  it('clear drops the session', () => {
    expect(reduce(newSession('1'), { type: 'clear' })).toBeNull();
  });

  it('setBody marks dirty and returns the same state for equal text', () => {
    const s = newSession('1', 'a');
    expect(reduce(s, { type: 'setBody', text: 'a' })).toBe(s);
    expect(reduce(s, { type: 'setBody', text: 'ab' })).toMatchObject({
      body: 'ab',
      saveState: 'dirty',
    });
  });

  it('attach adds an unpersisted recording; waveform is sanitised', () => {
    const s = reduce(newSession('1'), {
      type: 'attach',
      id: 'r1',
      recording: { ...A, waveform: [2, 'x'] as unknown as number[], voiceTranscript: 't' },
    })!;
    expect(s.recordings).toEqual([
      {
        id: 'r1',
        uri: A.uri,
        persisted: false,
        removed: false,
        durationMs: 1000,
        voiceTranscript: 't',
      },
    ]);
  });

  it('close and restore flip removed; unknown ids change nothing', () => {
    const s = reduce(newSession('1'), { type: 'attach', id: 'r1', recording: A })!;
    expect(reduce(s, { type: 'close', id: 'r1' })!.recordings[0].removed).toBe(true);
    expect(
      reduce(s, { type: 'close', id: 'r1' }, { type: 'restore', id: 'r1' })!.recordings[0].removed,
    ).toBe(false);
    expect(reduce(s, { type: 'close', id: 'zzz' })).toBe(s);
  });

  it('markPersisted sets file, uri and the sent baseline, keeping removed', () => {
    const s = reduce(
      newSession('1'),
      { type: 'attach', id: 'r1', recording: { ...A, voiceTranscript: 'later' } },
      { type: 'close', id: 'r1' },
      {
        type: 'markPersisted',
        id: 'r1',
        fileName: '1.m4a',
        uri: 'file:///document/notes/1.m4a',
        voiceTranscript: 'sent',
      },
    )!;
    expect(s.recordings[0]).toMatchObject({
      persisted: true,
      removed: true,
      fileName: '1.m4a',
      uri: 'file:///document/notes/1.m4a',
      voiceTranscript: 'later',
      baseVoiceTranscript: 'sent',
    });
  });

  it('setRecordingText sets the transcript and marks dirty', () => {
    const s = reduce(
      newSession('1'),
      { type: 'attach', id: 'r1', recording: A },
      { type: 'setRecordingText', id: 'r1', text: 'words' },
    )!;
    expect(s.recordings[0].voiceTranscript).toBe('words');
    expect(s.saveState).toBe('dirty');
  });

  it('saved marks stored with createdAt; saveState and setPinned set their fields', () => {
    const note = { id: '1', createdAt: 'C', updatedAt: 'C', body: 'x' } as Note;
    const s = reduce(
      newSession('1'),
      { type: 'saved', note },
      { type: 'setPinned', pinned: true },
      { type: 'saveState', state: 'error', error: { code: 'X', cause: 1 } },
    )!;
    expect(s).toMatchObject({
      stored: true,
      createdAt: 'C',
      pinned: true,
      saveState: 'error',
      error: { code: 'X', cause: 1 },
    });
    expect(reduce(s, { type: 'saveState', state: 'idle' })!.error).toBeUndefined();
  });
});

describe('isSessionEmpty', () => {
  const rec = (persisted: boolean, removed: boolean) => ({
    id: 'r',
    uri: 'u',
    persisted,
    removed,
    durationMs: 1,
  });
  const base = newSession('1');
  it.each([
    ['blank body, no recordings', '', [], true],
    ['whitespace body', ' \n ', [], true],
    ['text', 'a', [], false],
    ['blank, new open recording', '', [rec(false, false)], false],
    ['blank, new closed recording', '', [rec(false, true)], true],
    ['blank, persisted open recording', '', [rec(true, false)], false],
    ['blank, persisted closed recording', '', [rec(true, true)], false],
    ['blank, closed new + open new', '', [rec(false, true), rec(false, false)], false],
  ] as const)('%s', (_name, body, recordings, expected) => {
    expect(isSessionEmpty({ ...base, body, recordings: [...recordings] })).toBe(expected);
  });
});
