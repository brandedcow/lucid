import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { listDreams } from '../services/dreamStorage';
import { __fs } from '../test/fakeFileSystem';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS, Journal } from '../utils/journals';
import {
  entryHasContent,
  hasPendingAudioRemoval,
  pendingRemovals,
  visibleRecordings,
  entryHasEdits,
  entryJournalLocked,
  entrySessionFromDream,
  entrySessionReducer,
  useEntrySession,
} from './useEntrySession';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const INDEX = 'file:///document/dreams.json';
const AUDIO = 'file:///document/dreams/7.m4a';
const custom: Journal = { id: 'j_g1', name: 'Gratitude', kind: 'journal' };

beforeEach(() => {
  __fs.reset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const finished: Dream & { futureField: unknown } = {
  id: '7',
  createdAt: '2026-10-01T08:00:00.000Z',
  durationMs: 12_000,
  audioFileName: '7.m4a',
  title: 'Old title',
  emotion: 'uneasy',
  tags: ['water'],
  transcript: 'old text',
  futureField: { keep: true },
};

describe('entrySessionReducer', () => {
  it('starts a new entry in Dreams by default, or in the given journal, with an optional body', () => {
    expect(entrySessionReducer(null, { type: 'startNew' })).toEqual({
      origin: 'new',
      journalId: 'dreams',
      recordings: [],
      title: '',
      body: '',
      emotion: '',
    });
    expect(
      entrySessionReducer(null, { type: 'startNew', journalId: 'life', body: 'so far' }),
    ).toMatchObject({ journalId: 'life', body: 'so far' });
  });

  it('ignores field changes when nothing is open', () => {
    expect(entrySessionReducer(null, { type: 'setTitle', value: 'x' })).toBeNull();
  });

  it('sets fields and marks a first save so a second save updates', () => {
    let s = entrySessionReducer(null, { type: 'startNew' });
    s = entrySessionReducer(s, { type: 'setTitle', value: 't' });
    s = entrySessionReducer(s, { type: 'setBody', value: 'b' });
    s = entrySessionReducer(s, { type: 'markSaved', id: '9', createdAt: 'when' });
    expect(s).toMatchObject({
      title: 't',
      body: 'b',
      id: '9',
      createdAt: 'when',
    });
    expect(entrySessionReducer(s, { type: 'clear' })).toBeNull();
  });
});

describe('entrySessionReducer setJournal', () => {
  it('changes the journal of a new entry and keeps what was typed', () => {
    let s = entrySessionReducer(null, { type: 'startNew' });
    s = entrySessionReducer(s, { type: 'setTitle', value: 't' });
    s = entrySessionReducer(s, { type: 'setBody', value: 'b' });
    s = entrySessionReducer(s, { type: 'setJournal', journalId: 'life' });
    expect(s).toMatchObject({ journalId: 'life', title: 't', body: 'b' });
    expect(entryJournalLocked(s!)).toBe(false);
  });

  it('ignores a change once a save created the entry', () => {
    let s = entrySessionReducer(null, { type: 'startNew' });
    s = entrySessionReducer(s, { type: 'markSaved', id: '9', createdAt: 'c' });
    expect(entryJournalLocked(s!)).toBe(true);
    expect(entrySessionReducer(s, { type: 'setJournal', journalId: 'life' })?.journalId).toBe(
      'dreams',
    );
  });

  it('is locked for a reopened draft and a reopened finished entry', () => {
    for (const origin of ['draft', 'edit'] as const) {
      const s = entrySessionFromDream(finished, origin);
      expect(entryJournalLocked(s)).toBe(true);
      expect(entrySessionReducer(s, { type: 'setJournal', journalId: 'life' })).toBe(s);
    }
  });

  it('does nothing when no entry is open', () => {
    expect(entrySessionReducer(null, { type: 'setJournal', journalId: 'life' })).toBeNull();
  });
});

describe('entrySessionFromDream', () => {
  it('builds an edit session with a baseline, the stored emotion and the audio duration', () => {
    const s = entrySessionFromDream(finished, 'edit');
    expect(s).toMatchObject({
      origin: 'edit',
      journalId: 'dreams',
      id: '7',
      title: 'Old title',
      body: 'old text\n#water',
      materializedFrom: 'old text',
      emotion: 'uneasy',
      recordings: [
        {
          id: 'stored:7.m4a',
          uri: AUDIO,
          fileName: '7.m4a',
          durationMs: 12_000,
          persisted: true,
          removed: false,
        },
      ],
      baseline: { title: 'Old title', body: 'old text\n#water' },
    });
  });

  it('builds a draft session without a baseline, tolerates missing tags and reads the journal via journalOf', () => {
    const s = entrySessionFromDream(
      { ...finished, status: 'draft', tags: undefined as never, journalId: 'life' },
      'draft',
    );
    expect(s.origin).toBe('draft');
    expect(s.baseline).toBeUndefined();
    expect(s.body).toBe('old text');
    expect(s.materializedFrom).toBeUndefined();
    expect(s.journalId).toBe('life');
  });

  it('adds stored tags missing from the body as a trailing #tag line, and only those', () => {
    const s = entrySessionFromDream(
      { ...finished, tags: ['water', 'Bad Dream', 'v1.2', '2024'], transcript: 'saw #water' },
      'edit',
    );
    expect(s.body).toBe('saw #water\n#bad-dream #v1-2');
    expect(s.materializedFrom).toBe('saw #water');
    expect(s.baseline?.body).toBe(s.body);
    expect(entryHasEdits(s)).toBe(false);
  });

  it('adds nothing when the body already holds every tag', () => {
    const s = entrySessionFromDream({ ...finished, transcript: 'a #water' }, 'edit');
    expect(s.body).toBe('a #water');
    expect(s.materializedFrom).toBeUndefined();
  });

  it('materializes into a reopened draft too (no baseline)', () => {
    const s = entrySessionFromDream({ ...finished, status: 'draft' }, 'draft');
    expect(s.body).toBe('old text\n#water');
    expect(s.materializedFrom).toBe('old text');
    expect(s.baseline).toBeUndefined();
  });
});

describe('entryHasContent / entryHasEdits', () => {
  const base = entrySessionReducer(null, { type: 'startNew' })!;

  it('has content for a title or body (tags are body text), but not for blanks', () => {
    expect(entryHasContent(base)).toBe(false);
    expect(entryHasContent({ ...base, title: '  ', body: '\n' })).toBe(false);
    expect(entryHasContent({ ...base, title: 'a' })).toBe(true);
    expect(entryHasContent({ ...base, body: 'a' })).toBe(true);
    expect(entryHasContent({ ...base, body: '#a' })).toBe(true);
  });

  it('detects edits against the baseline (trimmed text; tags are body text)', () => {
    const s = entrySessionFromDream(finished, 'edit');
    expect(entryHasEdits(s)).toBe(false);
    expect(entryHasEdits({ ...s, title: ' Old title ' })).toBe(false);
    expect(entryHasEdits({ ...s, title: 'New' })).toBe(true);
    expect(entryHasEdits({ ...s, body: 'new' })).toBe(true);
    expect(entryHasEdits({ ...s, body: 'old text' })).toBe(true);
    // No baseline (a new entry or draft) is never an "edit".
    expect(entryHasEdits({ ...s, baseline: undefined, title: 'New' })).toBe(false);
  });
});

describe('useEntrySession save (real saveDream, fake file system)', () => {
  const open = async (journals = BUILT_IN_JOURNALS) => {
    const hook = await renderHook(() => useEntrySession(journals));
    return hook;
  };

  describe('removing a stored recording', () => {
    const seedStored = (extra: Partial<Dream> = {}) => {
      __fs.put(INDEX, JSON.stringify([{ ...finished, ...extra }]));
      __fs.put(AUDIO, 'old-audio');
    };

    it.each([
      ['an edit saved as Done', 'edit', 'saved'],
      ['a reopened draft saved as a draft', 'draft', 'draft'],
      ['a reopened draft finished', 'draft', 'saved'],
    ] as const)('%s deletes the file and keeps the entry', async (_label, origin, status) => {
      seedStored(origin === 'draft' ? { status: 'draft' } : {});
      const { result } = await open();
      const [dream] = await listDreams();
      await act(async () =>
        origin === 'edit' ? result.current.openEntry(dream) : result.current.openDraft(dream),
      );
      await act(async () => result.current.removeRecording('stored:7.m4a'));
      let ok = false;
      await act(async () => {
        ok = await result.current.save(status);
      });
      expect(ok).toBe(true);
      const [saved] = await listDreams();
      expect(saved).not.toHaveProperty('audioFileName');
      expect(saved).toMatchObject({
        title: 'Old title',
        transcript: 'old text\n#water',
        emotion: 'uneasy',
      });
      expect(__fs.has(AUDIO)).toBe(false);
      expect(result.current.session?.recordings).toEqual([]);
    });

    it('a restored recording is kept by the save', async () => {
      seedStored();
      const { result } = await open();
      const [dream] = await listDreams();
      await act(async () => result.current.openEntry(dream));
      await act(async () => result.current.removeRecording('stored:7.m4a'));
      await act(async () => result.current.restoreRecording('stored:7.m4a'));
      await act(async () => result.current.setBody('changed'));
      await act(async () => void (await result.current.save('saved')));
      expect((await listDreams())[0].audioFileName).toBe('7.m4a');
      expect(__fs.has(AUDIO)).toBe(true);
    });

    it('clearing the session (leaving) deletes nothing', async () => {
      seedStored();
      const { result } = await open();
      const [dream] = await listDreams();
      await act(async () => result.current.openEntry(dream));
      await act(async () => result.current.removeRecording('stored:7.m4a'));
      await act(async () => result.current.clear());
      expect(__fs.has(AUDIO)).toBe(true);
      expect((await listDreams())[0].audioFileName).toBe('7.m4a');
    });
  });

  it('creates a finished entry in the chosen journal with the body as the transcript', async () => {
    const { result } = await open([...BUILT_IN_JOURNALS, custom]);
    await act(async () => {
      result.current.startNew('j_g1');
      result.current.setBody('thankful');
    });
    let ok = false;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(true);
    const [entry] = await listDreams();
    expect(entry).toMatchObject({
      journalId: 'j_g1',
      transcript: 'thankful',
      title: '',
      durationMs: 0,
    });
    expect(entry.status).toBeUndefined();
    expect(result.current.session?.id).toBe(entry.id);
  });

  it('saves a new entry in the journal picked after typing, with the rules of that kind', async () => {
    const { result } = await open([...BUILT_IN_JOURNALS, custom]);
    await act(async () => {
      result.current.startNew('dreams');
      result.current.setBody('thankful');
    });
    // Dreams needs a title: nothing is written.
    let ok = true;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(false);
    await act(async () => result.current.setJournal('j_g1'));
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(true);
    const [entry] = await listDreams();
    expect(entry).toMatchObject({ journalId: 'j_g1', transcript: 'thankful' });
    // After the first save the journal is locked.
    await act(async () => result.current.setJournal('life'));
    expect(result.current.session?.journalId).toBe('j_g1');
  });

  it('refuses a finished Dreams entry with no title, writing nothing', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setBody('words');
    });
    let ok = true;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(false);
    expect(await listDreams()).toEqual([]);
  });

  it('saves a draft without a title, and a second save updates the same entry', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setBody('half');
    });
    await act(async () => {
      expect(await result.current.save('draft')).toBe(true);
    });
    await act(async () => result.current.setTitle('Done now'));
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    const all = await listDreams();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ title: 'Done now', transcript: 'half' });
    expect(all[0].status).toBeUndefined();
  });

  it('never creates an empty draft', async () => {
    const { result } = await open();
    await act(async () => result.current.startNew());
    let ok = true;
    await act(async () => {
      ok = await result.current.save('draft');
    });
    expect(ok).toBe(false);
    expect(await listDreams()).toEqual([]);
  });

  it('an edit keeps id, createdAt, audio, duration, emotion and unknown fields, and deletes no audio', async () => {
    __fs.put(INDEX, JSON.stringify([finished]));
    __fs.put(AUDIO, 'audio-bytes');
    const { result } = await open();
    await act(async () => result.current.openEntry(finished));
    await act(async () => {
      result.current.setTitle('New title');
      result.current.setBody('new text #water #Hall #water');
    });
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    const [entry] = (await listDreams()) as (Dream & { futureField?: unknown })[];
    expect(entry).toMatchObject({
      id: '7',
      createdAt: finished.createdAt,
      audioFileName: '7.m4a',
      durationMs: 12_000,
      title: 'New title',
      emotion: 'uneasy',
      tags: ['water', 'hall'],
      transcript: 'new text #water #Hall #water',
      futureField: { keep: true },
    });
    expect(entry.status).toBeUndefined();
    expect(__fs.read(AUDIO)).toBe('audio-bytes');
  });

  it('never saves an edit as a draft', async () => {
    __fs.put(INDEX, JSON.stringify([finished]));
    const { result } = await open();
    await act(async () => result.current.openEntry(finished));
    await act(async () => result.current.setTitle('New title'));
    let ok = true;
    await act(async () => {
      ok = await result.current.save('draft');
    });
    expect(ok).toBe(false);
    expect((await listDreams())[0].title).toBe('Old title');
  });

  it('keeps a reopened draft a draft when saved as one, with its audio', async () => {
    const draft = { ...finished, status: 'draft' as const };
    __fs.put(INDEX, JSON.stringify([draft]));
    __fs.put(AUDIO, 'audio-bytes');
    const { result } = await open();
    await act(async () => result.current.openDraft(draft));
    await act(async () => result.current.setBody('more'));
    await act(async () => {
      expect(await result.current.save('draft')).toBe(true);
    });
    const [entry] = await listDreams();
    expect(entry).toMatchObject({ status: 'draft', audioFileName: '7.m4a', transcript: 'more' });
    expect(__fs.read(AUDIO)).toBe('audio-bytes');
  });

  it('alerts and keeps the session when the save fails', async () => {
    __fs.put(INDEX, JSON.stringify([finished]));
    const { result } = await open();
    await act(async () => result.current.openEntry({ ...finished, id: 'missing' }));
    await act(async () => result.current.setTitle('x'));
    let ok = true;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.');
    expect(result.current.session?.title).toBe('x');
    expect(result.current.saving).toBe(false);
  });

  it('shows the specific Alert and keeps the session when the index is unreadable', async () => {
    __fs.put(INDEX, '{not json');
    const { result } = await open();
    await act(async () => result.current.startNew());
    await act(async () => result.current.setTitle('x'));
    let ok = true;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not save your dream',
      'Your saved dreams could not be read, so this dream was not saved. Your recording is still here.',
    );
    expect(result.current.session?.title).toBe('x');
    expect(__fs.read(INDEX)).toBe('{not json');
  });

  it('ignores a second save while one is in flight', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setTitle('t');
    });
    let results: boolean[] = [];
    await act(async () => {
      results = await Promise.all([result.current.save('saved'), result.current.save('saved')]);
    });
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await listDreams()).toHaveLength(1);
  });
});

