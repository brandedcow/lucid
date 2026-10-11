import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { OutlinedChips } from './OutlinedChips';

describe('OutlinedChips', () => {
  it('renders nothing without chips', async () => {
    await render(<OutlinedChips chips={[]} />);
    expect(screen.queryByTestId('outlined-chips')).toBeNull();
  });

  it('shows every chip in order, with no +N overflow', async () => {
    const chips = [
      { kind: 'emotion' as const, label: 'Uneasy' },
      { kind: 'emotion' as const, label: 'Curious' },
      ...Array.from({ length: 12 }, (_, i) => ({ kind: 'tag' as const, label: `tag${i}` })),
    ];
    await render(<OutlinedChips chips={chips} />);
    const shown = screen.getAllByText(/./).map((n) => n.props.children);
    expect(shown).toEqual(chips.map((c) => c.label));
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it('wraps and outlines each chip', async () => {
    await render(<OutlinedChips chips={[{ kind: 'tag', label: 'water' }]} />);
    expect(StyleSheet.flatten(screen.getByTestId('outlined-chips').props.style).flexWrap).toBe(
      'wrap',
    );
    const chip = screen.getByText('water').parent!;
    const style = StyleSheet.flatten(chip.props.style);
    expect(style.borderWidth).toBe(1);
    expect(style.backgroundColor).toBeUndefined();
  });
});
