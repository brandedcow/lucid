import { act, renderHook } from '@testing-library/react-native';
import { useLogView } from './useLogView';

describe('useLogView', () => {
  it('starts empty', async () => {
    const { result } = await renderHook(() => useLogView());
    expect(result.current.tags).toEqual([]);
    expect(result.current.query).toBe('');
    expect(result.current.searching).toBe(false);
    expect(result.current.offsetRef.current).toBe(0);
  });

  it('toggles tags on and off, keeping several selected', async () => {
    const { result } = await renderHook(() => useLogView());
    await act(async () => result.current.toggleTag('water'));
    await act(async () => result.current.toggleTag('stairs'));
    expect(result.current.tags).toEqual(['water', 'stairs']);
    await act(async () => result.current.toggleTag('water'));
    expect(result.current.tags).toEqual(['stairs']);
  });

  it('resets the offset when tags or query change', async () => {
    const { result } = await renderHook(() => useLogView());
    result.current.offsetRef.current = 300;
    await act(async () => result.current.toggleTag('water'));
    expect(result.current.offsetRef.current).toBe(0);
    result.current.offsetRef.current = 300;
    await act(async () => result.current.setQuery('hall'));
    expect(result.current.query).toBe('hall');
    expect(result.current.offsetRef.current).toBe(0);
  });

  it('keeps the same offsetRef object across renders', async () => {
    const { result } = await renderHook(() => useLogView());
    const ref = result.current.offsetRef;
    await act(async () => result.current.setQuery('x'));
    expect(result.current.offsetRef).toBe(ref);
  });

  it('opens search, and closing it clears the query but keeps the tags', async () => {
    const { result } = await renderHook(() => useLogView());
    await act(async () => result.current.toggleTag('water'));
    await act(async () => result.current.openSearch());
    await act(async () => result.current.setQuery('train'));
    expect(result.current.searching).toBe(true);
    await act(async () => result.current.closeSearch());
    expect(result.current.searching).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.tags).toEqual(['water']);
  });

  it('clearFilters clears tags and query and closes search', async () => {
    const { result } = await renderHook(() => useLogView());
    await act(async () => result.current.toggleTag('water'));
    await act(async () => result.current.openSearch());
    await act(async () => result.current.setQuery('train'));
    result.current.offsetRef.current = 50;
    await act(async () => result.current.clearFilters());
    expect(result.current.tags).toEqual([]);
    expect(result.current.query).toBe('');
    expect(result.current.searching).toBe(false);
    expect(result.current.offsetRef.current).toBe(0);
  });
});