describe('the voice recordings in session state', () => {
  const CACHE = 'file:///cache/r1.m4a';
  const CACHE2 = 'file:///cache/r2.m4a';
  const CACHE3 = 'file:///cache/r3.m4a';
  const PEAKS = [0.1, 0.8, 0.4];
  const fresh = () => entrySessionReducer(null, { type: 'startNew' })!;
  const attach = (
    s: ReturnType<typeof fresh>,
    id: string,
    uri = CACHE,
    waveform: number[] | undefined = PEAKS,
  ) =>
    entrySessionReducer(s, {
      type: 'attachRecording',
      id,
      recording: { uri, durationMs: 5000, waveform },
    })!;
  const close = (s: ReturnType<typeof fresh>, id: string) =>
    entrySessionReducer(s, { type: 'removeRecording', id })!;
  const reopen = (s: ReturnType<typeof fresh>, id: string) =>
    entrySessionReducer(s, { type: 'restoreRecording', id })!;
  const stored3: Dream = {
    ...finished,
    audioFileName: undefined,
    recordings: [
      { fileName: '7.m4a', durationMs: 1000, waveform: PEAKS },
      { fileName: '7-1.m4a', durationMs: 2000 },
      { fileName: '7-2.m4a', durationMs: 3000 },
    ],
  };

  it('attaches a new recording with its waveform; it counts as content', () => {
    const s = attach(fresh(), 'a');
    expect(s.recordings).toEqual([
      { id: 'a', uri: CACHE, durationMs: 5000, waveform: PEAKS, persisted: false, removed: false },
    ]);
    expect(entryHasContent(s)).toBe(true);
    expect(entryHasContent(fresh())).toBe(false);
  });

  it('drops an invalid waveform but keeps the recording', () => {
    const s = attach(fresh(), 'a', CACHE, [3, 4]);
    expect(s.recordings).toEqual([
      { id: 'a', uri: CACHE, durationMs: 5000, persisted: false, removed: false },
    ]);
  });

  it('appends a 2nd and 3rd recording; none replaces another and there is no cap', () => {
    let s = attach(fresh(), 'a', CACHE);
    s = attach(s, 'b', CACHE2);
    s = attach(s, 'c', CACHE3);
    expect(s.recordings.map((r) => [r.id, r.uri])).toEqual([
      ['a', CACHE],
      ['b', CACHE2],
      ['c', CACHE3],
    ]);
    expect(visibleRecordings(s)).toHaveLength(3);
  });

  it('appends after the stored recordings of an edit', () => {
    const edit = entrySessionFromDream(stored3, 'edit');
    const s = attach(edit, 'a');
    expect(s.recordings.map((r) => r.id)).toEqual([
      'stored:7.m4a',
      'stored:7-1.m4a',
      'stored:7-2.m4a',
      'a',
    ]);
  });

  it('closing marks one recording removed without forgetting it; restore brings it back', () => {
    const s = attach(attach(fresh(), 'a', CACHE), 'b', CACHE2);
    const closed = close(s, 'a');
    expect(closed.recordings[0]).toMatchObject({ uri: CACHE, removed: true });
    expect(closed.recordings[1]).toMatchObject({ uri: CACHE2, removed: false });
    expect(visibleRecordings(closed).map((r) => r.id)).toEqual(['b']);
    expect(entryHasContent(closed)).toBe(true);
    expect(entryHasContent(close(closed, 'b'))).toBe(false);
    expect(reopen(closed, 'a')).toEqual(s);
  });

  it('closing or restoring an unknown or already-in-that-state recording changes nothing', () => {
    const s = attach(fresh(), 'a');
    expect(close(s, 'nope')).toBe(s);
    expect(reopen(s, 'a')).toBe(s);
  });

  it('a recording added after a close keeps the closed one (nothing forgotten)', () => {
    const closed = close(attach(fresh(), 'a', CACHE), 'a');
    const again = attach(closed, 'b', CACHE2);
    expect(again.recordings).toEqual([
      expect.objectContaining({ id: 'a', uri: CACHE, removed: true }),
      expect.objectContaining({ id: 'b', uri: CACHE2, removed: false }),
    ]);
  });

  it('closing a stored recording only marks it; restore brings it back; it counts as an edit', () => {
    const edit = entrySessionFromDream(finished, 'edit');
    expect(hasPendingAudioRemoval(edit)).toBe(false);
    const removed = close(edit, 'stored:7.m4a');
    expect(removed.recordings[0]).toMatchObject({ persisted: true, removed: true });
    expect(visibleRecordings(removed)).toEqual([]);
    expect(hasPendingAudioRemoval(removed)).toBe(true);
    expect(pendingRemovals(removed)).toEqual(['7.m4a']);
    expect(entryHasEdits(removed)).toBe(true);
    const restored = reopen(removed, 'stored:7.m4a');
    expect(restored).toEqual(edit);
    expect(entryHasEdits(restored)).toBe(false);
  });

  it('an edit with a new recording has edits; a closed new one does not', () => {
    const edit = entrySessionFromDream({ ...finished, audioFileName: undefined }, 'edit');
    expect(entryHasEdits(edit)).toBe(false);
    const withAudio = attach(edit, 'a');
    expect(entryHasEdits(withAudio)).toBe(true);
    expect(entryHasEdits(close(withAudio, 'a'))).toBe(false);
  });

  it('loads every stored recording of an entry (3 stored load as 3), with waveforms', () => {
    const s = entrySessionFromDream(stored3, 'edit');
    expect(s.recordings).toEqual([
      {
        id: 'stored:7.m4a',
        uri: 'file:///document/dreams/7.m4a',
        fileName: '7.m4a',
        durationMs: 1000,
        waveform: PEAKS,
        persisted: true,
        removed: false,
      },
      {
        id: 'stored:7-1.m4a',
        uri: 'file:///document/dreams/7-1.m4a',
        fileName: '7-1.m4a',
        durationMs: 2000,
        persisted: true,
        removed: false,
      },
      {
        id: 'stored:7-2.m4a',
        uri: 'file:///document/dreams/7-2.m4a',
        fileName: '7-2.m4a',
        durationMs: 3000,
        persisted: true,
        removed: false,
      },
    ]);
  });

  it('loads a legacy single recording with its waveform, dropping an invalid one', () => {
    const one = entrySessionFromDream({ ...finished, waveform: PEAKS }, 'edit').recordings;
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ fileName: '7.m4a', durationMs: 12_000, waveform: PEAKS });
    expect(
      entrySessionFromDream({ ...finished, waveform: [9] }, 'edit').recordings[0],
    ).not.toHaveProperty('waveform');
    expect(
      entrySessionFromDream({ ...finished, audioFileName: undefined }, 'edit').recordings,
    ).toEqual([]);
  });
});

