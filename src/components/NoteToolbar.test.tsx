import { fireEvent, render, screen } from '@testing-library/react-native';
import { NoteToolbar } from './NoteToolbar';

const handlers = {
  onUndo: jest.fn(),
  onRedo: jest.fn(),
  onMic: jest.fn(),
  onTags: jest.fn(),
  onCheckbox: jest.fn(),
};
const renderBar = (props: Partial<Parameters<typeof NoteToolbar>[0]> = {}) =>
  render(
    <NoteToolbar
      canUndo
      canRedo
      micDisabled={false}
      checkboxAction="add"
      {...handlers}
      {...props}
    />,
  );
const disabled = (label: string) => screen.getByLabelText(label).props.accessibilityState.disabled;

beforeEach(() => jest.clearAllMocks());

describe('NoteToolbar', () => {
  it('renders five labeled buttons in order', async () => {
    await renderBar();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Undo', 'Redo', 'Record voice note', 'Add tags', 'Add checkbox']);
  });

  it('shows the waveform icon on the voice note button', async () => {
    await renderBar();
    expect(screen.getByTestId('waveform-icon')).toBeTruthy();
  });

  it('calls the handlers', async () => {
    await renderBar();
    for (const label of ['Undo', 'Redo', 'Record voice note', 'Add tags', 'Add checkbox'])
      await fireEvent.press(screen.getByLabelText(label));
    for (const fn of Object.values(handlers)) expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['check', 'Check item'],
    ['uncheck', 'Uncheck item'],
    ['add', 'Add checkbox'],
  ] as const)('labels the checkbox button for %s', async (action, label) => {
    await renderBar({ checkboxAction: action });
    expect(screen.getByLabelText(label)).toBeTruthy();
    expect(disabled(label)).toBe(false);
  });

  it('disables the checkbox button for none and does not call the handler', async () => {
    await renderBar({ checkboxAction: 'none' });
    expect(disabled('Add checkbox')).toBe(true);
    await fireEvent.press(screen.getByLabelText('Add checkbox'));
    expect(handlers.onCheckbox).not.toHaveBeenCalled();
  });

  it('disables undo, redo and the mic on their own flags', async () => {
    await renderBar({ canUndo: false, canRedo: false, micDisabled: true });
    expect(disabled('Undo')).toBe(true);
    expect(disabled('Redo')).toBe(true);
    expect(disabled('Record voice note')).toBe(true);
    expect(disabled('Add tags')).toBe(false);
  });

  it('locks every button when disabled', async () => {
    await renderBar({ disabled: true, checkboxAction: 'check' });
    for (const b of screen.getAllByRole('button'))
      expect(b.props.accessibilityState.disabled).toBe(true);
  });

  it('has no indent or outdent button', async () => {
    await renderBar();
    expect(screen.queryByLabelText('Indent')).toBeNull();
    expect(screen.queryByLabelText('Outdent')).toBeNull();
  });
});
