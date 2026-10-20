import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

  it('always shows Recently Deleted, with its count only above zero, and it opens trash', async () => {
    const onOpenTrash = jest.fn();
    const view = await render(drawer({ onOpenTrash }));
    expect(screen.getByLabelText('Recently Deleted')).toBeTruthy();
    expect(screen.queryByLabelText(/^Recently Deleted, /)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Recently Deleted'));
    expect(onOpenTrash).toHaveBeenCalledTimes(1);
    onOpenTrash.mockClear();
    await view.rerender(drawer({ onOpenTrash, trashedCount: 3 }));
    expect(screen.queryByLabelText('Recently Deleted')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Recently Deleted, 3'));
    expect(onOpenTrash).toHaveBeenCalledTimes(1);
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
