import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ShareIcon, TrashIcon } from './VoiceNoteIcons';

// The icons hide their descendants from accessibility, so queries must include hidden elements.
const node = (id: string) => screen.getByTestId(id, { hidden: true });
const style = (id: string) => StyleSheet.flatten(node(id).props.style);

describe('ShareIcon', () => {
  it('draws a box and an arrow in the given color, hidden from accessibility', async () => {
    await render(<ShareIcon color="#123456" />);
    const root = node('share-icon');
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props.accessible).toBe(false);
    expect(style('share-box').borderColor).toBe('#123456');
    expect(style('share-arrow-shaft').backgroundColor).toBe('#123456');
    expect(style('share-arrow-head').borderColor).toBe('#123456');
  });

  it('defaults to 28', async () => {
    await render(<ShareIcon color="#000" />);
    expect(style('share-icon').width).toBe(28);
  });

  it('scales with size', async () => {
    await render(<ShareIcon color="#000" size={56} />);
    expect(style('share-icon').width).toBe(56);
    expect(style('share-arrow-shaft').height).toBe(32);
  });
});

describe('TrashIcon', () => {
  it('draws a handle, lid, body and three lines in the given color, hidden from accessibility', async () => {
    await render(<TrashIcon color="#abcdef" />);
    const root = node('trash-icon');
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props.accessible).toBe(false);
    expect(style('trash-handle').borderColor).toBe('#abcdef');
    expect(style('trash-lid').backgroundColor).toBe('#abcdef');
    expect(style('trash-body').borderColor).toBe('#abcdef');
    const lines = screen.getAllByTestId('trash-line', { hidden: true });
    expect(lines).toHaveLength(3);
    for (const l of lines)
      expect(StyleSheet.flatten(l.props.style).backgroundColor).toBe('#abcdef');
  });

  it.each([22, 28, 56])('centres the three lines on the body at size %i', async (size) => {
    await render(<TrashIcon color="#000" size={size} />);
    const body = style('trash-body');
    const bodyCentre = (body.left as number) + (body.width as number) / 2;
    const centres = screen
      .getAllByTestId('trash-line', { hidden: true })
      .map((l) => StyleSheet.flatten(l.props.style))
      .map((st) => (st.left as number) + (st.width as number) / 2);
    expect(centres[1]).toBeCloseTo(bodyCentre);
    expect(centres[1] - centres[0]).toBeCloseTo(centres[2] - centres[1]);
    expect(style('trash-icon').width).toBe(size);
  });

  it('scales with size', async () => {
    await render(<TrashIcon color="#000" size={56} />);
    expect(style('trash-icon').height).toBe(56);
    expect(style('trash-lid').width).toBe(40);
  });
});
