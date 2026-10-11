import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { listDreams } from '../services/dreamStorage';
import { __fs } from '../test/fakeFileSystem';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS, Journal } from '../utils/journals';
import {
  entryHasContent,
  entryHasEdits,
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
      tags: [],
      tagDraft: '',
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
    s = entrySessionReducer(s, { type: 'setTags', value: ['a'] });
    s = entrySessionReducer(s, { type: 'setTagDraft', value: 'c' });
    s = entrySessionReducer(s, { type: 'markSaved', id: '9', createdAt: 'when' });
    expect(s).toMatchObject({
      title: 't',
      body: 'b',
      tags: ['a'],
      tagDraft: 'c',
      id: '9',
      createdAt: 'when',
    });
    expect(entrySessionReducer(s, { type: 'clear' })).toBeNull();
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
      body: 'old text',
      emotion: 'uneasy',
      tags: ['water'],
      audio: { durationMs: 12_000 },
      baseline: { title: 'Old title', body: 'old text', tags: ['water'] },
    });
  });

  it('builds a draft session without a baseline, tolerates missing tags and reads the journal via journalOf', () => {
    const s = entrySessionFromDream(
      { ...finished, status: 'draft', tags: undefined as never, journalId: 'life' },
      'draft',
    );
    expect(s.origin).toBe('draft');
    expect(s.baseline).toBeUndefined();
    expect(s.tags).toEqual([]);
    expect(s.journalId).toBe('life');
  });
});

describe('entryHasContent / entryHasEdits', () => {
  const base = entrySessionReducer(null, { type: 'startNew' })!;

  it('has content for a title, body, tag or pending tag, but not for blanks', () => {
    expect(entryHasContent(base)).toBe(false);
    expect(entryHasContent({ ...base, title: '  ', body: '\n' })).toBe(false);
    expect(entryHasContent({ ...base, title: 'a' })).toBe(true);
    expect(entryHasContent({ ...base, body: 'a' })).toBe(true);
    expect(entryHasContent({ ...base, tags: ['a'] })).toBe(true);
    expect(entryHasContent({ ...base, tagDraft: 'a' })).toBe(true);
  });

  it('detects edits against the baseline (trimmed text, ordered tags, pending tag)', () => {
    const s = entrySessionFromDream(finished, 'edit');
    expect(entryHasEdits(s)).toBe(false);
    expect(entryHasEdits({ ...s, title: ' Old title ' })).toBe(false);
    expect(entryHasEdits({ ...s, title: 'New' })).toBe(true);
    expect(entryHasEdits({ ...s, body: 'new' })).toBe(true);
    expect(entryHasEdits({ ...s, tags: [] })).toBe(true);
    expect(entryHasEdits({ ...s, tagDraft: 'x' })).toBe(true);
    // No baseline (a new entry or draft) is never an "edit".
    expect(entryHasEdits({ ...s, baseline: undefined, title: 'New' })).toBe(false);
  });
});

describe('useEntrySession save (real saveDream, fake file system)', () => {
  const open = async (journals = BUILT_IN_JOURNALS) => {
    const hook = await renderHook(() => useEntrySession(journals));
    return hook;
  };

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
      result.current.setTags(['water', 'hall']);
      result.current.setBody('new text');
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
      transcript: 'new text',
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
