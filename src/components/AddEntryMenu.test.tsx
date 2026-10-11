import { BackHandler, Text } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AddEntryMenu, FAB_SIZE } from './AddEntryMenu';
import { BUILT_IN_JOURNALS, journalCopy } from '../utils/journals';

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

const fab = () => screen.getByLabelText('Add entry', { hidden: true });
const open = () => fireEvent.press(fab());
const renderMenu = (props: Partial<React.ComponentProps<typeof AddEntryMenu>> = {}) =>
  render(<AddEntryMenu journals={BUILT_IN_JOURNALS} onPick={jest.fn()} {...props} />);

describe('AddEntryMenu', () => {
  it('starts closed with a labeled, collapsed button; tap opens', async () => {
    await renderMenu();
    expect(
      screen.getByRole('button', { name: 'Add entry' }).props.accessibilityState,
    ).toMatchObject({ expanded: false });
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(addSpy).not.toHaveBeenCalled();
    await open();
    expect(fab().props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(screen.getByLabelText('Close menu'));
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('the button toggles the menu (as it can under a screen reader)', async () => {
    await renderMenu();
    await open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    await open();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('the outer layer lets touches beside the button through', async () => {
    await renderMenu();
    expect(fab().parent).toHaveProp('pointerEvents', 'box-none');
  });

  it('lists journals in order with their sub-lines', async () => {
    await renderMenu();
    await open();
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    BUILT_IN_JOURNALS.forEach((j, i) => {
      const hint = journalCopy(j.kind).newButton;
      expect(items[i].props.accessibilityLabel).toBe(`${j.name}, ${hint}`);
      expect(items[i]).toHaveStyle({ minHeight: 44 });
    });
    expect(screen.getByText('Dreams')).toBeTruthy();
    expect(screen.getByText(journalCopy('journal').newButton)).toBeTruthy();
    expect(within(items[0]).getByText(journalCopy('dream').newButton)).toBeTruthy();
  });

  it('picking closes the menu and calls onPick once with the id', async () => {
    const onPick = jest.fn();
    await renderMenu({ onPick });
    await open();
    await fireEvent.press(screen.getAllByRole('menuitem')[1]);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(BUILT_IN_JOURNALS[1].id);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('closes from the backdrop without calling onPick', async () => {
    const onPick = jest.fn();
    await renderMenu({ onPick });
    await open();
    await fireEvent.press(screen.getByLabelText('Close menu'));
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('registers Android back only while open; back closes and is consumed', async () => {
    await renderMenu();
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
    const view = await renderMenu();
    await open();
    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('disabled closes the menu for good and a disabled button does not open', async () => {
    const props = { journals: BUILT_IN_JOURNALS, onPick: jest.fn() };
    const view = await render(<AddEntryMenu {...props} />);
    await open();
    await view.rerender(<AddEntryMenu {...props} disabled />);
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(fab().props.accessibilityState).toMatchObject({ disabled: true, expanded: false });
    await open();
    expect(screen.queryByRole('menuitem')).toBeNull();
    await view.rerender(<AddEntryMenu {...props} />);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('renders custom journals and a footer', async () => {
    await renderMenu({
      journals: [{ id: 'x', name: 'Gratitude', kind: 'journal' }],
      footer: <Text>New journal</Text>,
    });
    await open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(screen.getByText('Gratitude')).toBeTruthy();
    expect(screen.getByText('New journal')).toBeTruthy();
  });

  it('is a modal layer when open', async () => {
    await renderMenu();
    await open();
    expect(screen.getByLabelText('Close menu').parent?.props.accessibilityViewIsModal).toBe(true);
  });

  it('positions the button and card from bottomInset', async () => {
    const view = await renderMenu();
    await open();
    expect(fab()).toHaveStyle({ width: FAB_SIZE, height: FAB_SIZE, right: 24, bottom: 16 });
    const card = screen.getAllByRole('menuitem')[0].parent!;
    expect(card).toHaveStyle({ bottom: 16 + FAB_SIZE + 8, right: 24 });
    await view.rerender(
      <AddEntryMenu journals={BUILT_IN_JOURNALS} onPick={jest.fn()} bottomInset={34} />,
    );
    expect(fab()).toHaveStyle({ bottom: 50 });
    expect(screen.getAllByRole('menuitem')[0].parent!).toHaveStyle({ bottom: 50 + FAB_SIZE + 8 });
  });
});
