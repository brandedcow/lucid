import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';
import { EmotionInput } from './EmotionInput';

function Harness({
  suggestions = [],
  initial = [],
  disabled,
}: {
  suggestions?: string[];
  initial?: string[];
  disabled?: boolean;
}) {
  const [emotions, setEmotions] = useState(initial);
  const [draft, setDraft] = useState('');
  return (
    <>
      <EmotionInput
        emotions={emotions}
        onEmotionsChange={setEmotions}
        draft={draft}
        onDraftChange={setDraft}
        suggestions={suggestions}
        disabled={disabled}
      />
      <Text testID="list">{emotions.join('|')}</Text>
    </>
  );
}

const input = () => screen.getByPlaceholderText('Add an emotion...');
const list = () => screen.getByTestId('list').props.children;
const submit = async (text: string) => {
  await fireEvent.changeText(input(), text);
  await fireEvent(input(), 'submitEditing');
};

describe('EmotionInput', () => {
  it('has the placeholder, a return key that says done and keeps the keyboard on submit', async () => {
    await render(<Harness />);
    expect(input().props.returnKeyType).toBe('done');
    expect(input().props.submitBehavior).toBe('submit');
  });

  it('adds a lowercase emotion on submit, shows it capitalized and clears the field', async () => {
    await render(<Harness />);
    await submit('  Calm ');
    expect(list()).toBe('calm');
    expect(screen.getByText('Calm')).toBeTruthy();
    expect(input().props.value).toBe('');
  });

  it('ignores empty text and duplicates', async () => {
    await render(<Harness initial={['calm']} />);
    await submit('  ');
    await submit('CALM');
    expect(list()).toBe('calm');
  });

  it('cuts a very long emotion to 40 characters', async () => {
    await render(<Harness />);
    await submit('x'.repeat(60));
    expect(list()).toBe('x'.repeat(40));
  });

  it('removes an emotion when its chip is tapped', async () => {
    await render(<Harness initial={['calm', 'uneasy']} />);
    await fireEvent.press(screen.getByLabelText('Remove emotion calm'));
    expect(list()).toBe('uneasy');
  });

  it('offers earlier emotions as "+ word" chips, minus the ones added', async () => {
    await render(<Harness suggestions={['calm', 'Uneasy', 'uneasy']} initial={['calm']} />);
    expect(screen.queryByText('+ calm')).toBeNull();
    await fireEvent.press(screen.getByText('+ uneasy'));
    expect(list()).toBe('calm|uneasy');
    expect(screen.queryByText('+ uneasy')).toBeNull();
  });

  it('offers at most 8 suggestions', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `w${i}`);
    await render(<Harness suggestions={many} />);
    expect(screen.getAllByText(/^\+ /)).toHaveLength(8);
  });

  it('locks the field while disabled', async () => {
    await render(<Harness disabled />);
    expect(input().props.editable).toBe(false);
  });
});
