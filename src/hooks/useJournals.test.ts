import { act, renderHook, waitFor } from '@testing-library/react-native';
import { addJournal, loadJournals, removeJournal, renameJournal } from '../services/journalStorage';
import { BUILT_IN_JOURNALS, Journal } from '../utils/journals';
import { useJournals } from './useJournals';

jest.mock('../services/journalStorage', () => ({
  loadJournals: jest.fn(),
  addJournal: jest.fn(),
  renameJournal: jest.fn(),
  removeJournal: jest.fn(),
}));

const mockLoad = loadJournals as jest.Mock;
const mockAdd = addJournal as jest.Mock;
const mockRename = renameJournal as jest.Mock;
const mockRemove = removeJournal as jest.Mock;

const jr = (id: string, name: string): Journal => ({ id, name, kind: 'journal' });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockLoad.mockReset().mockResolvedValue([]);
  mockAdd.mockReset();
  mockRename.mockReset();
  mockRemove.mockReset();
});

it('starts unloaded with only the built-in journals, then loads the stored ones after them', async () => {
  const read = deferred<Journal[]>();
  mockLoad.mockReturnValue(read.promise);
  const { result } = await renderHook(() => useJournals());
  expect(result.current.loaded).toBe(false);
  expect(result.current.journals).toEqual(BUILT_IN_JOURNALS);
  expect(result.current.custom).toEqual([]);
  await act(async () => read.resolve([jr('j_a', 'A'), jr('j_b', 'B')]));
  expect(result.current.loaded).toBe(true);
  expect(result.current.custom.map((x) => x.id)).toEqual(['j_a', 'j_b']);
  expect(result.current.journals.map((x) => x.id)).toEqual(['dreams', 'life', 'j_a', 'j_b']);
});

it('is loaded with no custom journals when the read rejects', async () => {
  mockLoad.mockRejectedValue(new Error('boom'));
  const { result } = await renderHook(() => useJournals());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.journals).toEqual(BUILT_IN_JOURNALS);
});

it('add updates state only after the write succeeds', async () => {
  const write = deferred<{ journal: Journal; journals: Journal[] }>();
  mockAdd.mockReturnValue(write.promise);
  const { result } = await renderHook(() => useJournals());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  let added: Promise<Journal> | undefined;
  await act(async () => {
    added = result.current.add('Gratitude');
  });
  expect(result.current.custom).toEqual([]);
  const g = jr('j_g', 'Gratitude');
  await act(async () => write.resolve({ journal: g, journals: [g] }));
  await expect(added).resolves.toEqual(g);
  expect(result.current.custom).toEqual([g]);
  expect(result.current.journals).toEqual([...BUILT_IN_JOURNALS, g]);
});

it('a failed add rejects and leaves state unchanged', async () => {
  mockLoad.mockResolvedValue([jr('j_a', 'A')]);
  mockAdd.mockRejectedValue(new Error('disk full'));
  const { result } = await renderHook(() => useJournals());
  await waitFor(() => expect(result.current.custom).toHaveLength(1));
  await act(async () => {
    await expect(result.current.add('B')).rejects.toThrow('disk full');
  });
  expect(result.current.custom).toEqual([jr('j_a', 'A')]);
});

it('rename and remove update state after the write', async () => {
  mockLoad.mockResolvedValue([jr('j_a', 'A'), jr('j_b', 'B')]);
  const { result } = await renderHook(() => useJournals());
  await waitFor(() => expect(result.current.custom).toHaveLength(2));
  mockRename.mockResolvedValue({
    journal: jr('j_a', 'Z'),
    journals: [jr('j_a', 'Z'), jr('j_b', 'B')],
  });
  await act(async () => {
    await result.current.rename('j_a', 'Z');
  });
  expect(mockRename).toHaveBeenCalledWith('j_a', 'Z');
  expect(result.current.custom.map((x) => x.name)).toEqual(['Z', 'B']);
  mockRemove.mockResolvedValue({ journals: [jr('j_b', 'B')] });
  await act(async () => {
    await result.current.remove('j_a');
  });
  expect(result.current.custom).toEqual([jr('j_b', 'B')]);
});

it('failed rename and remove leave state unchanged', async () => {
  mockLoad.mockResolvedValue([jr('j_a', 'A')]);
  mockRename.mockRejectedValue(new Error('x'));
  mockRemove.mockRejectedValue(new Error('y'));
  const { result } = await renderHook(() => useJournals());
  await waitFor(() => expect(result.current.custom).toHaveLength(1));
  await act(async () => {
    await expect(result.current.rename('j_a', 'Z')).rejects.toThrow('x');
    await expect(result.current.remove('j_a')).rejects.toThrow('y');
  });
  expect(result.current.custom).toEqual([jr('j_a', 'A')]);
});

it('a load that finishes after a change does not overwrite it', async () => {
  const read = deferred<Journal[]>();
  mockLoad.mockReturnValue(read.promise);
  const g = jr('j_g', 'G');
  mockAdd.mockResolvedValue({ journal: g, journals: [g] });
  const { result } = await renderHook(() => useJournals());
  await act(async () => {
    await result.current.add('G');
  });
  await act(async () => read.resolve([]));
  expect(result.current.custom).toEqual([g]);
  expect(result.current.loaded).toBe(true);
});

it('does not update state after unmount', async () => {
  const read = deferred<Journal[]>();
  const write = deferred<{ journal: Journal; journals: Journal[] }>();
  mockLoad.mockReturnValue(read.promise);
  mockAdd.mockReturnValue(write.promise);
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { result, unmount } = await renderHook(() => useJournals());
  let added: Promise<Journal> | undefined;
  await act(async () => {
    added = result.current.add('G');
  });
  unmount();
  const g = jr('j_g', 'G');
  read.resolve([jr('j_a', 'A')]);
  write.resolve({ journal: g, journals: [g] });
  await added;
  await new Promise((r) => setTimeout(r, 0));
  expect(errors).not.toHaveBeenCalled();
  expect(result.current.custom).toEqual([]);
  errors.mockRestore();
});
