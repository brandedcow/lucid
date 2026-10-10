import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogView, useLogView } from '../hooks/useLogView';
import { Dream } from '../types/dream';
import { SearchIcon } from '../components/SearchIcon';
import { SearchScreen } from './SearchScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

const mk = (id: string, createdAt: string, over: Partial<Dream> = {}): Dream => ({
  id,
  createdAt,
  durationMs: 0,
  title: id,
  tags: [],
  ...over,
});

const RECORDS: Dream[] = [
  mk('Old river', '2026-08-02T10:00:00', { transcript: 'a river of water', tags: ['water'] }),
  mk('Legacy flight', '2026-09-20T10:00:00', { transcript: 'flying over water', tags: ['flying'] }),
  mk('Beach walk', '2026-10-05T10:00:00', {
    journalId: 'life',
    transcript: 'walked by the water',
    tags: ['water', 'walk'],
  }),
  mk('Quiet day', '2026-09-25T10:00:00', { journalId: 'life', tags: ['walk'] }),
  mk('Draft dream', '2026-10-09T10:00:00', { status: 'draft', tags: ['water'] }),
  mk('Draft life', '2026-10-08T10:00:00', { status: 'draft', journalId: 'life' }),
  mk('Zen sit', '2026-10-07T10:00:00', { journalId: 'zen', tags: ['water'] }),
  mk('Untitled life', '2026-10-03T10:00:00', { journalId: 'life', title: '', tags: ['walk'] }),
];

async function setup(records: Dream[] | null = RECORDS, status: 'ok' | 'unreadable' = 'ok') {
  const onBack = jest.fn();
  const onOpenDream = jest.fn();
  const view: { current: LogView } = { current: undefined as unknown as LogView };
  function Harness() {
    const logView = useLogView();
    view.current = logView;
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <SearchScreen
          records={records}
          indexStatus={status}
          view={logView}
          onBack={onBack}
          onOpenDream={onOpenDream}
        />
      </SafeAreaProvider>
    );
  }
  await render(<Harness />);
  const update = async (fn: (v: LogView) => void) => {
    await act(async () => fn(view.current));
  };
  return { onBack, onOpenDream, view, update };
}

const SEARCH = 'Search all journals';
const rowLabels = () =>
  screen
    .queryAllByRole('button')
    .map((b) => b.props.accessibilityLabel as string)
    .filter((l) => /\. (Dreams|Life)$/.test(l ?? ''));

beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 9, 10, 12, 0),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'performance',
      'queueMicrotask',
    ],
  });
});
afterAll(() => jest.useRealTimers());
afterEach(() => jest.restoreAllMocks());

describe('SearchScreen results', () => {
  it('shows finished entries of Dreams, Life and legacy records, mixed, newest first, by month', async () => {
    await setup();
    const labels = rowLabels();
    expect(labels).toHaveLength(5);
    // Untitled life has no title, so its row starts with the short date.
    const starts = ['Beach walk', 'Oct 3', 'Quiet day', 'Legacy flight', 'Old river'];
    starts.forEach((s, i) => expect(labels[i].startsWith(s)).toBe(true));
    expect(screen.getByText('OCTOBER')).toBeTruthy();
    expect(screen.getByText('SEPTEMBER')).toBeTruthy();
    expect(screen.getByText('AUGUST')).toBeTruthy();
  });

  it('labels each row with its journal (legacy counts as Dreams)', async () => {
    await setup();
    const labels = rowLabels();
    expect(labels.filter((l) => l.endsWith('. Life'))).toHaveLength(3);
    expect(labels.filter((l) => l.endsWith('. Dreams'))).toHaveLength(2);
    expect(screen.getAllByText('Life')).toHaveLength(3);
    expect(screen.getAllByText('Dreams')).toHaveLength(2);
  });

  it('leaves out drafts and entries of an unknown journal', async () => {
    await setup();
    expect(screen.queryByText('Draft dream')).toBeNull();
    expect(screen.queryByText('Draft life')).toBeNull();
    expect(screen.queryByText('Zen sit')).toBeNull();
    expect(screen.queryByText(/Draft/)).toBeNull();
  });

  it('uses the per-journal untitled label when there is no date', async () => {
    await setup([
      mk('x', '', { title: '', journalId: 'life' }),
      mk('y', '', { title: '', transcript: 'hello' }),
    ]);
    expect(screen.getByText('Untitled entry')).toBeTruthy();
    expect(screen.getByText('Untitled dream')).toBeTruthy();
  });

  it('tapping a result calls onOpenDream with its id', async () => {
    const { onOpenDream } = await setup();
    await fireEvent.press(screen.getByText('Beach walk'));
    expect(onOpenDream).toHaveBeenCalledWith('Beach walk');
    await fireEvent.press(screen.getByText('Legacy flight'));
    expect(onOpenDream).toHaveBeenLastCalledWith('Legacy flight');
  });
});

