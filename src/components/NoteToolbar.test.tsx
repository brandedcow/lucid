import { fireEvent, render, screen } from '@testing-library/react-native';
import { NoteToolbar } from './NoteToolbar';

const handlers = {
  onUndo: jest.fn(),
  onRedo: jest.fn(),
  onDismissKeyboard: jest.fn(),
  onMic: jest.fn(),
  onTags: jest.fn(),
  onListPanel: jest.fn(),
};
const renderBar = (props: Partial<Parameters<typeof NoteToolbar>[0]> = {}) =>
  render(
    <NoteToolbar
      canUndo
      canRedo
      micDisabled={false}
      listPanelOpen={false}
      {...handlers}
      {...props}
    />,
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
      'List controls',
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
      'List controls',
    ])
      await fireEvent.press(screen.getByLabelText(label));
    for (const fn of Object.values(handlers)) expect(fn).toHaveBeenCalledTimes(1);
  });

  it('labels the list button and gives it its hint', async () => {
    await renderBar();
    const button = screen.getByLabelText('List controls');
    expect(button.props.accessibilityHint).toBe('Shows list buttons in place of the keyboard.');
    expect(disabled('List controls')).toBe(false);
    expect(screen.getByTestId('list-icon', { includeHiddenElements: true })).toBeTruthy();
  });

  it('is selected only while the list panel is open, and a press calls onListPanel', async () => {
    const view = await renderBar();
    expect(screen.getByLabelText('List controls').props.accessibilityHint).toBe(
      'Shows list buttons in place of the keyboard.',
    );
    expect(screen.getByLabelText('List controls').props.accessibilityState.selected).toBe(false);
    await view.rerender(
      <NoteToolbar canUndo canRedo micDisabled={false} listPanelOpen {...handlers} />,
    );
    expect(screen.getByLabelText('List controls').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('List controls').props.accessibilityHint).toBe(
      'Shows the keyboard again.',
    );
    await fireEvent.press(screen.getByLabelText('List controls'));
    expect(handlers.onListPanel).toHaveBeenCalledTimes(1);
  });

  it('has no checkbox button any more', async () => {
    await renderBar();
    expect(screen.queryByLabelText('Add checkbox')).toBeNull();
    expect(screen.queryByLabelText('Remove checkbox')).toBeNull();
  });

  it('disables undo, redo and the mic on their own flags', async () => {
    await renderBar({ canUndo: false, canRedo: false, micDisabled: true });
    expect(disabled('Undo')).toBe(true);
    expect(disabled('Redo')).toBe(true);
    expect(disabled('Record voice note')).toBe(true);
    expect(disabled('Add tags')).toBe(false);
  });

  it('locks every button when disabled', async () => {
    await renderBar({ disabled: true, listPanelOpen: true });
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
