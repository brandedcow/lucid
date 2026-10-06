import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';
import { EmotionChips } from './EmotionChips';

function Harness({ known, initial = '' }: { known: string[]; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <EmotionChips known={known} value={value} onChange={setValue} />
      <Text testID="field">{value}</Text>
    </>
  );
}

const field = () => screen.getByTestId('field').props.children;

describe('EmotionChips', () => {
  it('shows nothing when no emotion has been used before', async () => {
    await render(<Harness known={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows known words capitalized, and no preset feelings', async () => {
    await render(<Harness known={['calm', 'uneasy']} />);
    expect(screen.getByText('Calm')).toBeTruthy();
    expect(screen.getByText('Uneasy')).toBeTruthy();
    expect(screen.queryByText('Afraid')).toBeNull();
    expect(screen.queryByText('Joyful')).toBeNull();
  });

  it('appends the lowercase word on tap and removes it on a second tap', async () => {
    await render(<Harness known={['calm', 'uneasy']} />);
    await fireEvent.press(screen.getByText('Calm'));
    expect(field()).toBe('calm');
    await fireEvent.press(screen.getByText('Uneasy'));
    expect(field()).toBe('calm, uneasy');
    await fireEvent.press(screen.getByText('Calm'));
    expect(field()).toBe('uneasy');
  });

  it('marks a word already in the field as selected', async () => {
    await render(<Harness known={['calm', 'uneasy']} initial="Calm" />);
    expect(screen.getByRole('button', { name: 'Calm' }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByText('Uneasy')).toBeTruthy();
  });

  it('narrows to words that start like the word being typed', async () => {
    await render(<Harness known={['calm', 'curious', 'afraid']} initial="ca" />);
    expect(screen.getByText('Calm')).toBeTruthy();
    expect(screen.queryByText('Afraid')).toBeNull();
    expect(screen.queryByText('Curious')).toBeNull();
  });

  it('shows at most 8 chips', async () => {
    const known = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j0'];
    await render(<Harness known={known} />);
    expect(screen.getAllByRole('button')).toHaveLength(8);
  });
});
