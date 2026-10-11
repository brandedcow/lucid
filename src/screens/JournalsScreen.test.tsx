import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BUILT_IN_JOURNALS, type Journal } from '../utils/journals';
import { JournalsScreen } from './JournalsScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

type Props = Partial<Parameters<typeof JournalsScreen>[0]>;

async function setup(props: Props = {}) {
  const onOpenJournal = jest.fn();
  const onSearch = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <JournalsScreen
        journals={BUILT_IN_JOURNALS}
        counts={{ dreams: 12, life: 5 }}
        onOpenJournal={onOpenJournal}
        onSearch={onSearch}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return { onOpenJournal, onSearch };
}

describe('JournalsScreen', () => {
  it('shows the header and Dreams before Life', async () => {
    await setup();
    expect(screen.getByRole('header', { name: 'Journals' })).toBeOnTheScreen();
    const cards = screen
      .getAllByRole('button')
      .filter((b) =>
        /^(Dreams|Life)/.test(b.props['aria-label'] ?? b.props.accessibilityLabel ?? ''),
      );
    expect(cards).toHaveLength(2);
    expect(screen.getByLabelText(/^Dreams/)).toBe(cards[0]);
    expect(screen.getByLabelText(/^Life/)).toBe(cards[1]);
  });

  it('shows plural counts', async () => {
    await setup();
    expect(screen.getByText('12 dreams')).toBeOnTheScreen();
    expect(screen.getByText('5 entries')).toBeOnTheScreen();
  });

  it('shows singular counts', async () => {
    await setup({ counts: { dreams: 1, life: 1 } });
    expect(screen.getByText('1 dream')).toBeOnTheScreen();
    expect(screen.getByText('1 entry')).toBeOnTheScreen();
  });

  it('shows the empty wording at zero', async () => {
    await setup({ counts: { dreams: 0, life: 0 } });
    expect(screen.getByText('No dreams yet')).toBeOnTheScreen();
    expect(screen.getByText('No entries yet')).toBeOnTheScreen();
  });

  it('shows no count line while counts are unknown, and the cards stay usable', async () => {
    const { onOpenJournal } = await setup({ counts: null });
    expect(screen.queryByText(/\d|yet/)).toBeNull();
    expect(screen.getByLabelText('Dreams')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Life'));
    expect(onOpenJournal).toHaveBeenCalledWith('life');
  });

  it('labels the cards with name and count', async () => {
    await setup();
    expect(screen.getByRole('button', { name: 'Dreams, 12 dreams' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Life, 5 entries' })).toBeOnTheScreen();
  });

  it('shows the unreadable message, hides counts and keeps the cards tappable', async () => {
    const { onOpenJournal } = await setup({ unreadable: true });
    expect(
      screen.getByText('Your saved entries could not be read. Your recordings are safe.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('12 dreams')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Dreams'));
    expect(onOpenJournal).toHaveBeenCalledWith('dreams');
  });

  it('does not show the unreadable message normally', async () => {
    await setup();
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });

  it('opens the pressed journal', async () => {
    const { onOpenJournal } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Dreams, 12 dreams' }));
    expect(onOpenJournal).toHaveBeenLastCalledWith('dreams');
    await fireEvent.press(screen.getByRole('button', { name: 'Life, 5 entries' }));
    expect(onOpenJournal).toHaveBeenLastCalledWith('life');
    expect(onOpenJournal).toHaveBeenCalledTimes(2);
  });

  it('calls onSearch from the search button', async () => {
    const { onSearch } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Search all journals' }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('has no back button', async () => {
    await setup();
    expect(screen.queryByLabelText(/back/i)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('shows no back arrow without onBack', async () => {
    await setup();
    expect(screen.queryByLabelText('Back to Today')).toBeNull();
  });

  it('shows "Back to Today" and calls onBack when given', async () => {
    const onBack = jest.fn();
    await setup({ onBack });
    await fireEvent.press(screen.getByLabelText('Back to Today'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a card for a custom journal after Dreams and Life, same look, and opens it', async () => {
    const gratitude: Journal = { id: 'j_g', name: 'Gratitude', kind: 'journal' };
    const { onOpenJournal } = await setup({
      journals: [...BUILT_IN_JOURNALS, gratitude],
      counts: { dreams: 12, life: 5, j_g: 3 },
    });
    const names = screen
      .getAllByRole('button')
      .map((b) => b.props['aria-label'] ?? b.props.accessibilityLabel ?? '')
      .filter((l: string) => /^(Dreams|Life|Gratitude)/.test(l));
    expect(names).toEqual(['Dreams, 12 dreams', 'Life, 5 entries', 'Gratitude, 3 entries']);
    await fireEvent.press(screen.getByRole('button', { name: 'Gratitude, 3 entries' }));
    expect(onOpenJournal).toHaveBeenCalledWith('j_g');
  });

  it('shows the empty wording for a custom journal with no entries', async () => {
    await setup({
      journals: [...BUILT_IN_JOURNALS, { id: 'j_g', name: 'Gratitude', kind: 'journal' }],
      counts: { dreams: 1, life: 1, j_g: 0 },
    });
    expect(screen.getByRole('button', { name: 'Gratitude, No entries yet' })).toBeOnTheScreen();
  });
});
