import { fireEvent, render, screen } from '@testing-library/react-native';
import { EntryToolbar } from './EntryToolbar';

const handlers = { onUndo: jest.fn(), onRedo: jest.fn(), onMic: jest.fn(), onTags: jest.fn() };
const renderBar = (props: Partial<Parameters<typeof EntryToolbar>[0]> = {}) =>
  render(<EntryToolbar canUndo canRedo micDisabled={false} {...handlers} {...props} />);
const disabled = (label: string) => screen.getByLabelText(label).props.accessibilityState.disabled;

beforeEach(() => jest.clearAllMocks());

describe('EntryToolbar', () => {
  it('renders four labeled buttons in order', async () => {
    await renderBar();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Undo', 'Redo', 'Record voice note', 'Add tags']);
  });

  it('shows the waveform icon on the voice note button', async () => {
    await renderBar();
    expect(screen.getByTestId('waveform-icon')).toBeTruthy();
  });

  it('calls the handlers', async () => {
    await renderBar();
    for (const label of ['Undo', 'Redo', 'Record voice note', 'Add tags'])
      await fireEvent.press(screen.getByLabelText(label));
    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
    expect(handlers.onRedo).toHaveBeenCalledTimes(1);
    expect(handlers.onMic).toHaveBeenCalledTimes(1);
    expect(handlers.onTags).toHaveBeenCalledTimes(1);
  });

  it('disables undo and redo when there is nothing to do, and ignores presses', async () => {
    await renderBar({ canUndo: false, canRedo: false });
    expect(disabled('Undo')).toBe(true);
    expect(disabled('Redo')).toBe(true);
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(handlers.onUndo).not.toHaveBeenCalled();
  });

  it('disables the mic on its own flag', async () => {
    await renderBar({ micDisabled: true });
    expect(disabled('Record voice note')).toBe(true);
    expect(disabled('Add tags')).toBe(false);
  });

  it('locks everything while disabled (saving)', async () => {
    await renderBar({ disabled: true });
    for (const label of ['Undo', 'Redo', 'Record voice note', 'Add tags'])
      expect(disabled(label)).toBe(true);
  });
});
