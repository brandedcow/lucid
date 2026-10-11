import { AccessibilityInfo, BackHandler, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AddEntryMenu, FAB_SIZE } from './AddEntryMenu';
import { BUILT_IN_JOURNALS, journalCopy } from '../utils/journals';

let backHandler: (() => boolean | null | undefined) | null = null;
const remove = jest.fn();
let addSpy: jest.SpyInstance;
let reduceSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  reduceSpy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  backHandler = null;
  remove.mockClear();
  addSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandler = handler as typeof backHandler;
    return { remove };
  });
});
afterEach(() => {
  addSpy.mockRestore();
  reduceSpy.mockRestore();
  jest.useRealTimers();
});

/** Run the 220 ms slide/fade to its end. */
const finishAnimation = () => act(() => jest.advanceTimersByTime(400));

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
    await finishAnimation();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('the button toggles the menu (as it can under a screen reader)', async () => {
    await renderMenu();
    await open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    await open();
    await finishAnimation();
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
      expect(items[i]).toHaveStyle({ minHeight: 88, borderRadius: 16 });
      expect(within(items[i]).getByText('›', { hidden: true })).toBeTruthy();
    });
    expect(screen.getByRole('header', { name: 'Add entry' })).toBeTruthy();
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
    expect(fab().props.accessibilityState).toMatchObject({ expanded: false });
    await finishAnimation();
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('closes from the backdrop without calling onPick', async () => {
    const onPick = jest.fn();
    await renderMenu({ onPick });
    await open();
    await fireEvent.press(screen.getByLabelText('Close menu'));
    await finishAnimation();
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
    await finishAnimation();
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
    expect(screen.getByLabelText('Close menu').parent?.parent?.props.accessibilityViewIsModal).toBe(
      true,
    );
  });

  it('is a bottom sheet pinned to the bottom, padded by bottomInset', async () => {
    const view = await renderMenu();
    await open();
    expect(fab()).toHaveStyle({ width: FAB_SIZE, height: FAB_SIZE, right: 24, bottom: 16 });
    const sheet = screen.getByRole('header', { name: 'Add entry' }).parent!;
    const style = StyleSheet.flatten(sheet.props.style);
    expect(style).toMatchObject({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '70%',
      paddingBottom: 24,
    });
    await view.rerender(
      <AddEntryMenu journals={BUILT_IN_JOURNALS} onPick={jest.fn()} bottomInset={34} />,
    );
    expect(fab()).toHaveStyle({ bottom: 50 });
    expect(StyleSheet.flatten(sheet.props.style).paddingBottom).toBe(34 + 24);
  });

  it('keeps the sheet mounted until the exit animation ends', async () => {
    await renderMenu();
    await open();
    await finishAnimation();
    await fireEvent.press(screen.getByLabelText('Close menu'));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    await finishAnimation();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('with Reduce Motion it opens and closes without any animation', async () => {
    reduceSpy.mockResolvedValue(true);
    await renderMenu();
    await act(async () => {});
    await open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText('Close menu'));
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('reopening while it is closing keeps it open', async () => {
    await renderMenu();
    await open();
    await finishAnimation();
    await fireEvent.press(screen.getByLabelText('Close menu'));
    await open();
    await finishAnimation();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(fab().props.accessibilityState).toMatchObject({ expanded: true });
  });
});
