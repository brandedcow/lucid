import { act, renderHook } from '@testing-library/react-native';
import { listDreams } from '../services/dreamStorage';
import { __fs } from '../test/fakeFileSystem';
import { useDreamSession } from './useDreamSession';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

beforeEach(() => __fs.reset());

describe('a Life entry through the hook (real saveDream, fake file system)', () => {
  it('saves a finished, untitled entry stamped with the life journal', async () => {
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.startWriting('Went for a walk', 'life'));
    let ok = false;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(true);
    const [entry] = await listDreams();
    expect(entry).toMatchObject({ journalId: 'life', title: '', transcript: 'Went for a walk' });
    expect(entry.status).toBeUndefined();
  });

  it('a Dreams session is stamped dreams and needs its title', async () => {
    const { result } = await renderHook(() => useDreamSession());
    await act(async () => result.current.startWriting('A dream'));
    let ok = true;
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(false);
    await act(async () => result.current.setTitle('Flying'));
    await act(async () => {
      ok = await result.current.save('saved');
    });
    expect(ok).toBe(true);
    expect((await listDreams())[0]).toMatchObject({ journalId: 'dreams', title: 'Flying' });
  });
});
