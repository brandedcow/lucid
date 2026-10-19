import { fireEvent, render, screen } from '@testing-library/react-native';
import { TagSuggestionBar } from './TagSuggestionBar';

describe('TagSuggestionBar', () => {
  it('renders nothing when there are no matches', async () => {
    await render(<TagSuggestionBar matches={[]} onPick={jest.fn()} />);
    expect(screen.queryByTestId('tag-suggestions')).toBeNull();
  });

  it('shows one pill per match, with a # prefix and a button label', async () => {
    await render(<TagSuggestionBar matches={['sleep', 'flying']} onPick={jest.fn()} />);
    expect(screen.getByTestId('tag-suggestions')).toBeTruthy();
    expect(screen.getByText('#sleep')).toBeTruthy();
    expect(screen.getByText('#flying')).toBeTruthy();
    expect(screen.getByLabelText('Tag #sleep')).toBeTruthy();
    expect(screen.getByLabelText('Tag #flying')).toBeTruthy();
  });

  it('tapping a pill reports that tag without the #', async () => {
    const onPick = jest.fn();
    await render(<TagSuggestionBar matches={['sleep', 'flying']} onPick={onPick} />);
    await fireEvent.press(screen.getByLabelText('Tag #flying'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('flying');
  });

  it('keeps the keyboard open on taps', async () => {
    await render(<TagSuggestionBar matches={['a']} onPick={jest.fn()} />);
    expect(screen.getByTestId('tag-suggestions').props.keyboardShouldPersistTaps).toBe('always');
  });
});
