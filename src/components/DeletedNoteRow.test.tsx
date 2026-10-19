import { fireEvent, render, screen } from '@testing-library/react-native';
import { DeletedRowData } from '../utils/deletedRow';
import { DeletedNoteRow } from './DeletedNoteRow';

const ROW: DeletedRowData = {
  id: 'n1',
  title: 'Groceries',
  preview: 'milk eggs',
  deleted: 'Deleted 2 hours ago',
  hasAudio: false,
  a11yLabel: 'Groceries. milk eggs. Deleted 2 hours ago.',
};

describe('DeletedNoteRow', () => {
  it('shows title, preview and deleted line', async () => {
    await render(<DeletedNoteRow row={ROW} onRestore={jest.fn()} onDeleteForever={jest.fn()} />);
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('milk eggs')).toBeTruthy();
    expect(screen.getByText('Deleted 2 hours ago')).toBeTruthy();
  });

  it('has labelled Restore and Delete forever buttons that call back with the id', async () => {
    const onRestore = jest.fn();
    const onDeleteForever = jest.fn();
    await render(
      <DeletedNoteRow row={ROW} onRestore={onRestore} onDeleteForever={onDeleteForever} />,
    );
    await fireEvent.press(screen.getByLabelText('Restore Groceries'));
    await fireEvent.press(screen.getByLabelText('Delete Groceries forever'));
    expect(onRestore).toHaveBeenCalledWith('n1');
    expect(onDeleteForever).toHaveBeenCalledWith('n1');
  });

  it('disables both buttons while busy', async () => {
    const onRestore = jest.fn();
    const onDeleteForever = jest.fn();
    await render(
      <DeletedNoteRow row={ROW} busy onRestore={onRestore} onDeleteForever={onDeleteForever} />,
    );
    await fireEvent.press(screen.getByLabelText('Restore Groceries'));
    await fireEvent.press(screen.getByLabelText('Delete Groceries forever'));
    expect(onRestore).not.toHaveBeenCalled();
    expect(onDeleteForever).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Restore Groceries').props.accessibilityState.disabled).toBe(true);
  });

  it('leaves out empty preview and deleted lines', async () => {
    await render(
      <DeletedNoteRow
        row={{ ...ROW, preview: '', deleted: '' }}
        onRestore={jest.fn()}
        onDeleteForever={jest.fn()}
      />,
    );
    expect(screen.queryByText('milk eggs')).toBeNull();
    expect(screen.queryByText(/Deleted 2/)).toBeNull();
  });
});
