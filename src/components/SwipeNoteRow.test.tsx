import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import { NoteRowData } from '../utils/noteRow';
import { SwipeNoteRow } from './SwipeNoteRow';

const row = (over: Partial<NoteRowData> = {}): NoteRowData => ({
  id: 'n1',
  title: 'Flying',
  preview: 'Over the sea',
  tags: [],
  tagLine: '',
  voiceCount: 0,
  pinned: false,
  time: '2 hours ago',
  a11yLabel: 'Flying. Over the sea. 2 hours ago.',
  ...over,
});

async function setup(rowOver: Partial<NoteRowData> = {}, disabled = false) {
  const p = {
    onOpen: jest.fn(),
    onPin: jest.fn(),
    onDelete: jest.fn(),
    onRowWillOpen: jest.fn(),
    onRowClosed: jest.fn(),
  };
  await render(<SwipeNoteRow row={row(rowOver)} disabled={disabled} {...p} />);
  return p;
}
const hidden = { includeHiddenElements: true };

describe('SwipeNoteRow', () => {
  it('renders the row and opens the note on press', async () => {
    const p = await setup();
    expect(screen.getByText('Flying')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Flying. Over the sea. 2 hours ago.', hidden));
    expect(p.onOpen).toHaveBeenCalledWith('n1');
  });

  it('offers Pin and Delete actions with labels', async () => {
    await setup();
    expect(screen.getByLabelText('Pin note', hidden)).toBeTruthy();
    expect(screen.getByLabelText('Delete note', hidden)).toBeTruthy();
    expect(screen.getByText('Pin', hidden)).toBeTruthy();
    expect(screen.getByText('Delete', hidden)).toBeTruthy();
  });

  it('pins an unpinned note and unpins a pinned one', async () => {
    const a = await setup();
    await fireEvent.press(screen.getByLabelText('Pin note', hidden));
    expect(a.onPin).toHaveBeenCalledWith('n1', true);
  });

  it('labels the action Unpin for a pinned note and unpins it', async () => {
    const p = await setup({ pinned: true });
    expect(screen.queryByLabelText('Pin note', hidden)).toBeNull();
    expect(screen.getByText('Unpin', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Unpin note', hidden));
    expect(p.onPin).toHaveBeenCalledWith('n1', false);
  });

  it('deletes by id with no confirmation', async () => {
    const p = await setup();
    await fireEvent.press(screen.getByLabelText('Delete note', hidden));
    expect(p.onDelete).toHaveBeenCalledWith('n1');
    expect(p.onPin).not.toHaveBeenCalled();
  });

  it('styles Delete as destructive and Pin as accent, square-cornered', async () => {
    await setup();
    const del = StyleSheet.flatten(screen.getByLabelText('Delete note', hidden).props.style);
    const pin = StyleSheet.flatten(screen.getByLabelText('Pin note', hidden).props.style);
    expect(del.backgroundColor).toBe(colors.draft);
    expect(pin.backgroundColor).toBe(colors.accent);
    expect(del.borderRadius).toBe(0);
  });
});