describe('saving and leaving with several recordings', () => {
  const open = async () => renderHook(() => useEntrySession(BUILT_IN_JOURNALS));
  const CACHE = 'file:///cache/r1.m4a';
  const CACHE2 = 'file:///cache/r2.m4a';
  const CACHE3 = 'file:///cache/r3.m4a';
  const PEAKS = [0.1, 0.8, 0.4];
  const entries = () => JSON.parse(__fs.read(INDEX) ?? '[]') as Dream[];
  const stored = (name: string) => `file:///document/dreams/${name}`;
  const ids = (r: { current: ReturnType<typeof useEntrySession> }) =>
    (r.current.session?.recordings ?? []).map((x) => x.id);
  const three: Dream = {
    ...finished,
    audioFileName: undefined,
    recordings: [
      { fileName: '7.m4a', durationMs: 1000 },
      { fileName: '7-1.m4a', durationMs: 2000 },
      { fileName: '7-2.m4a', durationMs: 3000 },
    ],
  };
  const seedThree = () => {
    __fs.put(INDEX, JSON.stringify([three]));
    __fs.put(stored('7.m4a'), 'a0');
    __fs.put(stored('7-1.m4a'), 'a1');
    __fs.put(stored('7-2.m4a'), 'a2');
  };

  beforeEach(() => {
    __fs.put(CACHE, 'bytes-1');
    __fs.put(CACHE2, 'bytes-2');
    __fs.put(CACHE3, 'bytes-3');
  });

  it('saves a new recording with its duration and waveform, and moves the cache file', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setTitle('Voice');
      result.current.attachRecording({ uri: CACHE, durationMs: 5000, waveform: PEAKS });
    });
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    const [entry] = entries();
    expect(entry).toMatchObject({ durationMs: 5000, waveform: PEAKS });
    expect(__fs.read(stored(entry.audioFileName!))).toBe('bytes-1');
    expect(__fs.has(CACHE)).toBe(false);
    expect(result.current.session?.recordings).toEqual([
      expect.objectContaining({
        persisted: true,
        removed: false,
        fileName: entry.audioFileName,
        uri: stored(entry.audioFileName!),
      }),
    ]);
  });

  it('saves 3 new recordings in order and the session then holds 3 stored ones', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setTitle('Three');
      result.current.attachRecording({ uri: CACHE, durationMs: 1000 });
      result.current.attachRecording({ uri: CACHE2, durationMs: 2000 });
      result.current.attachRecording({ uri: CACHE3, durationMs: 3000 });
    });
    const before = ids(result);
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    const [entry] = entries();
    expect(entry.recordings?.map((r) => r.durationMs)).toEqual([1000, 2000, 3000]);
    expect(entry.recordings?.map((r) => __fs.read(stored(r.fileName)))).toEqual([
      'bytes-1',
      'bytes-2',
      'bytes-3',
    ]);
    expect(ids(result)).toEqual(before);
    expect(result.current.session?.recordings.every((r) => r.persisted)).toBe(true);
    expect(result.current.session?.recordings.map((r) => r.fileName)).toEqual(
      entry.recordings?.map((r) => r.fileName),
    );
  });

  it('saves a draft with the recording', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.attachRecording({ uri: CACHE, durationMs: 5000 });
    });
    await act(async () => {
      expect(await result.current.save('draft')).toBe(true);
    });
    expect(entries()[0]).toMatchObject({ status: 'draft', durationMs: 5000 });
    expect(entries()[0].audioFileName).toBeDefined();
  });

  it('closing keeps the cache file; saving a closed recording deletes only that cache file', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setTitle('Text only');
      result.current.attachRecording({ uri: CACHE, durationMs: 5000, waveform: PEAKS });
    });
    const [id] = ids(result);
    await act(async () => result.current.removeRecording(id));
    expect(__fs.has(CACHE)).toBe(true);
    await act(async () => result.current.restoreRecording(id));
    await act(async () => result.current.removeRecording(id));
    expect(__fs.has(CACHE)).toBe(true);
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    expect(__fs.has(CACHE)).toBe(false);
    const [entry] = entries();
    expect(entry.audioFileName).toBeUndefined();
    expect(entry).toMatchObject({ durationMs: 0 });
    expect(entry).not.toHaveProperty('waveform');
    expect(result.current.session?.recordings).toEqual([]);
  });

  it('no cache file is deleted before a successful save: a failed save keeps all of them', async () => {
    __fs.put(INDEX, '{not json');
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setTitle('x');
      result.current.attachRecording({ uri: CACHE, durationMs: 5000 });
      result.current.attachRecording({ uri: CACHE2, durationMs: 5000 });
    });
    await act(async () => result.current.removeRecording(ids(result)[0]));
    await act(async () => {
      expect(await result.current.save('saved')).toBe(false);
    });
    expect(__fs.has(CACHE)).toBe(true);
    expect(__fs.has(CACHE2)).toBe(true);
    expect(result.current.session?.recordings.map((r) => r.removed)).toEqual([true, false]);
  });

  it('closing (without saving) deletes no cache file at all', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.attachRecording({ uri: CACHE, durationMs: 1000 });
      result.current.attachRecording({ uri: CACHE2, durationMs: 2000 });
    });
    await act(async () => result.current.removeRecording(ids(result)[0]));
    expect(__fs.has(CACHE)).toBe(true);
    expect(__fs.has(CACHE2)).toBe(true);
  });

  it('saves the open recordings and deletes the closed one only after the save', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setTitle('x');
      result.current.attachRecording({ uri: CACHE, durationMs: 1000 });
    });
    await act(async () => result.current.removeRecording(ids(result)[0]));
    await act(async () => result.current.attachRecording({ uri: CACHE2, durationMs: 2000 }));
    expect(__fs.has(CACHE)).toBe(true);
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    expect(__fs.has(CACHE)).toBe(false);
    expect(__fs.has(CACHE2)).toBe(false);
    const [entry] = entries();
    expect(entry.durationMs).toBe(2000);
    expect(entry.recordings).toHaveLength(1);
    expect(__fs.read(stored(entry.audioFileName!))).toBe('bytes-2');
    expect(result.current.session?.recordings).toHaveLength(1);
  });

  it('clear (leaving with Discard) deletes every unsaved cache file, closed or not', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.attachRecording({ uri: CACHE, durationMs: 1000 });
      result.current.attachRecording({ uri: CACHE2, durationMs: 2000 });
      result.current.attachRecording({ uri: CACHE3, durationMs: 3000 });
    });
    await act(async () => result.current.removeRecording(ids(result)[0]));
    await act(async () => result.current.clear());
    expect(__fs.has(CACHE)).toBe(false);
    expect(__fs.has(CACHE2)).toBe(false);
    expect(__fs.has(CACHE3)).toBe(false);
    expect(result.current.session).toBeNull();
    expect(entries()).toEqual([]);
  });

  it('clear never deletes a stored recording, closed or not', async () => {
    seedThree();
    const { result } = await open();
    await act(async () => result.current.openEntry(three));
    await act(async () => result.current.removeRecording('stored:7-1.m4a'));
    await act(async () => result.current.attachRecording({ uri: CACHE, durationMs: 1 }));
    await act(async () => result.current.clear());
    expect(__fs.read(stored('7.m4a'))).toBe('a0');
    expect(__fs.read(stored('7-1.m4a'))).toBe('a1');
    expect(__fs.read(stored('7-2.m4a'))).toBe('a2');
    expect(__fs.has(CACHE)).toBe(false);
    expect(entries()[0].recordings).toHaveLength(3);
  });

  it('an edit of an entry with 3 stored recordings loads 3', async () => {
    seedThree();
    const { result } = await open();
    await act(async () => result.current.openEntry(three));
    expect(result.current.session?.recordings.map((r) => r.fileName)).toEqual([
      '7.m4a',
      '7-1.m4a',
      '7-2.m4a',
    ]);
  });

  it('removing one of 3 stored recordings removes only that file (removeRecordings with just its name)', async () => {
    seedThree();
    const { result } = await open();
    await act(async () => result.current.openEntry(three));
    await act(async () => result.current.removeRecording('stored:7-1.m4a'));
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    expect(entries()[0].recordings?.map((r) => r.fileName)).toEqual(['7.m4a', '7-2.m4a']);
    expect(__fs.has(stored('7.m4a'))).toBe(true);
    expect(__fs.has(stored('7-1.m4a'))).toBe(false);
    expect(__fs.has(stored('7-2.m4a'))).toBe(true);
    expect(result.current.session?.recordings.map((r) => r.fileName)).toEqual(['7.m4a', '7-2.m4a']);
  });

  it('passes exactly the closed stored name to saveDream', async () => {
    seedThree();
    const storage = jest.requireActual('../services/dreamStorage');
    const spy = jest.spyOn(storage, 'saveDream');
    const { result } = await open();
    await act(async () => result.current.openEntry(three));
    await act(async () => result.current.removeRecording('stored:7-1.m4a'));
    await act(async () => void (await result.current.save('saved')));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ removeRecordings: ['7-1.m4a'] });
    expect(spy.mock.calls[0][0]).not.toHaveProperty('removeAudio');
    expect(spy.mock.calls[0][0]).not.toHaveProperty('addRecordings');
  });

  it('saves a mix: one stored closed, one stored kept, one new kept, one new closed', async () => {
    seedThree();
    const { result } = await open();
    await act(async () => result.current.openEntry(three));
    await act(async () => {
      result.current.attachRecording({ uri: CACHE, durationMs: 4000 });
      result.current.attachRecording({ uri: CACHE2, durationMs: 5000 });
    });
    await act(async () => {
      result.current.removeRecording('stored:7.m4a');
      result.current.removeRecording(ids(result)[4]);
    });
    // Nothing is deleted before the save.
    expect(__fs.has(stored('7.m4a'))).toBe(true);
    expect(__fs.has(CACHE)).toBe(true);
    expect(__fs.has(CACHE2)).toBe(true);
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    const [entry] = entries();
    expect(entry.recordings?.map((r) => r.durationMs)).toEqual([2000, 3000, 4000]);
    expect(__fs.has(stored('7.m4a'))).toBe(false);
    expect(__fs.read(stored('7-1.m4a'))).toBe('a1');
    expect(__fs.read(stored('7-2.m4a'))).toBe('a2');
    expect(__fs.has(CACHE)).toBe(false);
    expect(__fs.has(CACHE2)).toBe(false);
    const rows = result.current.session?.recordings ?? [];
    expect(rows.map((r) => r.fileName)).toEqual(entry.recordings?.map((r) => r.fileName));
    expect(rows.every((r) => r.persisted && !r.removed)).toBe(true);
    expect(rows.map((r) => r.durationMs)).toEqual([2000, 3000, 4000]);
  });

  it('adds a recording to a reopened text-only entry on edit, full details and emotion kept', async () => {
    const textOnly = { ...finished, audioFileName: undefined, durationMs: 0, waveform: undefined };
    __fs.put(INDEX, JSON.stringify([textOnly]));
    const { result } = await open();
    await act(async () => result.current.openEntry(textOnly));
    await act(async () =>
      result.current.attachRecording({ uri: CACHE, durationMs: 3000, waveform: PEAKS }),
    );
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    expect(entries()[0]).toMatchObject({
      id: '7',
      durationMs: 3000,
      waveform: PEAKS,
      emotion: 'uneasy',
      title: 'Old title',
      transcript: 'old text\n#water',
    });
    expect(entries()[0].status).toBeUndefined();
  });

  it('a reopened draft with audio saves without recopying and keeps its waveform', async () => {
    const draft = { ...finished, status: 'draft' as const, waveform: PEAKS };
    __fs.put(INDEX, JSON.stringify([draft]));
    __fs.put(AUDIO, 'audio-bytes');
    const { result } = await open();
    await act(async () => result.current.openDraft(draft));
    await act(async () => result.current.setBody('more'));
    await act(async () => {
      expect(await result.current.save('draft')).toBe(true);
    });
    expect(entries()[0]).toMatchObject({
      audioFileName: '7.m4a',
      waveform: PEAKS,
      durationMs: 12_000,
    });
    expect(__fs.read(AUDIO)).toBe('audio-bytes');
  });
});
