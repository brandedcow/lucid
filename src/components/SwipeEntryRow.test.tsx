import { renderHook } from '@testing-library/react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { journalCopy } from '../utils/journals';
import { useSingleOpenRow } from './SwipeEntryRow';

const fakeRow = () => {
  const close = jest.fn();
  return { row: { close } as unknown as Swipeable, close };
};

describe('useSingleOpenRow', () => {
  it('closes the open row when another row opens', async () => {
    const { result } = await renderHook(() => useSingleOpenRow());
    const a = fakeRow();
    const b = fakeRow();
    result.current.onRowWillOpen(a.row);
    result.current.onRowWillOpen(b.row);
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).not.toHaveBeenCalled();
    result.current.closeOpenRow();
    expect(b.close).toHaveBeenCalledTimes(1);
  });

  it('does not close a row that opens again', async () => {
    const { result } = await renderHook(() => useSingleOpenRow());
    const a = fakeRow();
    result.current.onRowWillOpen(a.row);
    result.current.onRowWillOpen(a.row);
    expect(a.close).not.toHaveBeenCalled();
  });

  it('onRowClosed only clears the matching row', async () => {
    const { result } = await renderHook(() => useSingleOpenRow());
    const a = fakeRow();
    const b = fakeRow();
    result.current.onRowWillOpen(b.row);
    result.current.onRowClosed(a.row);
    result.current.closeOpenRow();
    expect(b.close).toHaveBeenCalledTimes(1);
    result.current.onRowClosed(b.row);
    result.current.closeOpenRow();
    expect(b.close).toHaveBeenCalledTimes(1);
  });

  it('closeOpenRow with no row open is a no-op', async () => {
    const { result } = await renderHook(() => useSingleOpenRow());
    expect(() => result.current.closeOpenRow()).not.toThrow();
  });
});

describe('journalCopy', () => {
  it('returns the same object for the same kind, so memoized rows keep their props', () => {
    expect(journalCopy('dream')).toBe(journalCopy('dream'));
    expect(journalCopy('journal')).toBe(journalCopy('journal'));
    expect(journalCopy('dream')).not.toBe(journalCopy('journal'));
  });
});
