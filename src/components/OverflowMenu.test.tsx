import { BackHandler } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { OverflowMenu } from './OverflowMenu';

let backHandler: (() => boolean | null | undefined) | null = null;
const remove = jest.fn();
let addSpy: jest.SpyInstance;

beforeEach(() => {
  backHandler = null;
  remove.mockClear();
  addSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandler = handler as typeof backHandler;
    return { remove };
  });
});
afterEach(() => addSpy.mockRestore());

const open = () => fireEvent.press(screen.getByLabelText('More options', { hidden: true }));

describe('OverflowMenu', () => {
  it('starts closed with a labeled, collapsed button', async () => {
    await render(<OverflowMenu onEdit={jest.fn()} onDelete={jest.fn()} />);
    const b = screen.getByRole('button', { name: 'More options' });
    expect(b.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.queryByLabelText('Close menu')).toBeNull();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('opens and toggles closed with the button', async () => {
    await render(<OverflowMenu onEdit={jest.fn()} onDelete={jest.fn()} />);
    await open();
    expect(
      screen.getByLabelText('More options', { hidden: true }).props.accessibilityState,
    ).toMatchObject({
      expanded: true,
    });
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    await open();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('closes from the backdrop without calling anything', async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    await render(<OverflowMenu onEdit={onEdit} onDelete={onDelete} />);
    await open();
    await fireEvent.press(screen.getByLabelText('Close menu'));
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('closes the menu, then calls onEdit', async () => {
    const onEdit = jest.fn();
    await render(<OverflowMenu onEdit={onEdit} onDelete={jest.fn()} />);
    await open();
    await fireEvent.press(screen.getByLabelText('Edit dream'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('closes the menu, then calls onDelete', async () => {
    const onDelete = jest.fn();
    await render(<OverflowMenu onEdit={jest.fn()} onDelete={onDelete} />);
    await open();
    await fireEvent.press(screen.getByLabelText('Delete dream'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('shows only Edit without onDelete', async () => {
    await render(<OverflowMenu onEdit={jest.fn()} />);
    await open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.queryByLabelText('Delete dream')).toBeNull();
  });

  it('gives items 44pt targets and a red Delete', async () => {
    await render(<OverflowMenu onEdit={jest.fn()} onDelete={jest.fn()} />);
    await open();
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item).toHaveStyle({ minHeight: 44 });
    }
    expect(screen.getByLabelText('More options', { hidden: true })).toHaveStyle({
      width: 44,
      height: 44,
    });
    expect(screen.getByText('Delete')).toHaveStyle({ color: '#F26D6D' });
  });

  it('registers Android back only while open; back closes the menu and is consumed', async () => {
    await render(<OverflowMenu onEdit={jest.fn()} onDelete={jest.fn()} />);
    expect(addSpy).not.toHaveBeenCalled();
    await open();
    expect(addSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    let handled: boolean | null | undefined;
    await act(async () => {
      handled = backHandler?.();
    });
    expect(handled).toBe(true);
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(remove).toHaveBeenCalled();
  });

  it('removes the back listener on unmount while open', async () => {
    const view = await render(<OverflowMenu onEdit={jest.fn()} onDelete={jest.fn()} />);
    await open();
    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('deleteDisabled disables only Delete: dimmed, not callable, Edit still works', async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    await render(<OverflowMenu onEdit={onEdit} onDelete={onDelete} deleteDisabled />);
    await open();
    expect(screen.getByLabelText('Delete dream').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByLabelText('Edit dream').props.accessibilityState).toMatchObject({
      disabled: false,
    });
    expect(screen.getByText('Delete')).toHaveStyle({ opacity: 0.4 });
    await fireEvent.press(screen.getByLabelText('Delete dream'));
    expect(onDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Edit dream'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('disables the button and items, and closes when disabled', async () => {
    const onEdit = jest.fn();
    const view = await render(<OverflowMenu onEdit={onEdit} onDelete={jest.fn()} />);
    await open();
    await view.rerender(<OverflowMenu onEdit={onEdit} onDelete={jest.fn()} disabled />);
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(
      screen.getByLabelText('More options', { hidden: true }).props.accessibilityState,
    ).toMatchObject({
      disabled: true,
      expanded: false,
    });
    await open();
    expect(screen.queryByRole('menuitem')).toBeNull();
    await view.rerender(<OverflowMenu onEdit={onEdit} onDelete={jest.fn()} />);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});

describe('OverflowMenu labels', () => {
  it('uses the given item labels', async () => {
    await render(
      <OverflowMenu
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        editLabel="Edit entry"
        deleteLabel="Delete entry"
      />,
    );
    await open();
    expect(screen.getByRole('menuitem', { name: 'Edit entry' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete entry' })).toBeTruthy();
  });
});
