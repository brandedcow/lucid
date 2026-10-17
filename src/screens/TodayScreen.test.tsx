import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, PanResponder, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Entry } from '../types/dream';
import { colors } from '../theme';
import { LIFE_JOURNAL } from '../types/entry';
import { BUILT_IN_JOURNALS, Journal } from '../utils/journals';
import {
  EDGE_SWIPE_DISTANCE,
  EDGE_SWIPE_ZONE,
  opensDrawer,
  startsEdgeSwipe,
  TodayScreen,
} from './TodayScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};
const HIDDEN = { includeHiddenElements: true };

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e',
  createdAt: '2026-10-10T07:00:00',
  durationMs: 0,
  title: 'Flying over the sea',
  tags: [],
  transcript: 'Wide water.',
  ...over,
});

const DREAM = entry({ id: 'dream', createdAt: '2026-10-10T06:30:00' });
const LIFE = entry({
  id: 'life',
  journalId: LIFE_JOURNAL,
  createdAt: '2026-10-10T12:15:00',
  title: 'Long walk',
  transcript: 'Sunny.',
});
const DRAFT = entry({
  id: 'draft',
  status: 'draft',
  createdAt: '2026-10-10T09:00:00',
  title: '',
  transcript: undefined,
});
const YESTERDAY = entry({ id: 'yest', createdAt: '2026-10-09T20:00:00', title: 'Old news' });
const TODAY = '2026-10-10';

type Opts = {
  journals?: readonly Journal[];
  dreams?: Entry[] | null;
  todayKey?: string;
  skippedToday?: boolean;
  unreadable?: boolean;
  deletingId?: string | null;
};

function ui(o: Opts, h: Record<string, jest.Mock>) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <TodayScreen
        journals={o.journals ?? BUILT_IN_JOURNALS}
        dreams={o.dreams === undefined ? [DREAM, LIFE, DRAFT, YESTERDAY] : o.dreams}
        todayKey={o.todayKey ?? TODAY}
        skippedToday={o.skippedToday ?? false}
        unreadable={o.unreadable}
        deletingId={o.deletingId}
        onOpenEntry={h.onOpenEntry}
        onOpenDraft={h.onOpenDraft}
        onDeleteDream={h.onDeleteDream}
        onOpenJournals={h.onOpenJournals}
        onOpenSettings={h.onOpenSettings}
      />
    </SafeAreaProvider>
  );
}

async function setup(o: Opts = {}) {
  const h = {
    onOpenEntry: jest.fn(),
    onOpenDraft: jest.fn(),
    onDeleteDream: jest.fn(),
    onOpenJournals: jest.fn(),
    onOpenSettings: jest.fn(),
  };
  const view = await render(ui(o, h));
  return { ...h, rerender: (next: Opts) => view.rerender(ui(next, h)) };
}

