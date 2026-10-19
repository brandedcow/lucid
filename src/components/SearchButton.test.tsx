import { fireEvent, render, screen } from '@testing-library/react-native';
import { SearchButton } from './SearchButton';

describe('SearchButton', () => {
  it('is a labelled 44pt button that calls onPress', async () => {
    const onPress = jest.fn();
    await render(<SearchButton onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Search notes' });
    expect(button.props.style).toEqual(expect.objectContaining({ width: 44, height: 44 }));
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