describe('SearchScreen search and tags', () => {
  it('always shows the field, titled "Search", with a Back button', async () => {
    const { onBack } = await setup();
    expect(screen.getByLabelText(SEARCH)).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Search' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a text query matches across journals', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText(SEARCH), 'water');
    expect(rowLabels().map((l) => l.split('.')[0])).toEqual([
      'Beach walk',
      'Legacy flight',
      'Old river',
    ]);
    expect(screen.queryByText('Quiet day')).toBeNull();
  });

  it('the clear button empties the query', async () => {
    const { view } = await setup();
    await fireEvent.changeText(screen.getByLabelText(SEARCH), 'water');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(view.current.query).toBe('');
    expect(rowLabels()).toHaveLength(5);
  });

  it('chips show combined counts across journals; drafts and unknown journals are not counted', async () => {
    await setup();
    expect(screen.getByRole('button', { name: 'All · 5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'water · 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'walk · 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'flying · 1' })).toBeTruthy();
  });

  it('a tag filters across journals and its chip count equals the result count', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'water · 2' }));
    expect(rowLabels()).toHaveLength(2);
    expect(rowLabels().some((l) => l.endsWith('. Life'))).toBe(true);
    expect(rowLabels().some((l) => l.endsWith('. Dreams'))).toBe(true);
  });

  it('several tags must all match', async () => {
    await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'water · 2' }));
    await fireEvent.press(screen.getByRole('button', { name: /^walk · / }));
    expect(rowLabels().map((l) => l.split('.')[0])).toEqual(['Beach walk']);
  });

  it('every chip count equals its result count', async () => {
    const { view, update } = await setup();
    for (const tag of ['water', 'walk', 'flying']) {
      await update((v) => v.clearTags());
      await update((v) => v.toggleTag(tag));
      const chip = screen.getByRole('button', { name: new RegExp(`^${tag} · \\d+$`) });
      const n = Number((chip.props.accessibilityLabel as string).split(' · ')[1]);
      expect(rowLabels()).toHaveLength(n);
    }
    expect(view.current.tags).toEqual(['flying']);
  });

  it('keeps the chip row when a query leaves nothing', async () => {
    await setup();
    await fireEvent.changeText(screen.getByLabelText(SEARCH), 'zzz');
    expect(screen.getByRole('button', { name: 'All · 5' })).toBeTruthy();
  });
});

describe('SearchScreen empty states', () => {
  it('no entries in any journal', async () => {
    await setup([]);
    expect(screen.getByText('Nothing to search yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^All/ })).toBeNull();
    expect(screen.getByLabelText(SEARCH)).toBeTruthy();
  });

  it('only drafts and unknown journals counts as no entries', async () => {
    await setup([RECORDS[4], RECORDS[6]]);
    expect(screen.getByText('Nothing to search yet.')).toBeTruthy();
  });

  it('no matches, with a Clear button that resets the query and tags', async () => {
    const { view } = await setup();
    await fireEvent.changeText(screen.getByLabelText(SEARCH), 'zzz');
    expect(screen.getByText('No entries match')).toBeTruthy();
    expect(screen.getByText('Nothing found for “zzz”.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(view.current.query).toBe('');
    expect(rowLabels()).toHaveLength(5);
  });

  it('shows the unreadable message when the library could not be read', async () => {
    await setup([], 'unreadable');
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });

  it('shows nothing but the chrome while loading', async () => {
    await setup(null);
    expect(screen.queryByText('Nothing to search yet.')).toBeNull();
    expect(screen.getByLabelText(SEARCH)).toBeTruthy();
  });
});

describe('SearchScreen is read-only', () => {
  it('has no delete or swipe affordance and no draft rows', async () => {
    await setup();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.queryByLabelText(/^Delete/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Draft/ })).toBeNull();
    for (const b of screen.queryAllByRole('button')) {
      expect(b.props.accessibilityActions).toBeUndefined();
    }
  });
});

describe('SearchScreen scroll position', () => {
  it('writes the offset on scroll and restores it once on first content layout', async () => {
    const scrollTo = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const { view } = await setup();
    view.current.offsetRef.current = 240;
    const list = screen.getByTestId('search-results-list');
    expect(list.props.keyboardDismissMode).toBe('on-drag');
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    await fireEvent(list, 'contentSizeChange', 390, 2000);
    expect(scrollTo).toHaveBeenCalledWith({ offset: 240, animated: false });
    await fireEvent(list, 'contentSizeChange', 390, 2200);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    await fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 0, y: 512 } } });
    expect(view.current.offsetRef.current).toBe(512);
  });

  it('scrolls to the top when the filter changes', async () => {
    const scrollTo = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const { view, update } = await setup();
    view.current.offsetRef.current = 300;
    await update((v) => v.toggleTag('water'));
    expect(view.current.offsetRef.current).toBe(0);
    expect(scrollTo).toHaveBeenCalledWith({ offset: 0, animated: false });
  });
});

describe('SearchIcon', () => {
  it('renders the magnifier hidden from screen readers', async () => {
    await render(<SearchIcon />);
    expect(screen.toJSON()).toMatchObject({
      props: { importantForAccessibility: 'no-hide-descendants' },
    });
  });
});
