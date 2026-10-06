import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import { DreamChips } from './DreamChips';

const chips = [
  { kind: 'emotion' as const, label: 'Uneasy' },
  { kind: 'emotion' as const, label: 'Curious' },
  { kind: 'tag' as const, label: 'water' },
  { kind: 'tag' as const, label: 'stairs' },
];

const flat = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as object) as Record<string, unknown>;

describe('DreamChips', () => {
  it('renders nothing when there is nothing to show', async () => {
    await render(<DreamChips chips={[]} />);
    expect(screen.queryByTestId('dream-chips')).toBeNull();
  });

  it('styles emotion and tag chips differently', async () => {
    await render(<DreamChips chips={chips} />);
    const emotion = screen.getByText('Uneasy');
    const tag = screen.getByText('water');
    expect(flat(emotion).color).toBe(colors.emotionChipText);
    expect(flat(emotion.parent as never).backgroundColor).toBe(colors.emotionChipBg);
    expect(flat(tag).color).toBe(colors.muted);
    expect(flat(tag.parent as never).backgroundColor).toBe(colors.tagChipBg);
  });

  it('is one accessible element with a combined label', async () => {
    await render(<DreamChips chips={chips} />);
    const group = screen.getByTestId('dream-chips');
    expect(group.props.accessible).toBe(true);
    expect(group.props.accessibilityLabel).toBe('Feelings: Uneasy, Curious. Tags: water, stairs.');
  });

  it('omits the empty part of the label', async () => {
    await render(<DreamChips chips={[chips[2]]} />);
    expect(screen.getByTestId('dream-chips').props.accessibilityLabel).toBe('Tags: water.');
    await screen.rerender(<DreamChips chips={[chips[0]]} />);
    expect(screen.getByTestId('dream-chips').props.accessibilityLabel).toBe('Feelings: Uneasy.');
  });

  it('shows a +N chip and mentions it in the label', async () => {
    await render(<DreamChips chips={chips.slice(0, 2)} overflow={3} />);
    expect(screen.getByText('+3')).toBeTruthy();
    expect(screen.getByTestId('dream-chips').props.accessibilityLabel).toBe(
      'Feelings: Uneasy, Curious. 3 more.',
    );
  });

  it('shows no +N chip when overflow is 0', async () => {
    await render(<DreamChips chips={chips} overflow={0} />);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('wraps onto more lines', async () => {
    await render(<DreamChips chips={chips} />);
    expect(flat(screen.getByTestId('dream-chips')).flexWrap).toBe('wrap');
  });
});
