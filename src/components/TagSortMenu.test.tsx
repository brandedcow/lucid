import { fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, StyleSheet } from 'react-native';
import { TagSortMenu } from './TagSortMenu';

let backHandlers: (() => boolean | null | undefined)[];
const removeBack = jest.fn();

beforeEach(() => {
  backHandlers = [];
  removeBack.mockClear();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
    backHandlers.push(handler as () => boolean);
    return { remove: removeBack };
  });
});
afterEach(() => jest.restoreAllMocks());

function menu(props: Partial<Parameters<typeof TagSortMenu>[0]> = {}) {
  return (
    <TagSortMenu
      open
      onOpenChange={jest.fn()}
      value="alpha"
      onChange={jest.fn()}
      bottom={90}
      right={16}
      {...props}
    />
  );
}

describe('TagSortMenu', () => {
  it('renders nothing while closed, and registers no Back handler', async () => {
    await render(menu({ open: false }));
    expect(screen.queryByLabelText('Close sort menu')).toBeNull();
    expect(backHandlers).toHaveLength(0);
  });

  it('renders nothing when disabled even if open', async () => {
    await render(menu({ disabled: true }));
    expect(screen.queryByLabelText('Close sort menu')).toBeNull();
    expect(backHandlers).toHaveLength(0);
  });

  it('the backdrop closes it', async () => {
    const onOpenChange = jest.fn();
    await render(menu({ onOpenChange }));
    await fireEvent.press(screen.getByLabelText('Close sort menu'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('an item calls onChange once, then closes', async () => {
    const onOpenChange = jest.fn();
    const onChange = jest.fn();
    await render(menu({ onOpenChange, onChange }));
    await fireEvent.press(screen.getByLabelText('Sort tags by number of notes'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('count');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('marks the current value selected', async () => {
    await render(menu({ value: 'alpha' }));
    expect(
      screen.getByLabelText('Sort tags alphabetically').props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByLabelText('Sort tags by number of notes').props.accessibilityState,
    ).toMatchObject({ selected: false });
  });

  it('positions the card from bottom and right', async () => {
    await render(menu({ bottom: 77, right: 21 }));
    const style = StyleSheet.flatten(screen.getByTestId('tag-sort-menu-card').props.style);
    expect(style.position).toBe('absolute');
    expect(style.bottom).toBe(77);
    expect(style.right).toBe(21);
  });

  it('is a modal layer, and Back closes it and is handled', async () => {
    const onOpenChange = jest.fn();
    await render(menu({ onOpenChange }));
    expect(screen.getByTestId('tag-sort-menu').props.accessibilityViewIsModal).toBe(true);
    expect(backHandlers).toHaveLength(1);
    expect(backHandlers[0]()).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
