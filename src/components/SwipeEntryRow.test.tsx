import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { StyleSheet, ViewStyle } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { colors } from '../theme';
import { Dream } from '../types/dream';
import { journalCopy } from '../utils/journals';
import { SwipeEntryRow, useSingleOpenRow } from './SwipeEntryRow';

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

describe('SwipeEntryRow variants', () => {
  const dream: Dream = {
    id: 'd1',
    createdAt: '2026-10-04T06:22:00',
    durationMs: 1000,
    audioFileName: 'a.m4a',
    title: 'The endless hallway',
    transcript: 'Body text here.',
    tags: [],
  };
  const setup = async (variant?: 'card' | 'today') => {
    const onDelete = jest.fn();
    await render(
      <SwipeEntryRow
        dream={dream}
        copy={journalCopy('dream')}
        onOpenDream={jest.fn()}
        onOpenDraft={jest.fn()}
        onDelete={onDelete}
        onRowWillOpen={jest.fn()}
        onRowClosed={jest.fn()}
        deleting={false}
        swipeLocked={false}
        variant={variant}
      />,
    );
    return { onDelete };
  };

  it('defaults to the card variant', async () => {
    await setup();
    expect(screen.queryByText('Dream · 6:22 AM')).toBeNull();
    expect(screen.getByText('SUN')).toBeTruthy(); // the card's date column
    const del = screen.getByLabelText(journalCopy('dream').deleteRowLabel('The endless hallway'), {
      includeHiddenElements: true,
    });
    expect(StyleSheet.flatten(del.props.style).borderRadius).toBe(16);
  });

  it('renders the flat Today row, with no card radius, when variant is today', async () => {
    const { onDelete } = await setup('today');
    expect(screen.getByText('Body text here.')).toBeTruthy();
    expect(screen.getByText('Dream · 6:22 AM')).toBeTruthy();
    const del = screen.getByLabelText(journalCopy('dream').deleteRowLabel('The endless hallway'), {
      includeHiddenElements: true,
    });
    expect(StyleSheet.flatten(del.props.style).borderRadius).toBe(0);
    fireEvent.press(del);
    expect(onDelete).toHaveBeenCalledWith(dream, expect.any(Function));
  });

  it('gives the today variant an opaque container with no margin or radius', async () => {
    await setup('today');
    let node = screen.getByText('Body text here.').parent;
    let style: ViewStyle | undefined;
    while (node) {
      const flat = StyleSheet.flatten(node.props.style);
      if (flat?.backgroundColor === colors.background) {
        style = flat;
        break;
      }
      node = node.parent;
    }
    expect(style).toBeDefined();
    expect(style?.backgroundColor).toBe(colors.background);
    expect(style?.marginBottom ?? 0).toBe(0);
    expect(style?.borderRadius ?? 0).toBe(0);
  });
});
