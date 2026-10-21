import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import {
  AllNotesIcon,
  GearIcon,
  PinnedIcon,
  SortIcon,
  TodayIcon,
  TodoIcon,
  UntaggedIcon,
  ViewIcon,
  type ViewIconKind,
} from './DrawerIcons';

// The icons hide their descendants from accessibility, so queries must include hidden elements.
const node = (id: string) => screen.getByTestId(id, { hidden: true });
const all = (id: string) => screen.getAllByTestId(id, { hidden: true });
const style = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

// [component, root testID, drawn-part testID with its colour property, expected part count]
const ICONS = [
  [TodayIcon, 'today-icon', 'today-page', 'borderColor', 1],
  [AllNotesIcon, 'all-notes-icon', 'all-notes-line', 'backgroundColor', 3],
  [TodoIcon, 'todo-icon', 'todo-check', 'borderColor', 1],
  [UntaggedIcon, 'untagged-icon', 'untagged-strike', 'backgroundColor', 1],
  [PinnedIcon, 'pinned-icon', 'pinned-needle', 'backgroundColor', 1],
  [GearIcon, 'gear-icon', 'gear-ring', 'borderColor', 1],
  [SortIcon, 'sort-icon', 'sort-bar', 'backgroundColor', 3],
] as const;

describe.each(ICONS)('%p', (Icon, rootId, partId, prop, count) => {
  it('renders hidden from accessibility, 28 by default', async () => {
    await render(<Icon color="#123456" />);
    const root = node(rootId);
    expect(root.props.accessible).toBe(false);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(style(root).width).toBe(28);
    expect(style(root).height).toBe(28);
    expect(screen.queryByTestId(rootId)).toBeNull(); // not reachable by default queries
  });

  it('scales with size', async () => {
    await render(<Icon color="#000" size={56} />);
    expect(style(node(rootId)).width).toBe(56);
    expect(style(node(rootId)).height).toBe(56);
  });

  it('applies the colour prop to the drawn parts', async () => {
    await render(<Icon color="#abcdef" />);
    const parts = all(partId);
    expect(parts).toHaveLength(count);
    for (const p of parts) expect(style(p)[prop]).toBe('#abcdef');
  });
});

describe('every drawn part uses the colour', () => {
  it('gear teeth', async () => {
    await render(<GearIcon color="#abcdef" />);
    const teeth = all('gear-tooth');
    expect(teeth).toHaveLength(8);
    for (const t of teeth) expect(style(t).backgroundColor).toBe('#abcdef');
  });

  it('sort bars run long to short', async () => {
    await render(<SortIcon color="#000" />);
    const widths = all('sort-bar').map((b) => style(b).width as number);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
  });

  it('the hash has four bars and a strike', async () => {
    await render(<UntaggedIcon color="#abcdef" />);
    expect(all('untagged-vbar')).toHaveLength(2);
    expect(all('untagged-hbar')).toHaveLength(2);
    expect(style(node('untagged-strike')).backgroundColor).toBe('#abcdef');
  });
});

describe('ViewIcon', () => {
  const KINDS: [ViewIconKind, string][] = [
    ['today', 'today-icon'],
    ['all', 'all-notes-icon'],
    ['todo', 'todo-icon'],
    ['untagged', 'untagged-icon'],
    ['pinned', 'pinned-icon'],
    ['trash', 'trash-icon'],
  ];

  it.each(KINDS)('renders the %s icon', async (kind, testID) => {
    await render(<ViewIcon kind={kind} color="#abcdef" size={22} />);
    expect(node(testID)).toBeTruthy();
    expect(style(node(testID)).width).toBe(22);
    expect(screen.getAllByTestId(/-icon$/, { hidden: true })).toHaveLength(1);
  });

  it('passes the colour through to the trash icon', async () => {
    await render(<ViewIcon kind="trash" color="#abcdef" />);
    expect(style(node('trash-lid')).backgroundColor).toBe('#abcdef');
  });

  it('defaults to 28', async () => {
    await render(<ViewIcon kind="all" color="#000" />);
    expect(style(node('all-notes-icon')).width).toBe(28);
  });
});
