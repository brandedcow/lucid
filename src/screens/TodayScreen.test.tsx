import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Entry } from '../types/dream';
import { LIFE_JOURNAL } from '../types/entry';
import { TodayScreen } from './TodayScreen';

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
        dreams={o.dreams === undefined ? [DREAM, LIFE, DRAFT, YESTERDAY] : o.dreams}
        todayKey={o.todayKey ?? TODAY}
        skippedToday={o.skippedToday ?? false}
        unreadable={o.unreadable}
        deletingId={o.deletingId}
        onOpenEntry={h.onOpenEntry}
        onOpenDraft={h.onOpenDraft}
        onDeleteDream={h.onDeleteDream}
        onNewDream={h.onNewDream}
        onNewLifeEntry={h.onNewLifeEntry}
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
    onNewDream: jest.fn(),
    onNewLifeEntry: jest.fn(),
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
    expect(screen.getByText('Life')).toBeTruthy();
    expect(screen.getByText(/Draft · .*Dreams/)).toBeTruthy();
    expect(screen.getByText('Dreams')).toBeTruthy();
    expect(screen.queryByText('Old news')).toBeNull();
    expect(screen.queryByText('No dream today')).toBeNull();
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
    await fireEvent.press(screen.getByText(/Draft · /));
    expect(onOpenDraft).toHaveBeenCalledWith(DRAFT);
  });

  it('fires the header icons and bottom buttons', async () => {
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
    await fireEvent.press(screen.getByLabelText('New dream'));
    await fireEvent.press(screen.getByLabelText('New Life entry'));
    expect(h.onOpenJournals).toHaveBeenCalledTimes(1);
    expect(h.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(h.onNewDream).toHaveBeenCalledTimes(1);
    expect(h.onNewLifeEntry).toHaveBeenCalledTimes(1);
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
