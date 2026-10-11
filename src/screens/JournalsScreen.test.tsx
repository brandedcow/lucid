import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
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

  describe('renaming a custom journal', () => {
    const gratitude: Journal = { id: 'j_g', name: 'Gratitude', kind: 'journal' };
    const travel: Journal = { id: 'j_t', name: 'Travel', kind: 'journal' };
    const all = [...BUILT_IN_JOURNALS, gratitude, travel];
    const counts = { dreams: 12, life: 5, j_g: 3, j_t: 1 };
    const hidden = { includeHiddenElements: true };
    const both = { onRenameJournal: jest.fn(), onDeleteJournal: jest.fn() };

    it('gives custom cards two actions, Rename before Delete', async () => {
      await setup({ journals: all, counts, ...both });
      const labels = screen
        .getAllByRole('button', hidden)
        .map((b) => b.props.accessibilityLabel as string)
        .filter((l) => /^(Rename|Delete) Gratitude$/.test(l ?? ''));
      expect(labels).toEqual(['Rename Gratitude', 'Delete Gratitude']);
      expect(screen.getAllByText('Rename', hidden)).toHaveLength(2);
    });

    it('exposes rename and delete screen-reader actions on custom cards only', async () => {
      await setup({ journals: all, counts, ...both });
      expect(
        screen.getByRole('button', { name: 'Gratitude, 3 entries' }).props.accessibilityActions,
      ).toEqual([
        { name: 'rename', label: 'Rename' },
        { name: 'delete', label: 'Delete' },
      ]);
      for (const n of ['Dreams, 12 dreams', 'Life, 5 entries']) {
        expect(screen.getByRole('button', { name: n }).props.accessibilityActions).toBeUndefined();
      }
    });

    it('keeps built-in cards plain', async () => {
      await setup({ journals: all, counts, ...both });
      expect(screen.queryByLabelText('Rename Dreams', hidden)).toBeNull();
      expect(screen.queryByLabelText('Rename Life', hidden)).toBeNull();
      expect(screen.queryByTestId('journal-row-dreams')).toBeNull();
    });

    it('calls onRenameJournal with the id from the button and the screen-reader action', async () => {
      const onRenameJournal = jest.fn();
      const onDeleteJournal = jest.fn();
      await setup({ journals: all, counts, onRenameJournal, onDeleteJournal });
      await fireEvent.press(screen.getByLabelText('Rename Travel', hidden));
      expect(onRenameJournal).toHaveBeenLastCalledWith('j_t');
      await act(async () => {
        screen
          .getByRole('button', { name: 'Gratitude, 3 entries' })
          .props.onAccessibilityAction({ nativeEvent: { actionName: 'rename' } });
      });
      expect(onRenameJournal).toHaveBeenLastCalledWith('j_g');
      expect(onDeleteJournal).not.toHaveBeenCalled();
    });

    it('offers only Rename when there is no delete handler', async () => {
      await setup({ journals: all, counts, onRenameJournal: jest.fn() });
      expect(screen.getByLabelText('Rename Travel', hidden)).toBeTruthy();
      expect(screen.queryByLabelText('Delete Travel', hidden)).toBeNull();
    });

    it('the deleting card and every other card offer no usable actions', async () => {
      const onRenameJournal = jest.fn();
      await setup({
        journals: all,
        counts,
        deletingId: 'j_g',
        onRenameJournal,
        onDeleteJournal: jest.fn(),
      });
      expect(
        screen.getByRole('button', { name: 'Gratitude, deleting' }).props.accessibilityActions,
      ).toBeUndefined();
      await fireEvent.press(screen.getByLabelText('Rename Gratitude', hidden));
      await fireEvent.press(screen.getByLabelText('Rename Travel', hidden));
      expect(onRenameJournal).not.toHaveBeenCalled();
      expect(screen.getByTestId('journal-row-j_g').props.enabled).toBe(false);
    });
  });

  describe('deleting a custom journal', () => {
    const gratitude: Journal = { id: 'j_g', name: 'Gratitude', kind: 'journal' };
    const travel: Journal = { id: 'j_t', name: 'Travel', kind: 'journal' };
    const all = [...BUILT_IN_JOURNALS, gratitude, travel];
    const counts = { dreams: 12, life: 5, j_g: 3, j_t: 1 };
    const hidden = { includeHiddenElements: true };

    it('puts a Delete action on custom cards only', async () => {
      await setup({ journals: all, counts, onDeleteJournal: jest.fn() });
      expect(screen.getByLabelText('Delete Gratitude', hidden)).toBeOnTheScreen();
      expect(screen.getByLabelText('Delete Travel', hidden)).toBeOnTheScreen();
      expect(screen.queryByLabelText('Delete Dreams', hidden)).toBeNull();
      expect(screen.queryByLabelText('Delete Life', hidden)).toBeNull();
      expect(screen.queryByTestId('journal-row-dreams')).toBeNull();
      expect(screen.queryByTestId('journal-row-life')).toBeNull();
      expect(screen.getByTestId('journal-row-j_g')).toBeTruthy();
    });

    it('has no Delete action at all without onDeleteJournal', async () => {
      await setup({ journals: all, counts });
      expect(screen.queryByLabelText('Delete Gratitude', hidden)).toBeNull();
    });

    it('never offers Delete for a built-in id even if handed one', async () => {
      await setup({ journals: BUILT_IN_JOURNALS, onDeleteJournal: jest.fn() });
      expect(screen.queryByText('Delete', hidden)).toBeNull();
    });

    it('calls onDeleteJournal with the journal id', async () => {
      const onDeleteJournal = jest.fn();
      await setup({ journals: all, counts, onDeleteJournal });
      await fireEvent.press(screen.getByLabelText('Delete Travel', hidden));
      expect(onDeleteJournal).toHaveBeenCalledTimes(1);
      expect(onDeleteJournal).toHaveBeenCalledWith('j_t');
    });

    it('exposes a screen-reader delete action on custom cards only', async () => {
      await setup({ journals: all, counts, onDeleteJournal: jest.fn() });
      const custom = screen.getByRole('button', { name: 'Gratitude, 3 entries' });
      expect(custom.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);
      expect(
        screen.getByRole('button', { name: 'Dreams, 12 dreams' }).props.accessibilityActions,
      ).toBeUndefined();
    });

    it('routes the screen-reader delete action to onDeleteJournal', async () => {
      const onDeleteJournal = jest.fn();
      await setup({ journals: all, counts, onDeleteJournal });
      const custom = screen.getByRole('button', { name: 'Gratitude, 3 entries' });
      await act(async () => {
        custom.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } });
      });
      expect(onDeleteJournal).toHaveBeenCalledWith('j_g');
    });

    it('a tap on a custom card still opens it', async () => {
      const { onOpenJournal } = await setup({ journals: all, counts, onDeleteJournal: jest.fn() });
      await fireEvent.press(screen.getByRole('button', { name: 'Gratitude, 3 entries' }));
      expect(onOpenJournal).toHaveBeenCalledWith('j_g');
    });

    describe('while one is being deleted', () => {
      const props = { journals: all, counts, deletingId: 'j_g' };

      it('greys the card, labels it and replaces the count line', async () => {
        await setup({ ...props, onDeleteJournal: jest.fn() });
        const card = screen.getByRole('button', { name: 'Gratitude, deleting' });
        expect(StyleSheet.flatten(card.props.style).opacity).toBe(0.45);
        expect(screen.getByText('Deleting...')).toBeOnTheScreen();
        expect(screen.queryByText('3 entries')).toBeNull();
        // Others are unchanged.
        expect(screen.getByRole('button', { name: 'Travel, 1 entry' })).toBeOnTheScreen();
        expect(
          StyleSheet.flatten(screen.getByRole('button', { name: 'Travel, 1 entry' }).props.style)
            .opacity,
        ).toBeUndefined();
      });

      it('makes the deleting card unopenable and its Delete inert', async () => {
        const onDeleteJournal = jest.fn();
        const { onOpenJournal } = await setup({ ...props, onDeleteJournal });
        await fireEvent.press(screen.getByRole('button', { name: 'Gratitude, deleting' }));
        expect(onOpenJournal).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByLabelText('Delete Gratitude', hidden));
        expect(onDeleteJournal).not.toHaveBeenCalled();
        expect(
          screen.getByRole('button', { name: 'Gratitude, deleting' }).props.accessibilityActions,
        ).toBeUndefined();
      });

      it('locks every custom card: no swiping, no Delete, no screen-reader actions', async () => {
        const onDeleteJournal = jest.fn();
        const { onOpenJournal } = await setup({ ...props, onDeleteJournal });
        expect(screen.getByTestId('journal-row-j_g').props.enabled).toBe(false);
        expect(screen.getByTestId('journal-row-j_t').props.enabled).toBe(false);
        await fireEvent.press(screen.getByLabelText('Delete Travel', hidden));
        expect(onDeleteJournal).not.toHaveBeenCalled();
        const other = screen.getByRole('button', { name: 'Travel, 1 entry' });
        expect(other.props.accessibilityActions).toBeUndefined();
        // Opening another journal is still allowed.
        await fireEvent.press(other);
        expect(onOpenJournal).toHaveBeenCalledWith('j_t');
      });

      it('allows swiping again when nothing is deleting', async () => {
        await setup({ journals: all, counts, onDeleteJournal: jest.fn(), deletingId: null });
        expect(screen.getByTestId('journal-row-j_g').props.enabled).toBe(true);
      });
    });
  });
});
