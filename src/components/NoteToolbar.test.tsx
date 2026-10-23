import { fireEvent, render, screen } from '@testing-library/react-native';
import { NoteToolbar } from './NoteToolbar';

const handlers = {
  onUndo: jest.fn(),
  onRedo: jest.fn(),
  onDismissKeyboard: jest.fn(),
  onMic: jest.fn(),
  onTags: jest.fn(),
  onCheckbox: jest.fn(),
};
const renderBar = (props: Partial<Parameters<typeof NoteToolbar>[0]> = {}) =>
  render(
    <NoteToolbar canUndo canRedo micDisabled={false} listKind={null} {...handlers} {...props} />,
  );
const disabled = (label: string) => screen.getByLabelText(label).props.accessibilityState.disabled;

beforeEach(() => jest.clearAllMocks());

describe('NoteToolbar', () => {
  it('renders six labeled buttons in order', async () => {
    await renderBar();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual([
      'Undo',
      'Redo',
      'Hide keyboard',
      'Record voice note',
      'Add tags',
      'Add checkbox',
    ]);
  });

  it('shows the waveform icon on the voice note button', async () => {
    await renderBar();
    expect(screen.getByTestId('waveform-icon')).toBeTruthy();
  });

  it('calls the handlers', async () => {
    await renderBar();
    for (const label of [
      'Undo',
      'Redo',
      'Hide keyboard',
      'Record voice note',
      'Add tags',
      'Add checkbox',
    ])
      await fireEvent.press(screen.getByLabelText(label));
    for (const fn of Object.values(handlers)) expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, 'Add checkbox'],
    ['bullet', 'Add checkbox'],
    ['numbered', 'Add checkbox'],
    ['mixed', 'Add checkbox'],
    ['checkbox', 'Remove checkbox'],
  ] as const)('labels the checkbox button for list kind %s', async (kind, label) => {
    await renderBar({ listKind: kind });
    expect(screen.getByLabelText(label)).toBeTruthy();
    expect(disabled(label)).toBe(false);
  });

  it('calls onCheckbox when pressed', async () => {
    await renderBar({ listKind: 'checkbox' });
    await fireEvent.press(screen.getByLabelText('Remove checkbox'));
    expect(handlers.onCheckbox).toHaveBeenCalledTimes(1);
  });

  it('disables undo, redo and the mic on their own flags', async () => {
    await renderBar({ canUndo: false, canRedo: false, micDisabled: true });
    expect(disabled('Undo')).toBe(true);
    expect(disabled('Redo')).toBe(true);
    expect(disabled('Record voice note')).toBe(true);
    expect(disabled('Add tags')).toBe(false);
  });

  it('locks every button when disabled', async () => {
    await renderBar({ disabled: true, listKind: 'checkbox' });
    for (const b of screen.getAllByRole('button'))
      expect(b.props.accessibilityState.disabled).toBe(true);
  });

  it('has no indent or outdent button', async () => {
    await renderBar();
    expect(screen.queryByLabelText('Indent')).toBeNull();
    expect(screen.queryByLabelText('Outdent')).toBeNull();
  });

  it('gives the hide-keyboard button its hint and keeps it enabled on the other flags', async () => {
    await renderBar({ canUndo: false, canRedo: false, micDisabled: true });
    const button = screen.getByLabelText('Hide keyboard');
    expect(button.props.accessibilityHint).toBe('Stops editing and shows the note.');
    expect(disabled('Hide keyboard')).toBe(false);
    await fireEvent.press(button);
    expect(handlers.onDismissKeyboard).toHaveBeenCalledTimes(1);
  });

  it('disables the hide-keyboard button when locked and does not call the handler', async () => {
    await renderBar({ disabled: true });
    expect(disabled('Hide keyboard')).toBe(true);
    await fireEvent.press(screen.getByLabelText('Hide keyboard'));
    expect(handlers.onDismissKeyboard).not.toHaveBeenCalled();
  });

  it('shows the keyboard icon on the hide-keyboard button', async () => {
    await renderBar();
    expect(screen.getByTestId('keyboard-hide-icon', { includeHiddenElements: true })).toBeTruthy();
  });
});
