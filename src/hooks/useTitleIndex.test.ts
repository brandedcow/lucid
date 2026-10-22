import { renderHook } from '@testing-library/react-native';
import type { Note } from '../services/notesStorage';
import * as noteLinks from '../utils/noteLinks';
import { noteLinkState, useTitleIndex } from './useTitleIndex';

jest.mock('../utils/noteLinks', () => {
  const actual = jest.requireActual('../utils/noteLinks');
  return { ...actual, buildTitleIndex: jest.fn(actual.buildTitleIndex) };
});

const note = (id: string, body: string): Note => ({
  id,
  body,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
});
const notes = [note('a', 'Alpha\ntext'), note('b', 'Beta')];

beforeEach(() => jest.mocked(noteLinks.buildTitleIndex).mockClear());

describe('useTitleIndex', () => {
  it('is null when not enabled and builds nothing', async () => {
    const view = await renderHook(() => useTitleIndex(notes, { id: 'a', body: 'Alpha' }, false));
    expect(view.result.current).toBeNull();
    expect(noteLinks.buildTitleIndex).not.toHaveBeenCalled();
  });

  it('builds the index with the open note overriding its stored body', async () => {
    const view = await renderHook(() => useTitleIndex(notes, { id: 'a', body: 'Renamed' }, true));
    expect(view.result.current?.byKey.has(noteLinks.titleKey('Renamed'))).toBe(true);
    expect(view.result.current?.byKey.has(noteLinks.titleKey('Alpha'))).toBe(false);
    expect(noteLinks.buildTitleIndex).toHaveBeenCalledWith(notes, { id: 'a', body: 'Renamed' });
  });

  it('does not rebuild when only the body below the Title changes', async () => {
    const view = await renderHook(
      (p: { body: string }) => useTitleIndex(notes, { id: 'a', body: p.body }, true),
      { initialProps: { body: 'Alpha\none' } },
    );
    const first = view.result.current;
    await view.rerender({ body: 'Alpha\none two three' });
    expect(view.result.current).toBe(first);
    expect(noteLinks.buildTitleIndex).toHaveBeenCalledTimes(1);
    await view.rerender({ body: 'Gamma\none' });
    expect(view.result.current).not.toBe(first);
    expect(noteLinks.buildTitleIndex).toHaveBeenCalledTimes(2);
  });

  it('rebuilds when the notes list or enabled changes', async () => {
    const view = await renderHook(
      (p: { list: Note[]; on: boolean }) => useTitleIndex(p.list, { id: 'a', body: 'Alpha' }, p.on),
      { initialProps: { list: notes, on: true } },
    );
    await view.rerender({ list: [...notes, note('c', 'Gamma')], on: true });
    expect(noteLinks.buildTitleIndex).toHaveBeenCalledTimes(2);
    await view.rerender({ list: [...notes, note('c', 'Gamma')], on: false });
    expect(view.result.current).toBeNull();
  });
});

describe('noteLinkState', () => {
  const index = noteLinks.buildTitleIndex(notes, { id: 'a', body: 'Alpha' });
  it('maps resolutions', () => {
    expect(noteLinkState(index, 'Beta', 'a')).toBe('exists');
    expect(noteLinkState(index, 'Alpha', 'a')).toBe('exists'); // self-link
    expect(noteLinkState(index, 'Nope', 'a')).toBe('missing');
    expect(noteLinkState(index, '#tag', 'a')).toBe('invalid');
    expect(noteLinkState(index, '   ', 'a')).toBe('invalid');
  });
  it('gives invalid for a null index', () => {
    expect(noteLinkState(null, 'Beta', 'a')).toBe('invalid');
  });
});
