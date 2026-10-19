import { fireEvent, render, screen } from '@testing-library/react-native';
import { NoteRowData } from '../utils/noteRow';
import { NoteRow } from './NoteRow';

const row = (over: Partial<NoteRowData> = {}): NoteRowData => ({
  id: 'n1',
  title: 'Flying',
  preview: 'Over the sea',
  tags: ['sea'],
  tagLine: '#sea',
  voiceCount: 0,
  pinned: false,
  time: '2 hours ago',
  a11yLabel: 'Flying. Over the sea. Tags: sea. 2 hours ago.',
  ...over,
});

describe('NoteRow', () => {
  it('shows title, preview, tags and time', async () => {
    await render(<NoteRow row={row()} onOpen={jest.fn()} />);
    expect(screen.getByText('Flying')).toBeTruthy();
    expect(screen.getByText('Over the sea')).toBeTruthy();
    expect(screen.getByText('#sea')).toBeTruthy();
    expect(screen.getByText('2 hours ago')).toBeTruthy();
  });

  it('keeps the title to one line and the preview to two', async () => {
    await render(<NoteRow row={row()} onOpen={jest.fn()} />);
    expect(screen.getByText('Flying').props.numberOfLines).toBe(1);
    expect(screen.getByText('Over the sea').props.numberOfLines).toBe(2);
  });

  it('opens the note by id on press', async () => {
    const onOpen = jest.fn();
    await render(<NoteRow row={row({ id: 'abc' })} onOpen={onOpen} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('abc');
  });

  it('is a button with the row label', async () => {
    await render(<NoteRow row={row()} onOpen={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Flying. Over the sea. Tags: sea. 2 hours ago.' }),
    ).toBeTruthy();
  });

  it('shows the pin only when pinned, hidden from screen readers', async () => {
    const { rerender } = await render(<NoteRow row={row()} onOpen={jest.fn()} />);
    expect(screen.queryByTestId('note-row-pin', { includeHiddenElements: true })).toBeNull();
    await rerender(<NoteRow row={row({ pinned: true })} onOpen={jest.fn()} />);
    expect(screen.getByTestId('note-row-pin', { includeHiddenElements: true })).toBeTruthy();
  });

  it('leaves out the preview and tags when empty', async () => {
    await render(<NoteRow row={row({ preview: '', tagLine: '', tags: [] })} onOpen={jest.fn()} />);
    expect(screen.queryByText('Over the sea')).toBeNull();
    expect(screen.queryByText('#sea')).toBeNull();
  });
});

describe('NoteRow accessibility actions', () => {
  it('has none by default', async () => {
    await render(<NoteRow row={row()} onOpen={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityActions).toBeUndefined();
  });

  it('passes the actions and handler to the row button', async () => {
    const onAction = jest.fn();
    await render(
      <NoteRow
        row={row()}
        onOpen={jest.fn()}
        accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
        onAccessibilityAction={onAction}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);
    await fireEvent(btn, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
