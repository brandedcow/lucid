import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { NEW_NOTE_FAB_SIZE, NewNoteButton, listClearance } from './NewNoteButton';

describe('NewNoteButton', () => {
  it('is a labelled 56pt button that presses', async () => {
    const onPress = jest.fn();
    await render(<NewNoteButton onPress={onPress} />);
    const b = screen.getByRole('button', { name: 'New note' });
    expect(StyleSheet.flatten(b.props.style)).toMatchObject({
      width: NEW_NOTE_FAB_SIZE,
      height: NEW_NOTE_FAB_SIZE,
    });
    await fireEvent.press(b);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not press when disabled', async () => {
    const onPress = jest.fn();
    await render(<NewNoteButton onPress={onPress} disabled />);
    const b = screen.getByRole('button', { name: 'New note' });
    expect(b.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(b);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('sits above the bottom inset', async () => {
    await render(<NewNoteButton onPress={jest.fn()} bottomInset={34} />);
    expect(StyleSheet.flatten(screen.getByRole('button').props.style).bottom).toBe(34 + 16);
  });

  it('listClearance clears the button', async () => {
    expect(NEW_NOTE_FAB_SIZE).toBe(56);
    expect(listClearance(0)).toBe(16 + 56 + 24);
    expect(listClearance(34)).toBe(34 + 16 + 56 + 24);
  });
});
