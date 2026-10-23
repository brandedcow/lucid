import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { NEW_NOTE_FAB_SIZE } from './NewNoteButton';
import { RecordFab, recordFabClearance } from './RecordFab';

describe('RecordFab', () => {
  it('is a labelled 56pt button that presses', async () => {
    const onPress = jest.fn();
    await render(<RecordFab onPress={onPress} />);
    const b = screen.getByRole('button', { name: 'Record voice note' });
    expect(b.props.accessibilityHint).toBe('Starts a voice note.');
    expect(screen.getByTestId('record-fab')).toBe(b);
    expect(StyleSheet.flatten(b.props.style)).toMatchObject({
      width: NEW_NOTE_FAB_SIZE,
      height: NEW_NOTE_FAB_SIZE,
      position: 'absolute',
      right: 24,
    });
    await fireEvent.press(b);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sits 16pt above the bottom inset', async () => {
    await render(<RecordFab onPress={jest.fn()} bottomInset={34} />);
    expect(StyleSheet.flatten(screen.getByRole('button').props.style).bottom).toBe(34 + 16);
  });

  it('shows the waveform, hidden from screen readers', async () => {
    await render(<RecordFab onPress={jest.fn()} />);
    const icon = screen.getByTestId('waveform-icon', { includeHiddenElements: true });
    expect(icon).toBeTruthy();
    expect(screen.queryByTestId('waveform-icon')).toBeNull();
  });

  it('clearance is its offset plus its size', () => {
    expect(recordFabClearance).toBe(16 + 56);
  });
});
