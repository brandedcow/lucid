import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { KeyboardHideIcon } from './KeyboardHideIcon';

// The icon hides itself from the accessibility tree, so queries must include hidden elements.
const opts = { includeHiddenElements: true };

describe('KeyboardHideIcon', () => {
  it('draws keys and a chevron in the given color', async () => {
    await render(<KeyboardHideIcon color="#123456" />);
    expect(screen.getByTestId('keyboard-hide-icon', opts)).toBeTruthy();
    for (const key of screen.getAllByTestId('keyboard-hide-key', opts))
      expect(StyleSheet.flatten(key.props.style).backgroundColor).toBe('#123456');
    expect(
      StyleSheet.flatten(screen.getByTestId('keyboard-hide-chevron', opts).props.style),
    ).toEqual(expect.objectContaining({ borderColor: '#123456' }));
  });

  it('takes its size from the size prop', async () => {
    await render(<KeyboardHideIcon color="#000" size={56} />);
    const style = StyleSheet.flatten(screen.getByTestId('keyboard-hide-icon', opts).props.style);
    expect(style.width).toBe(56);
    expect(style.height).toBe(56);
  });

  it('is hidden from screen readers', async () => {
    await render(<KeyboardHideIcon color="#000" />);
    const icon = screen.getByTestId('keyboard-hide-icon', opts);
    expect(icon.props.accessible).toBe(false);
    expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
