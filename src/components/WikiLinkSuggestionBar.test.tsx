import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { WikiLinkSuggestionBar } from './WikiLinkSuggestionBar';

const entry = (id: string, title: string) => ({
  key: title.toLowerCase(),
  id,
  title,
  updatedAt: undefined,
});

describe('WikiLinkSuggestionBar', () => {
  it('renders nothing when there are no matches', async () => {
    await render(<WikiLinkSuggestionBar matches={[]} onPick={jest.fn()} />);
    expect(screen.queryByTestId('wikilink-suggestions')).toBeNull();
  });

  it('shows one button row per title, labelled with the title', async () => {
    await render(
      <WikiLinkSuggestionBar
        matches={[entry('a', 'Alpha'), entry('b', 'Beta')]}
        onPick={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Alpha').props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('Beta')).toBeTruthy();
  });

  it('rows are at least 44 pt and at most four are visible', async () => {
    await render(
      <WikiLinkSuggestionBar
        matches={[entry('a', 'Alpha'), entry('b', 'Beta')]}
        onPick={jest.fn()}
      />,
    );
    const row = StyleSheet.flatten(screen.getByLabelText('Alpha').props.style);
    expect(row.minHeight).toBeGreaterThanOrEqual(44);
    const bar = StyleSheet.flatten(screen.getByTestId('wikilink-suggestions').props.style);
    expect(bar.maxHeight).toBe(176);
  });

  it('tapping reports the entry and keeps the keyboard open', async () => {
    const onPick = jest.fn();
    const beta = entry('b', 'Beta');
    await render(<WikiLinkSuggestionBar matches={[entry('a', 'Alpha'), beta]} onPick={onPick} />);
    expect(screen.getByTestId('wikilink-suggestions').props.keyboardShouldPersistTaps).toBe(
      'always',
    );
    await fireEvent.press(screen.getByLabelText('Beta'));
    expect(onPick).toHaveBeenCalledWith(beta);
  });
});
