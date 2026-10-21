import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, BackHandler, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { NoteView } from '../utils/noteViews';
import { NotesDrawer } from './NotesDrawer';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the namespace import is a copy
const RN = require('react-native');
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};
const TAGS = [
  { tag: 'dream', count: 12 },
  { tag: 'idea', count: 1 },
];

type Props = Partial<Parameters<typeof NotesDrawer>[0]>;

const progress = new Animated.Value(1);
function drawer(props: Props = {}) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <NotesDrawer
        open
        progress={progress}
        width={360}
        onClose={jest.fn()}
        view={{ kind: 'all' }}
        onSelectView={jest.fn()}
        tags={TAGS}
        trashedCount={0}
        onOpenTrash={jest.fn()}
        onOpenSettings={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>
  );
}

let backHandlers: (() => boolean | null | undefined)[];
const removeBack = jest.fn();

beforeEach(() => {
  backHandlers = [];
  removeBack.mockClear();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
    backHandlers.push(handler as () => boolean);
    return { remove: removeBack };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

const HIDDEN = { includeHiddenElements: true };
const panelStyle = () =>
  StyleSheet.flatten(screen.getByTestId('notes-drawer-panel', HIDDEN).props.style);

describe('NotesDrawer open and close', () => {
  beforeEach(() => progress.setValue(1));

  it('stays mounted while closed, but invisible, untouchable and hidden from screen readers', async () => {
    progress.setValue(0);
    await render(drawer({ open: false }));
    const root = screen.getByTestId('notes-drawer', HIDDEN);
    expect(root.props.pointerEvents).toBe('none');
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(panelStyle().opacity).toBe(0);
    expect(backHandlers).toHaveLength(0);
  });

  it('open: reachable, capped at 360 wide, on the left (not a Modal)', async () => {
    await render(drawer());
    const root = screen.getByTestId('notes-drawer', HIDDEN);
    expect(root.props.pointerEvents).toBe('auto');
    expect(root.props.accessibilityElementsHidden).toBe(false);
    expect(root.props.importantForAccessibility).toBe('auto');
    const outer = StyleSheet.flatten(root.props.style);
    expect(outer.width).toBe(360);
    expect(outer.left).toBe(0);
    expect(panelStyle().width).toBe(360);
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/"type":"Modal"/);
  });

  it('has no backdrop or close layer of its own (the page owns the strip you tap)', async () => {
    await render(drawer());
    expect(screen.queryByLabelText('Close menu')).toBeNull();
  });

  it('fades in over the first 60 percent and slides in from 30 percent of the width', async () => {
    progress.setValue(0);
    await render(drawer({ open: false }));
    expect(panelStyle().opacity).toBe(0);
    expect(panelStyle().transform[0].translateX).toBeCloseTo(-108);
    await act(async () => progress.setValue(0.3));
    expect(panelStyle().opacity).toBeCloseTo(0.5);
    expect(panelStyle().transform[0].translateX).toBeCloseTo(-75.6);
    await act(async () => progress.setValue(0.6));
    expect(panelStyle().opacity).toBe(1);
    await act(async () => progress.setValue(1));
    expect(panelStyle().opacity).toBe(1);
    expect(panelStyle().transform[0].translateX).toBe(0);
  });

  it('moves screen-reader focus to the view dropdown when it opens', async () => {
    jest.spyOn(RN, 'findNodeHandle').mockReturnValue(11);
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation();
    const view = await render(drawer({ open: false }));
    expect(focus).not.toHaveBeenCalled();
    await view.rerender(drawer({ open: true }));
    expect(focus).toHaveBeenCalledWith(11);
  });

  it('does not fail when the node to focus is missing', async () => {
    jest.spyOn(RN, 'findNodeHandle').mockImplementation(() => {
      throw new Error('gone');
    });
    const view = await render(drawer({ open: false }));
    await view.rerender(drawer({ open: true }));
    expect(screen.getByLabelText('View, All Notes')).toBeTruthy();
  });

  it('collapses the dropdown again the next time it opens', async () => {
    const view = await render(drawer());
    await fireEvent.press(screen.getByLabelText('View, All Notes'));
    expect(screen.getByLabelText('Untagged')).toBeTruthy();
    await view.rerender(drawer({ open: false }));
    await view.rerender(drawer({ open: true }));
    expect(screen.queryByLabelText('Untagged')).toBeNull();
  });

  it('the screen-reader escape gesture calls onClose', async () => {
    const onClose = jest.fn();
    await render(drawer({ onClose }));
    screen.getByTestId('notes-drawer').props.onAccessibilityEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Android Back closes it, is handled, and is removed on close', async () => {
    const onClose = jest.fn();
    const view = await render(drawer({ onClose }));
    expect(backHandlers).toHaveLength(1);
    expect(backHandlers[0]()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    await view.rerender(drawer({ onClose, open: false }));
    expect(removeBack).toHaveBeenCalled();
  });
});

describe('NotesDrawer content', () => {
  it('shows tags with counts, in the order given', async () => {
    await render(drawer());
    expect(screen.getByRole('header', { name: 'Tags' })).toBeOnTheScreen();
    expect(screen.getByText('#dream')).toBeOnTheScreen();
    expect(screen.getByText('12')).toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen();
    const rows = screen.getAllByLabelText(/^#/);
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual(['#dream, 12', '#idea, 1']);
  });

  it('selecting a tag calls onSelectView with the tag view', async () => {
    const onSelectView = jest.fn();
    await render(drawer({ onSelectView }));
    await fireEvent.press(screen.getByLabelText('#idea, 1'));
    expect(onSelectView).toHaveBeenCalledWith({ kind: 'tag', tag: 'idea' });
  });

  it('marks only the selected tag as selected', async () => {
    await render(drawer({ view: { kind: 'tag', tag: 'idea' } }));
    expect(screen.getByLabelText('#idea, 1').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('#dream, 12').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('shows the no-tags text, and a message instead of tags when unreadable', async () => {
    const view = await render(drawer({ tags: [] }));
    expect(screen.getByText('No tags yet. Write #word in a note to make one.')).toBeOnTheScreen();
    await view.rerender(drawer({ unreadable: true }));
    expect(screen.queryByText('#dream')).toBeNull();
    expect(
      screen.getByText('Your notes could not be read. Nothing was changed.'),
    ).toBeOnTheScreen();
  });

  it('lists every tag, however many', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      tag: `t${String(i).padStart(2, '0')}`,
      count: 1,
    }));
    await render(drawer({ tags: many }));
    expect(screen.getAllByLabelText(/^#t\d\d, 1$/)).toHaveLength(80);
  });

  it('shows Recently Deleted only in the dropdown: none while it is closed, a count only above zero', async () => {
    const onOpenTrash = jest.fn();
    const view = await render(drawer({ onOpenTrash, trashedCount: 3 }));
    expect(screen.queryByLabelText(/^Recently Deleted/)).toBeNull();
    expect(screen.queryByText('Recently Deleted')).toBeNull();
    await fireEvent.press(screen.getByLabelText('View, All Notes'));
    await fireEvent.press(screen.getByLabelText('Recently Deleted, 3'));
    expect(onOpenTrash).toHaveBeenCalledTimes(1);
    await view.rerender(drawer({ onOpenTrash, trashedCount: 0 }));
    expect(screen.getByLabelText('Recently Deleted')).toBeTruthy();
    expect(screen.queryByLabelText(/^Recently Deleted, /)).toBeNull();
  });

  it('the Settings row opens settings', async () => {
    const onOpenSettings = jest.fn();
    await render(drawer({ onOpenSettings }));
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('NotesDrawer view dropdown', () => {
  it('is collapsed with expanded=false and shows the current view', async () => {
    await render(drawer({ view: { kind: 'todo' } }));
    const button = screen.getByLabelText('View, Todo');
    expect(button.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByLabelText('Untagged')).toBeNull();
  });

  it('expands to the five smart views and marks the current one', async () => {
    await render(drawer({ view: { kind: 'pinned' } }));
    await fireEvent.press(screen.getByLabelText('View, Pinned'));
    expect(screen.getByLabelText('View, Pinned').props.accessibilityState).toMatchObject({
      expanded: true,
    });
    for (const name of ['All Notes', 'Today', 'Todo', 'Untagged', 'Pinned']) {
      expect(screen.getByLabelText(name)).toBeOnTheScreen();
    }
    expect(screen.getByLabelText('Pinned').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('Today').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('lists the smart views in the order Today, All Notes, Todo, Untagged, Pinned', async () => {
    await render(drawer({ view: { kind: 'today' } }));
    await fireEvent.press(screen.getByLabelText('View, Today'));
    expect(screen.getByLabelText('Today').props.accessibilityState).toMatchObject({
      selected: true,
    });
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel)
      .filter((l) => ['Today', 'All Notes', 'Todo', 'Untagged', 'Pinned'].includes(l));
    expect(labels).toEqual(['Today', 'All Notes', 'Todo', 'Untagged', 'Pinned']);
  });

  it('choosing an option calls onSelectView', async () => {
    const onSelectView = jest.fn();
    await render(drawer({ onSelectView }));
    await fireEvent.press(screen.getByLabelText('View, All Notes'));
    await fireEvent.press(screen.getByLabelText('Untagged'));
    expect(onSelectView).toHaveBeenCalledWith({ kind: 'untagged' } satisfies NoteView);
  });

  it('shows All Notes in the dropdown while a tag is selected', async () => {
    await render(drawer({ view: { kind: 'tag', tag: 'idea' } }));
    expect(screen.getByLabelText('View, All Notes')).toBeOnTheScreen();
  });
});

const options = () => within(screen.getByTestId('notes-drawer-options'));
const footer = () => within(screen.getByTestId('notes-drawer-footer'));
const TIE_TAGS = [
  { tag: 'zeta', count: 3 },
  { tag: 'beta', count: 3 },
  { tag: 'alpha', count: 1 },
  { tag: 'omega', count: 7 },
];
const tagOrder = () =>
  screen.getAllByLabelText(/^#/).map((r) => r.props.accessibilityLabel as string);

describe('NotesDrawer Recently Deleted in the dropdown', () => {
  it('is the sixth row, after a separator, with a count above zero', async () => {
    await render(drawer({ trashedCount: 4 }));
    await fireEvent.press(screen.getByLabelText('View, All Notes'));
    const labels = within(screen.getByTestId('notes-drawer-options'))
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual([
      'Today',
      'All Notes',
      'Todo',
      'Untagged',
      'Pinned',
      'Recently Deleted, 4',
    ]);
    expect(options().getByText('4')).toBeOnTheScreen();
  });

  it('has no count at zero', async () => {
    await render(drawer());
    await fireEvent.press(screen.getByLabelText('View, All Notes'));
    expect(options().getByLabelText('Recently Deleted')).toBeOnTheScreen();
    expect(options().queryByLabelText(/^Recently Deleted, /)).toBeNull();
  });

  it('opens trash once, never selects a view, is never selected, keeps the label', async () => {
    const onOpenTrash = jest.fn();
    const onSelectView = jest.fn();
    await render(drawer({ onOpenTrash, onSelectView, view: { kind: 'trash' } }));
    expect(screen.getByLabelText('View, All Notes')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('View, All Notes'));
    const row = options().getByLabelText('Recently Deleted');
    expect(row.props.accessibilityState?.selected).toBeFalsy();
    await fireEvent.press(row);
    expect(onOpenTrash).toHaveBeenCalledTimes(1);
    expect(onSelectView).not.toHaveBeenCalled();
    expect(screen.getByLabelText('View, All Notes')).toBeOnTheScreen();
  });

  it('has exactly one Recently Deleted element, in the dropdown and not in the footer', async () => {
    await render(drawer({ trashedCount: 2 }));
    expect(screen.queryAllByLabelText(/^Recently Deleted/)).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('View, All Notes'));
    expect(screen.getAllByLabelText(/^Recently Deleted/)).toHaveLength(1);
    expect(footer().queryByLabelText(/^Recently Deleted/)).toBeNull();
    expect(footer().queryByText('Recently Deleted')).toBeNull();
    expect(footer().queryByTestId('trash-icon', HIDDEN)).toBeNull();
  });
});

describe('NotesDrawer icons', () => {
  it('shows an icon on the trigger that follows the view, hidden from screen readers', async () => {
    const view = await render(drawer({ view: { kind: 'todo' } }));
    const icon = screen.getByTestId('todo-icon', HIDDEN);
    expect(icon.props.accessible).toBe(false);
    expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
    await view.rerender(drawer({ view: { kind: 'pinned' } }));
    expect(screen.getByTestId('pinned-icon', HIDDEN)).toBeOnTheScreen();
  });

  it('uses the All Notes icon for a tag view and for Recently Deleted', async () => {
    const view = await render(drawer({ view: { kind: 'tag', tag: 'idea' } }));
    expect(screen.getByTestId('all-notes-icon', HIDDEN)).toBeOnTheScreen();
    await view.rerender(drawer({ view: { kind: 'trash' } }));
    expect(screen.getByTestId('all-notes-icon', HIDDEN)).toBeOnTheScreen();
  });

  it('puts an icon on every dropdown option (Recently Deleted included), none on tags', async () => {
    await render(drawer({ view: { kind: 'today' } }));
    await fireEvent.press(screen.getByLabelText('View, Today'));
    for (const id of ['today', 'all-notes', 'todo', 'untagged', 'pinned', 'trash']) {
      expect(options().getByTestId(`${id}-icon`, HIDDEN)).toBeOnTheScreen();
    }
    const tagRow = within(screen.getByLabelText('#dream, 12'));
    expect(tagRow.queryByTestId(/-icon$/, HIDDEN)).toBeNull();
  });
});

describe('NotesDrawer footer', () => {
  it('has a Settings gear button (no Settings text) that opens settings', async () => {
    const onOpenSettings = jest.fn();
    await render(drawer({ onOpenSettings }));
    expect(screen.queryByText('Settings')).toBeNull();
    const gear = footer().getByRole('button', { name: 'Settings' });
    expect(within(gear).getByTestId('gear-icon', HIDDEN)).toBeOnTheScreen();
    const style = StyleSheet.flatten(gear.props.style);
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    await fireEvent.press(gear);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('has a Sort tags button, 44pt, with expanded state that flips', async () => {
    await render(drawer());
    const sort = screen.getByLabelText('Sort tags');
    const style = StyleSheet.flatten(sort.props.style);
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    expect(within(sort).getByTestId('sort-icon', HIDDEN)).toBeOnTheScreen();
    expect(sort.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(sort);
    // The open menu is a modal layer, so the button is hidden from queries behind it.
    expect(screen.getByLabelText('Sort tags', HIDDEN).props.accessibilityState).toMatchObject({
      expanded: true,
    });
    await fireEvent.press(screen.getByLabelText('Close sort menu'));
    expect(screen.getByLabelText('Sort tags').props.accessibilityState).toMatchObject({
      expanded: false,
    });
  });

  it('disables Sort tags with fewer than two tags and when unreadable', async () => {
    const view = await render(drawer({ tags: [{ tag: 'one', count: 1 }] }));
    expect(screen.getByLabelText('Sort tags').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByLabelText('Sort tags'));
    expect(screen.queryByLabelText('Close sort menu')).toBeNull();
    await view.rerender(drawer({ tags: [] }));
    expect(screen.getByLabelText('Sort tags').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await view.rerender(drawer({ unreadable: true }));
    expect(screen.getByLabelText('Sort tags').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await view.rerender(drawer());
    expect(screen.getByLabelText('Sort tags').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });
});

describe('NotesDrawer tag order and sort menu', () => {
  it('alpha is alphabetical, whatever order the tags arrive in', async () => {
    await render(drawer({ tags: TIE_TAGS, tagSort: 'alpha' }));
    expect(tagOrder()).toEqual(['#alpha, 1', '#beta, 3', '#omega, 7', '#zeta, 3']);
  });

  it('defaults to alphabetical', async () => {
    await render(drawer({ tags: TIE_TAGS }));
    expect(tagOrder()[0]).toBe('#alpha, 1');
  });

  it('count is by count descending, ties alphabetical, with the counts as passed', async () => {
    await render(drawer({ tags: TIE_TAGS, tagSort: 'count' }));
    expect(tagOrder()).toEqual(['#omega, 7', '#beta, 3', '#zeta, 3', '#alpha, 1']);
  });

  it('the menu offers two items, marks the current one, and the backdrop is labelled', async () => {
    await render(drawer({ tagSort: 'count' }));
    await fireEvent.press(screen.getByLabelText('Sort tags'));
    expect(screen.getByLabelText('Close sort menu')).toBeOnTheScreen();
    expect(screen.getByText('A to Z')).toBeOnTheScreen();
    expect(screen.getByText('Most notes')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Sort tags by number of notes').props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByLabelText('Sort tags alphabetically').props.accessibilityState,
    ).toMatchObject({ selected: false });
    expect(screen.getByLabelText('Sort tags by number of notes').props.accessibilityRole).toBe(
      'menuitem',
    );
  });

  it('the menu is the last child of the panel content, inside the panel', async () => {
    await render(drawer());
    await fireEvent.press(screen.getByLabelText('Sort tags'));
    expect(
      within(screen.getByTestId('notes-drawer-panel')).getByTestId('tag-sort-menu'),
    ).toBeOnTheScreen();
  });

  it('choosing an order calls onChangeTagSort and closes the menu', async () => {
    const onChangeTagSort = jest.fn();
    await render(drawer({ onChangeTagSort }));
    await fireEvent.press(screen.getByLabelText('Sort tags'));
    await fireEvent.press(screen.getByLabelText('Sort tags by number of notes'));
    expect(onChangeTagSort).toHaveBeenCalledTimes(1);
    expect(onChangeTagSort).toHaveBeenCalledWith('count');
    expect(screen.queryByLabelText('Close sort menu')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Sort tags'));
    await fireEvent.press(screen.getByLabelText('Sort tags alphabetically'));
    expect(onChangeTagSort).toHaveBeenLastCalledWith('alpha');
  });

  it('Back closes only the menu first, then the drawer', async () => {
    const onClose = jest.fn();
    await render(drawer({ onClose }));
    await fireEvent.press(screen.getByLabelText('Sort tags'));
    expect(backHandlers).toHaveLength(2);
    // RN calls the last registered handler first: the menu's.
    let handled: boolean | null | undefined;
    await act(async () => {
      handled = backHandlers[backHandlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Close sort menu')).toBeNull();
    expect(backHandlers[0]()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closing the drawer closes the menu, and it is closed on reopen', async () => {
    const view = await render(drawer());
    await fireEvent.press(screen.getByLabelText('Sort tags'));
    expect(screen.getByLabelText('Close sort menu')).toBeOnTheScreen();
    await view.rerender(drawer({ open: false }));
    expect(screen.queryByLabelText('Close sort menu', HIDDEN)).toBeNull();
    await view.rerender(drawer({ open: true }));
    expect(screen.queryByLabelText('Close sort menu')).toBeNull();
    expect(screen.getByLabelText('Sort tags').props.accessibilityState).toMatchObject({
      expanded: false,
    });
  });
});
