import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { listDreams } from '../services/dreamStorage';
import { __fs } from '../test/fakeFileSystem';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS, Journal } from '../utils/journals';
import {
  entryHasContent,
  hasPendingAudioRemoval,
  visibleAudio,
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
      audio: { uri: AUDIO, durationMs: 12_000, persisted: true, removed: false },
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
      await act(async () => result.current.removeAudio());
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
      expect(result.current.session?.audio).toBeUndefined();
    });

    it('a restored recording is kept by the save', async () => {
      seedStored();
      const { result } = await open();
      const [dream] = await listDreams();
      await act(async () => result.current.openEntry(dream));
      await act(async () => result.current.removeAudio());
      await act(async () => result.current.restoreAudio());
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
      await act(async () => result.current.removeAudio());
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

describe('the voice attachment in session state', () => {
  const CACHE = 'file:///cache/r1.m4a';
  const CACHE2 = 'file:///cache/r2.m4a';
  const PEAKS = [0.1, 0.8, 0.4];
  const fresh = () => entrySessionReducer(null, { type: 'startNew' })!;
  const attach = (
    s: ReturnType<typeof fresh>,
    uri = CACHE,
    waveform: number[] | undefined = PEAKS,
  ) =>
    entrySessionReducer(s, {
      type: 'attachRecording',
      recording: { uri, durationMs: 5000, waveform },
    })!;

  it('attaches a new recording with its waveform; it counts as content', () => {
    const s = attach(fresh());
    expect(s.audio).toEqual({
      uri: CACHE,
      durationMs: 5000,
      waveform: PEAKS,
      persisted: false,
      removed: false,
    });
    expect(entryHasContent(s)).toBe(true);
    expect(entryHasContent(fresh())).toBe(false);
  });

  it('drops an invalid waveform but keeps the recording', () => {
    const s = attach(fresh(), CACHE, [3, 4]);
    expect(s.audio).toEqual({ uri: CACHE, durationMs: 5000, persisted: false, removed: false });
  });

  it('allows one recording: a second is ignored while the first is visible', () => {
    const s = attach(fresh());
    expect(attach(s, CACHE2)).toBe(s);
  });

  it('closing marks the recording removed without forgetting it, and restore brings it back', () => {
    const s = attach(fresh());
    const removed = entrySessionReducer(s, { type: 'removeAudio' })!;
    expect(removed.audio).toMatchObject({ uri: CACHE, removed: true });
    expect(visibleAudio(removed)).toBeUndefined();
    expect(entryHasContent(removed)).toBe(false);
    const restored = entrySessionReducer(removed, { type: 'restoreAudio' })!;
    expect(restored.audio).toEqual(s.audio);
  });

  it('a new recording after a close shelves the closed one for later deletion', () => {
    const removed = entrySessionReducer(attach(fresh()), { type: 'removeAudio' })!;
    const again = attach(removed, CACHE2);
    expect(again.audio?.uri).toBe(CACHE2);
    expect(again.shelved).toEqual([expect.objectContaining({ uri: CACHE, removed: true })]);
  });

  it('closing a stored recording only marks it; restore brings it back; it counts as an edit', () => {
    const edit = entrySessionFromDream(finished, 'edit');
    expect(hasPendingAudioRemoval(edit)).toBe(false);
    const removed = entrySessionReducer(edit, { type: 'removeAudio' })!;
    expect(removed.audio).toMatchObject({ persisted: true, removed: true });
    expect(visibleAudio(removed)).toBeUndefined();
    expect(hasPendingAudioRemoval(removed)).toBe(true);
    expect(entryHasEdits(removed)).toBe(true);
    const restored = entrySessionReducer(removed, { type: 'restoreAudio' })!;
    expect(restored).toEqual(edit);
    expect(entryHasEdits(restored)).toBe(false);
  });

  it('a stored recording closed and replaced by a new one still has a pending removal', () => {
    const edit = entrySessionFromDream(finished, 'edit');
    const removed = entrySessionReducer(edit, { type: 'removeAudio' })!;
    const again = attach(removed, CACHE2);
    expect(hasPendingAudioRemoval(again)).toBe(true);
    expect(again.shelved).toEqual([expect.objectContaining({ persisted: true, removed: true })]);
  });

  it('refuses a second recording on an entry that already has a stored one', () => {
    const edit = entrySessionFromDream(finished, 'edit');
    expect(attach(edit)).toBe(edit);
  });

  it('an edit with a new recording has edits; a closed one does not', () => {
    const edit = entrySessionFromDream({ ...finished, audioFileName: undefined }, 'edit');
    expect(entryHasEdits(edit)).toBe(false);
    const withAudio = attach(edit);
    expect(entryHasEdits(withAudio)).toBe(true);
    expect(entryHasEdits(entrySessionReducer(withAudio, { type: 'removeAudio' })!)).toBe(false);
  });

  it('loads a stored recording with its waveform, dropping an invalid one', () => {
    expect(entrySessionFromDream({ ...finished, waveform: PEAKS }, 'edit').audio?.waveform).toEqual(
      PEAKS,
    );
    expect(entrySessionFromDream({ ...finished, waveform: [9] }, 'edit').audio).not.toHaveProperty(
      'waveform',
    );
    expect(
      entrySessionFromDream({ ...finished, audioFileName: undefined }, 'edit').audio,
    ).toBeUndefined();
  });
});

describe('saving and leaving with a voice attachment', () => {
  const open = async () => renderHook(() => useEntrySession(BUILT_IN_JOURNALS));
  const CACHE = 'file:///cache/r1.m4a';
  const CACHE2 = 'file:///cache/r2.m4a';
  const PEAKS = [0.1, 0.8, 0.4];
  const entries = () => JSON.parse(__fs.read(INDEX) ?? '[]') as Dream[];

  beforeEach(() => {
    __fs.put(CACHE, 'bytes-1');
    __fs.put(CACHE2, 'bytes-2');
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
    expect(__fs.read(`file:///document/dreams/${entry.audioFileName}`)).toBe('bytes-1');
    expect(__fs.has(CACHE)).toBe(false);
    expect(result.current.session?.audio).toMatchObject({ persisted: true, removed: false });
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
    await act(async () => result.current.removeAudio());
    expect(__fs.has(CACHE)).toBe(true);
    await act(async () => result.current.restoreAudio());
    await act(async () => result.current.removeAudio());
    expect(__fs.has(CACHE)).toBe(true);
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    expect(__fs.has(CACHE)).toBe(false);
    const [entry] = entries();
    expect(entry.audioFileName).toBeUndefined();
    expect(entry).toMatchObject({ durationMs: 0 });
    expect(entry).not.toHaveProperty('waveform');
    expect(result.current.session?.audio).toBeUndefined();
  });

  it('keeps the cache file of a closed recording when the save fails', async () => {
    __fs.put(INDEX, '{not json');
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setTitle('x');
      result.current.attachRecording({ uri: CACHE, durationMs: 5000 });
    });
    await act(async () => result.current.removeAudio());
    await act(async () => {
      expect(await result.current.save('saved')).toBe(false);
    });
    expect(__fs.has(CACHE)).toBe(true);
    expect(result.current.session?.audio).toMatchObject({ removed: true });
  });

  it('saves the new recording and deletes the closed one it replaced', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.setTitle('x');
      result.current.attachRecording({ uri: CACHE, durationMs: 1000 });
    });
    await act(async () => result.current.removeAudio());
    await act(async () => result.current.attachRecording({ uri: CACHE2, durationMs: 2000 }));
    expect(__fs.has(CACHE)).toBe(true);
    await act(async () => {
      expect(await result.current.save('saved')).toBe(true);
    });
    expect(__fs.has(CACHE)).toBe(false);
    expect(__fs.has(CACHE2)).toBe(false);
    const [entry] = entries();
    expect(entry.durationMs).toBe(2000);
    expect(__fs.read(`file:///document/dreams/${entry.audioFileName}`)).toBe('bytes-2');
  });

  it('clear (leaving with Discard) deletes the cache files of unsaved recordings, closed or not', async () => {
    const { result } = await open();
    await act(async () => {
      result.current.startNew();
      result.current.attachRecording({ uri: CACHE, durationMs: 1000 });
    });
    await act(async () => result.current.removeAudio());
    await act(async () => result.current.attachRecording({ uri: CACHE2, durationMs: 2000 }));
    await act(async () => result.current.clear());
    expect(__fs.has(CACHE)).toBe(false);
    expect(__fs.has(CACHE2)).toBe(false);
    expect(result.current.session).toBeNull();
    expect(entries()).toEqual([]);
  });

  it('clear never deletes a stored recording', async () => {
    __fs.put(INDEX, JSON.stringify([finished]));
    __fs.put(AUDIO, 'audio-bytes');
    const { result } = await open();
    await act(async () => result.current.openEntry(finished));
    await act(async () => result.current.removeAudio());
    await act(async () => result.current.clear());
    expect(__fs.read(AUDIO)).toBe('audio-bytes');
    expect(entries()[0].audioFileName).toBe('7.m4a');
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
