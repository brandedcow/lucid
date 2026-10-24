import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ListActions } from '../utils/markdownList';
import { ListControlsPanel } from './ListControlsPanel';

const all: ListActions = {
  onList: true,
  kind: 'bullet',
  canIndent: true,
  canOutdent: true,
  canMoveUp: true,
  canMoveDown: true,
};
const none: ListActions = {
  onList: false,
  kind: null,
  canIndent: false,
  canOutdent: false,
  canMoveUp: false,
  canMoveDown: false,
};

function handlers() {
  return {
    onIndent: jest.fn(),
    onOutdent: jest.fn(),
    onMoveUp: jest.fn(),
    onMoveDown: jest.fn(),
    onType: jest.fn(),
    onKeyboard: jest.fn(),
  };
}

async function setup(actions: ListActions, disabled = false) {
  const h = handlers();
  await render(<ListControlsPanel actions={actions} disabled={disabled} height={280} {...h} />);
  return h;
}

const LABELS = [
  'Outdent',
  'Indent',
  'Move up',
  'Move down',
  'Bulleted list',
  'Numbered list',
  'To-do list',
  'Keyboard',
];
const btn = (name: string) => screen.getByRole('button', { name });
const isDisabled = (name: string) => btn(name).props.accessibilityState.disabled === true;
const isSelected = (name: string) => btn(name).props.accessibilityState.selected === true;

describe('ListControlsPanel', () => {
  it('renders the toolbar with all eight controls and fills the height', async () => {
    await setup(all);
    const bar = screen.getByLabelText('List controls');
    expect(bar.props.accessibilityRole).toBe('toolbar');
    expect(bar.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 280 })]),
    );
    for (const l of LABELS) expect(btn(l)).toBeTruthy();
  });

  it('enables everything on a bullet with every move available, and selects only Bulleted', async () => {
    await setup(all);
    for (const l of LABELS) expect(isDisabled(l)).toBe(false);
    expect(isSelected('Bulleted list')).toBe(true);
    expect(isSelected('Numbered list')).toBe(false);
    expect(isSelected('To-do list')).toBe(false);
  });

  it('selects Numbered for numbered', async () => {
    await setup({ ...all, kind: 'numbered' });
    expect(isSelected('Numbered list')).toBe(true);
    expect(isSelected('Bulleted list')).toBe(false);
  });

  it('selects To-do for checkbox', async () => {
    await setup({ ...all, kind: 'checkbox' });
    expect(isSelected('To-do list')).toBe(true);
  });

  it('selects nothing for mixed', async () => {
    await setup({ ...all, kind: 'mixed' });
    for (const l of ['Bulleted list', 'Numbered list', 'To-do list'])
      expect(isSelected(l)).toBe(false);
  });

  it('disables the four move controls off a list but keeps types and Keyboard enabled', async () => {
    await setup(none);
    for (const l of ['Outdent', 'Indent', 'Move up', 'Move down']) expect(isDisabled(l)).toBe(true);
    for (const l of ['Bulleted list', 'Numbered list', 'To-do list', 'Keyboard'])
      expect(isDisabled(l)).toBe(false);
    for (const l of ['Bulleted list', 'Numbered list', 'To-do list'])
      expect(isSelected(l)).toBe(false);
  });

  it('follows each can* flag on its own control', async () => {
    await setup({ ...all, canIndent: false, canMoveDown: false });
    expect(isDisabled('Indent')).toBe(true);
    expect(isDisabled('Move down')).toBe(true);
    expect(isDisabled('Outdent')).toBe(false);
    expect(isDisabled('Move up')).toBe(false);
  });

  it('locks every control when disabled, the Keyboard key too', async () => {
    const h = await setup(all, true);
    for (const l of LABELS) expect(isDisabled(l)).toBe(true);
    await fireEvent.press(btn('Keyboard'));
    expect(h.onKeyboard).not.toHaveBeenCalled();
  });

  it('fires each handler once, with the right kind', async () => {
    const h = await setup(all);
    await fireEvent.press(btn('Outdent'));
    await fireEvent.press(btn('Indent'));
    await fireEvent.press(btn('Move up'));
    await fireEvent.press(btn('Move down'));
    await fireEvent.press(btn('Bulleted list'));
    await fireEvent.press(btn('Numbered list'));
    await fireEvent.press(btn('To-do list'));
    await fireEvent.press(btn('Keyboard'));
    for (const f of [h.onOutdent, h.onIndent, h.onMoveUp, h.onMoveDown, h.onKeyboard])
      expect(f).toHaveBeenCalledTimes(1);
    expect(h.onType.mock.calls).toEqual([['bullet'], ['numbered'], ['checkbox']]);
  });

  it('does not fire a disabled control', async () => {
    const h = await setup(none);
    await fireEvent.press(btn('Indent'));
    expect(h.onIndent).not.toHaveBeenCalled();
  });

  it('gives every control a hint', async () => {
    await setup(all);
    for (const l of LABELS) expect(btn(l).props.accessibilityHint).toBeTruthy();
  });

  it('draws the indent, outdent and to-do keys as icons, not font glyphs', async () => {
    await setup(all);
    expect(screen.getByTestId('indent-icon', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('outdent-icon', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('todo-icon', { includeHiddenElements: true })).toBeTruthy();
    for (const g of ['⇤', '⇥', '☑']) expect(screen.queryByText(g)).toBeNull();
    // The labels and presses are unchanged.
    expect(btn('Outdent')).toBeTruthy();
  });
});