describe('TodayScreen', () => {
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('shows the title and date', async () => {
    await setup();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Saturday, October 10')).toBeTruthy();
  });

  it("lists only today's entries from both journals, drafts included, newest first, labelled", async () => {
    await setup();
    const rows = screen.getByTestId('today-list').props.data;
    expect(rows.map((r: { dream: Entry }) => r.dream.id)).toEqual(['life', 'draft', 'dream']);
    expect(screen.getByText('Life · 12:15 PM')).toBeTruthy();
    expect(screen.getByText('Dream · 6:30 AM')).toBeTruthy();
    expect(screen.getByText(/DRAFT · /)).toBeTruthy();
    expect(
      screen.getByLabelText(/^Untitled\. Dreams, 9:00 AM\. Draft\. Tap to finish$/),
    ).toBeTruthy();
    expect(screen.queryByText('Old news')).toBeNull();
    expect(screen.queryByText('No dream today')).toBeNull();
  });

  it('shows a custom journal only when it is in the registry passed in', async () => {
    const custom = entry({ id: 'cust', createdAt: '2026-10-10T08:00:00', journalId: 'j_x' });
    const gratitude: Journal = { id: 'j_x', name: 'Gratitude', kind: 'journal' };
    const { rerender } = await setup({
      dreams: [custom, DREAM],
      journals: [...BUILT_IN_JOURNALS, gratitude],
    });
    expect(screen.getByText('Gratitude · 8:00 AM')).toBeTruthy();
    await rerender({ dreams: [custom, DREAM] });
    expect(screen.queryByText('Gratitude · 8:00 AM')).toBeNull();
    expect(screen.getByText('Dream · 6:30 AM')).toBeTruthy();
  });

  it('re-filters when todayKey changes', async () => {
    const { rerender } = await setup();
    await rerender({ todayKey: '2026-10-09' });
    expect(screen.getByText('Old news')).toBeTruthy();
    expect(screen.queryByText('Long walk')).toBeNull();
  });

  it('shows the empty state', async () => {
    await setup({ dreams: [YESTERDAY] });
    expect(screen.getByText('Nothing here yet today.')).toBeTruthy();
    expect(screen.queryByText('No dream today')).toBeNull();
  });

  it('shows the skip line plus "Nothing else" when only skipped', async () => {
    await setup({ dreams: [YESTERDAY], skippedToday: true });
    expect(screen.getByText('No dream today')).toBeTruthy();
    expect(screen.getByText('Nothing else yet today.')).toBeTruthy();
    expect(screen.queryByText('Nothing here yet today.')).toBeNull();
  });

  it('shows the skip line first when only a Life entry exists', async () => {
    await setup({ dreams: [LIFE], skippedToday: true });
    const items = screen.getByTestId('today-list').props.data;
    expect(items[0]).toEqual({ type: 'skip' });
    expect(screen.getByText('No dream today')).toBeTruthy();
  });

  it('hides the skip line when a Dream draft or finished dream exists today', async () => {
    await setup({ dreams: [DRAFT, LIFE], skippedToday: true });
    expect(screen.queryByText('No dream today')).toBeNull();
  });

  it('shows the unreadable message', async () => {
    await setup({ dreams: [], unreadable: true });
    expect(
      screen.getByText('Your saved entries could not be read. Your recordings are safe.'),
    ).toBeTruthy();
  });

  it('renders nothing in the body while loading', async () => {
    await setup({ dreams: null });
    expect(screen.queryByText('Nothing here yet today.')).toBeNull();
    expect(screen.getByLabelText('Open Journals')).toBeTruthy();
  });

  it('opens finished entries and drafts through the right callbacks', async () => {
    const { onOpenEntry, onOpenDraft } = await setup();
    await fireEvent.press(screen.getByText('Long walk'));
    expect(onOpenEntry).toHaveBeenCalledWith(LIFE);
    expect(onOpenDraft).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(/Draft\. Tap to finish$/));
    expect(onOpenDraft).toHaveBeenCalledWith(DRAFT);
  });

  it('fires the header icons', async () => {
    const h = await setup();
    const journals = screen.getByLabelText('Open Journals');
    const settings = screen.getByLabelText('Open Settings');
    for (const b of [journals, settings]) {
      const style = StyleSheet.flatten(b.props.style);
      expect(style.width).toBeGreaterThanOrEqual(44);
      expect(style.height).toBeGreaterThanOrEqual(44);
    }
    await fireEvent.press(journals);
    await fireEvent.press(settings);
    expect(h.onOpenJournals).toHaveBeenCalledTimes(1);
    expect(h.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('has no "Add entry" button of its own (App renders the shared one) and no old bottom buttons', async () => {
    await setup();
    expect(screen.queryByLabelText('Add entry')).toBeNull();
    expect(screen.queryByText('New dream')).toBeNull();
    expect(screen.queryByText('New Life entry')).toBeNull();
  });

  it('pads the list clear of the "+" button using the bottom inset', async () => {
    await setup();
    const style = StyleSheet.flatten(screen.getByTestId('today-list').props.contentContainerStyle);
    expect(style.paddingBottom).toBe(130); // 34 inset + 16 + 56 (FAB) + 24;
  });

  it('renders flat rows with the full body and no horizontal padding on the list', async () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i}.`).join(' ');
    await setup({ dreams: [entry({ id: 'long', transcript: long })] });
    expect(screen.getByText(long)).toBeTruthy();
    expect(screen.getByText(long).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(/^Dream · /)).toBeTruthy();
    const list = StyleSheet.flatten(screen.getByTestId('today-list').props.contentContainerStyle);
    expect(list.paddingHorizontal).toBeUndefined();
    expect(list.paddingLeft).toBeUndefined();
    expect(list.paddingRight).toBeUndefined();
  });

  it('ends the list with one hairline', async () => {
    await setup();
    const rule = StyleSheet.flatten(screen.getByTestId('today-end-rule').props.style);
    expect(rule.borderTopWidth).toBe(StyleSheet.hairlineWidth);
    expect(rule.borderTopColor).toBe(colors.border);
  });

  it('has no back arrow', async () => {
    await setup();
    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  it("deletes via the a11y action after confirming, with the row's own journal wording", async () => {
    const { onDeleteDream } = await setup();
    const row = screen.getByLabelText(/^Long walk\./);
    expect(row.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(onDeleteDream).not.toHaveBeenCalled();
    expect(alertSpy.mock.calls[0][0]).toBe('Delete this entry?');
    await act(async () => alertSpy.mock.calls[0][2]?.[1].onPress?.());
    expect(onDeleteDream).toHaveBeenCalledWith(LIFE);
  });

  it('uses Dream wording for a Dream row and deletes through the revealed action', async () => {
    const { onDeleteDream } = await setup();
    await fireEvent.press(screen.getByLabelText('Delete dream: Flying over the sea', HIDDEN));
    expect(alertSpy.mock.calls[0][0]).toBe('Delete this dream?');
    await act(async () => alertSpy.mock.calls[0][2]?.[1].onPress?.());
    expect(onDeleteDream).toHaveBeenCalledWith(DREAM);
  });

  it('does not delete on Keep', async () => {
    const { onDeleteDream } = await setup();
    await fireEvent.press(screen.getByLabelText('Delete dream: Flying over the sea', HIDDEN));
    await act(async () => alertSpy.mock.calls[0][2]?.[0].onPress?.());
    expect(onDeleteDream).not.toHaveBeenCalled();
  });

  it('dims the deleting row and cannot open it', async () => {
    const { onOpenEntry } = await setup({ deletingId: 'life' });
    const row = screen.getByLabelText(/^Long walk\./);
    expect(StyleSheet.flatten(row.props.style).opacity).toBeLessThan(1);
    await fireEvent.press(row);
    expect(onOpenEntry).not.toHaveBeenCalled();
    const other = screen.getByLabelText(/^Flying over the sea\./);
    expect(StyleSheet.flatten(other.props.style).opacity ?? 1).toBe(1);
  });
});

describe('TodayScreen Journals drawer', () => {
  type Config = Parameters<typeof PanResponder.create>[0];
  let config: Config;

  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const create = PanResponder.create.bind(PanResponder);
    jest.spyOn(PanResponder, 'create').mockImplementation((c) => {
      config = c;
      return create(c);
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const drawerProps = {
    journals: BUILT_IN_JOURNALS,
    counts: { dreams: 3, life: 1 },
    onOpenJournal: jest.fn(),
    onSearch: jest.fn(),
  };

  async function setupDrawer(extra: Partial<React.ComponentProps<typeof TodayScreen>> = {}) {
    const onOpenJournals = jest.fn();
    const onCloseJournals = jest.fn();
    const props = {
      journals: BUILT_IN_JOURNALS,
      dreams: [DREAM],
      todayKey: TODAY,
      skippedToday: false,
      onOpenEntry: jest.fn(),
      onOpenDraft: jest.fn(),
      onDeleteDream: jest.fn(),
      onOpenJournals,
      onOpenSettings: jest.fn(),
      onCloseJournals,
      drawer: drawerProps,
      ...extra,
    };
    const view = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <TodayScreen {...props} />
      </SafeAreaProvider>,
    );
    return { onOpenJournals, onCloseJournals, view, props };
  }
  const grant = (x0: number, dx: number, dy = 0) => ({ x0, dx, dy }) as never;
  const move = (x0: number, dx: number, dy = 0) =>
    config.onMoveShouldSetPanResponderCapture?.({} as never, grant(x0, dx, dy));
  const release = (dx: number) => config.onPanResponderRelease?.({} as never, grant(0, dx));

  it('renders no drawer while closed and the panel with the journals while open', async () => {
    const { view, props } = await setupDrawer();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
    await view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <TodayScreen {...props} journalsOpen />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('journals-drawer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dreams, 3 dreams' })).toBeTruthy();
    // The page under the drawer is hidden from screen readers.
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.getByText('Today', HIDDEN)).toBeTruthy();
  });

  it('the backdrop closes it through onCloseJournals', async () => {
    const { onCloseJournals } = await setupDrawer({ journalsOpen: true });
    await fireEvent.press(screen.getByLabelText('Close journals'));
    expect(onCloseJournals).toHaveBeenCalledTimes(1);
  });

  it('the book icon calls onOpenJournals', async () => {
    const a = await setupDrawer();
    await fireEvent.press(screen.getByLabelText('Open Journals'));
    expect(a.onOpenJournals).toHaveBeenCalledTimes(1);
  });

  it('a disabled book icon is inert and reads as disabled', async () => {
    const { onOpenJournals } = await setupDrawer({ journalsDisabled: true });
    const book = screen.getByLabelText('Open Journals');
    expect(book.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(book);
    expect(onOpenJournals).not.toHaveBeenCalled();
  });

  describe('left-edge swipe', () => {
    it('is recognised only from the left edge zone, rightward and mostly horizontal', () => {
      expect(startsEdgeSwipe({ x0: 0, dx: 30, dy: 0 })).toBe(true);
      expect(startsEdgeSwipe({ x0: EDGE_SWIPE_ZONE, dx: 30, dy: 5 })).toBe(true);
      expect(startsEdgeSwipe({ x0: EDGE_SWIPE_ZONE + 1, dx: 30, dy: 0 })).toBe(false);
      expect(startsEdgeSwipe({ x0: 5, dx: -30, dy: 0 })).toBe(false);
      expect(startsEdgeSwipe({ x0: 5, dx: 30, dy: 30 })).toBe(false);
      expect(startsEdgeSwipe({ x0: 5, dx: 5, dy: 0 })).toBe(false);
    });

    it('opens past the distance only', () => {
      expect(opensDrawer({ dx: EDGE_SWIPE_DISTANCE })).toBe(true);
      expect(opensDrawer({ dx: EDGE_SWIPE_DISTANCE - 1 })).toBe(false);
    });

    it('the page claims an edge swipe and opens the drawer on release', async () => {
      const { onOpenJournals } = await setupDrawer();
      expect(move(4, 30)).toBe(true);
      release(80);
      expect(onOpenJournals).toHaveBeenCalledTimes(1);
    });

    it('does not claim a swipe that starts away from the edge, and a short drag does not open', async () => {
      const { onOpenJournals } = await setupDrawer();
      expect(move(120, 60)).toBe(false);
      release(EDGE_SWIPE_DISTANCE - 1);
      expect(onOpenJournals).not.toHaveBeenCalled();
    });

    it('is off while opening is disabled or the drawer is already open', async () => {
      const a = await setupDrawer({ journalsDisabled: true });
      expect(move(4, 30)).toBe(false);
      release(80);
      expect(a.onOpenJournals).not.toHaveBeenCalled();
      await screen.unmount();
      const b = await setupDrawer({ journalsOpen: true });
      expect(move(4, 30)).toBe(false);
      release(80);
      expect(b.onOpenJournals).not.toHaveBeenCalled();
    });

    it('the page carries the responder handlers', async () => {
      await setupDrawer();
      expect(screen.getByTestId('today-screen').props.onMoveShouldSetResponderCapture).toBeTruthy();
    });
  });
});
