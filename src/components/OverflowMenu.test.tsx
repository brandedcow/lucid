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
    await render(<OverflowMenu onDelete={jest.fn()} />);
    const b = screen.getByRole('button', { name: 'More options' });
    expect(b.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.queryByLabelText('Close menu')).toBeNull();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('opens and toggles closed with the button', async () => {
    await render(<OverflowMenu onDelete={jest.fn()} />);
    await open();
    expect(
      screen.getByLabelText('More options', { hidden: true }).props.accessibilityState,
    ).toMatchObject({
      expanded: true,
    });
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.getByText('Delete')).toBeTruthy();
    await open();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('closes from the backdrop without calling anything', async () => {
    const onDelete = jest.fn();
    await render(<OverflowMenu onDelete={onDelete} />);
    await open();
    await fireEvent.press(screen.getByLabelText('Close menu'));
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('closes the menu, then calls onDelete', async () => {
    const onDelete = jest.fn();
    await render(<OverflowMenu onDelete={onDelete} />);
    await open();
    await fireEvent.press(screen.getByLabelText('Delete dream'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('shows no items without onDelete', async () => {
    await render(<OverflowMenu />);
    await open();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('gives items 44pt targets and a red Delete', async () => {
    await render(<OverflowMenu onDelete={jest.fn()} />);
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
    await render(<OverflowMenu onDelete={jest.fn()} />);
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
    const view = await render(<OverflowMenu onDelete={jest.fn()} />);
    await open();
    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('deleteDisabled disables Delete: dimmed and not callable', async () => {
    const onDelete = jest.fn();
    await render(<OverflowMenu onDelete={onDelete} deleteDisabled />);
    await open();
    expect(screen.getByLabelText('Delete dream').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByText('Delete')).toHaveStyle({ opacity: 0.4 });
    await fireEvent.press(screen.getByLabelText('Delete dream'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('disables the button and items, and closes when disabled', async () => {
    const view = await render(<OverflowMenu onDelete={jest.fn()} />);
    await open();
    await view.rerender(<OverflowMenu onDelete={jest.fn()} disabled />);
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(
      screen.getByLabelText('More options', { hidden: true }).props.accessibilityState,
    ).toMatchObject({
      disabled: true,
      expanded: false,
    });
    await open();
    expect(screen.queryByRole('menuitem')).toBeNull();
    await view.rerender(<OverflowMenu onDelete={jest.fn()} />);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});

describe('OverflowMenu labels', () => {
  it('uses the given item labels', async () => {
    await render(<OverflowMenu onDelete={jest.fn()} deleteLabel="Delete entry" />);
    await open();
    expect(screen.getByRole('menuitem', { name: 'Delete entry' })).toBeTruthy();
  });

  it('uses its own visible text for Delete', async () => {
    const onDelete = jest.fn();
    await render(
      <OverflowMenu onDelete={onDelete} deleteLabel="Delete entry" deleteText="Delete entry" />,
    );
    await open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.getByText('Delete entry')).toHaveStyle({ color: '#F26D6D' });
    await fireEvent.press(screen.getByLabelText('Delete entry'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('moves the button and its card with top and right', async () => {
    await render(<OverflowMenu onDelete={jest.fn()} top={14} right={68} />);
    expect(screen.getByLabelText('More options', { hidden: true })).toHaveStyle({
      top: 14,
      right: 68,
    });
    await open();
    expect(screen.getByTestId('overflow-menu-card')).toHaveStyle({ top: 58, right: 68 });
  });
});
