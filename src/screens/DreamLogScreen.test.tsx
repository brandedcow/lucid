import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogView, useLogView } from '../hooks/useLogView';
import { colors } from '../theme';
import { Dream } from '../types/dream';
import { DreamLogScreen } from './DreamLogScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

const dream = (over: Partial<Dream> = {}): Dream => ({
  id: 'd1',
  createdAt: '2026-10-04T06:42:00',
  durationMs: 65000,
  audioFileName: 'a.m4a',
  title: 'The endless hallway',
  transcript: 'I was back at my grandmother’s house.',
  emotion: 'uneasy, curious',
  tags: ['water', 'stairs'],
  ...over,
});

const DREAMS: Dream[] = [
  dream({ id: 'draft', status: 'draft', title: '', transcript: undefined, tags: [], emotion: '' }),
  dream({ id: 'a' }),
  dream({
    id: 'b',
    createdAt: '2026-10-01T22:00:00',
    title: 'Missed the train again',
    transcript: 'The platform kept changing numbers.',
    emotion: 'afraid',
    tags: ['being late'],
  }),
  dream({
    id: 'c',
    createdAt: '2026-09-27T07:00:00',
    title: 'Swimming in the library',
    transcript: 'The whole ground floor was flooded.',
    emotion: '',
    tags: ['water'],
  }),
  dream({
    id: 'legacy',
    createdAt: '2025-09-23T07:00:00',
    title: '',
    transcript: undefined,
    emotion: undefined,
    tags: [],
  }),
];

type SetupOpts = { dreams?: Dream[] | null; status?: 'ok' | 'unreadable' };

async function setup({ dreams = DREAMS, status = 'ok' }: SetupOpts = {}) {
  const handlers = { onOpenDream: jest.fn(), onOpenDraft: jest.fn(), onNewDream: jest.fn() };
  const view: { current: LogView } = { current: undefined as unknown as LogView };
  function Harness() {
    const logView = useLogView();
    view.current = logView;
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <DreamLogScreen dreams={dreams} indexStatus={status} view={logView} {...handlers} />
      </SafeAreaProvider>
    );
  }
  await render(<Harness />);
  const update = async (fn: (v: LogView) => void) => {
    await act(async () => fn(view.current));
  };
  return { ...handlers, view, update };
}

afterEach(() => jest.restoreAllMocks());

describe('DreamLogScreen list', () => {
  it('renders month headers, rows, and the legacy dream with its short date', async () => {
    await setup();
    expect(screen.getByText('OCTOBER')).toBeTruthy();
    expect(screen.getByText('SEPTEMBER')).toBeTruthy();
    expect(screen.getByText('The endless hallway')).toBeTruthy();
    expect(screen.getByText('Swimming in the library')).toBeTruthy();
    expect(screen.getByText('SEPTEMBER 2025')).toBeTruthy();
    expect(screen.getByText('Sep 23, 2025')).toBeTruthy();
  });

  it('shows weekday, day, preview and chips on a finished row, and no play buttons', async () => {
    await setup();
    expect(screen.getAllByText('SUN').length).toBeGreaterThan(0);
    expect(screen.getByText('I was back at my grandmother’s house.')).toBeTruthy();
    expect(screen.getAllByText('Uneasy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('stairs').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/Play/)).toBeNull();
    expect(screen.queryByText('▶')).toBeNull();
  });

  it('opens a finished dream by id', async () => {
    const { onOpenDream, onOpenDraft } = await setup();
    await fireEvent.press(screen.getByText('The endless hallway'));
    expect(onOpenDream).toHaveBeenCalledWith('a');
    expect(onOpenDraft).not.toHaveBeenCalled();
  });

  it('shows a draft with a red Draft label and a chevron, and opens it', async () => {
    const { onOpenDream, onOpenDraft } = await setup();
    expect(screen.getByText('Untitled dream')).toBeTruthy();
    expect(screen.getByText(' · 1:05')).toBeTruthy();
    const label = screen.getByText('Draft');
    expect(StyleSheet.flatten(label.props.style).color).toBe(colors.draft);
    const hint = screen.getByText('Draft · Not reviewed yet · Finish now');
    expect(StyleSheet.flatten(hint.props.style).color).toBe(colors.muted);
    expect(screen.getByText('›')).toBeTruthy();
    await fireEvent.press(screen.getByText('Untitled dream'));
    expect(onOpenDraft).toHaveBeenCalledWith(DREAMS[0]);
    expect(onOpenDream).not.toHaveBeenCalled();
  });

  it('keeps the duration visible when a draft title is long', async () => {
    const long = 'A very long draft title that will not fit on one line of the card at all';
    await setup({ dreams: [dream({ id: 'ld', status: 'draft', title: long })] });
    const title = screen.getByText(long);
    expect(title.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(title.props.style).flexShrink).toBe(1);
    const suffix = screen.getByText(' · 1:05');
    expect(suffix.props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(suffix.props.style).flexShrink).toBe(0);
  });

  it('labels rows for screen readers', async () => {
    await setup();
    expect(
      screen.getByLabelText(
        'The endless hallway. Sunday, October 4 · 6:42 AM. Feelings: Uneasy, Curious. Tags: water, stairs',
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Draft: Untitled dream. Sunday, October 4 · 6:42 AM. Not reviewed yet. Finish now',
      ),
    ).toBeTruthy();
  });
});

describe('DreamLogScreen tags', () => {
  it('shows All with the total and a chip per tag with its count', async () => {
    await setup();
    expect(screen.getByLabelText('All · 5')).toBeTruthy();
    expect(screen.getByLabelText('water · 2').props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText('All · 5').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('being late · 1')).toBeTruthy();
  });

  it('narrows with every selected tag (AND) and marks them selected', async () => {
    const { update } = await setup();
    await update((v) => v.toggleTag('water'));
    expect(screen.getByLabelText('water · 2').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('All · 5').props.accessibilityState.selected).toBe(false);
    expect(screen.queryByText('Missed the train again')).toBeNull();
    expect(screen.getByText('Swimming in the library')).toBeTruthy();
    await update((v) => v.toggleTag('stairs'));
    expect(screen.queryByText('Swimming in the library')).toBeNull();
    expect(screen.getByText('The endless hallway')).toBeTruthy();
  });

  it('toggles a tag when its chip is pressed, and All clears the tags', async () => {
    const { view } = await setup();
    await fireEvent.press(screen.getByLabelText('water · 2'));
    await fireEvent.press(screen.getByLabelText('stairs · 1'));
    expect(view.current.tags).toEqual(['water', 'stairs']);
    await fireEvent.press(screen.getByLabelText('All · 5'));
    expect(view.current.tags).toEqual([]);
  });

  it('pressing All twice quickly stays on All and does not reselect', async () => {
    const { view } = await setup();
    await fireEvent.press(screen.getByLabelText('water · 2'));
    await fireEvent.press(screen.getByLabelText('stairs · 1'));
    await fireEvent.press(screen.getByLabelText('All · 5'));
    await fireEvent.press(screen.getByLabelText('All · 5'));
    expect(view.current.tags).toEqual([]);
    expect(screen.getByLabelText('All · 5').props.accessibilityState.selected).toBe(true);
  });

  it('hides the tag row when the index is unreadable or there are no dreams', async () => {
    await setup({ dreams: [], status: 'ok' });
    expect(screen.queryByLabelText(/^All/)).toBeNull();
  });
});

describe('DreamLogScreen search', () => {
  it('opens search, narrows, and shows no results with Clear', async () => {
    const { view, update } = await setup();
    await fireEvent.press(screen.getByLabelText('Search dreams'));
    expect(screen.queryByLabelText('New dream')).toBeNull();
    await update((v) => v.openSearch());
    expect(screen.queryByLabelText('New dream')).toBeNull();
    expect(screen.getByPlaceholderText('Search dreams')).toBeTruthy();
    await update((v) => v.setQuery('train'));
    expect(screen.getByText('Missed the train again')).toBeTruthy();
    expect(screen.queryByText('The endless hallway')).toBeNull();
    expect(screen.getByLabelText('All · 5')).toBeTruthy();
    await update((v) => v.setQuery('zzz'));
    expect(screen.getByText('No dreams match')).toBeTruthy();
    expect(screen.getByText('Nothing found for “zzz”.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Clear'));
    expect(view.current.query).toBe('');
    expect(view.current.searching).toBe(false);
  });

  it('combines search with tags and describes both when nothing matches', async () => {
    const { update } = await setup();
    await update((v) => v.toggleTag('water'));
    await update((v) => v.openSearch());
    await update((v) => v.setQuery('hallway'));
    expect(screen.getByText('The endless hallway')).toBeTruthy();
    await update((v) => v.setQuery('train'));
    expect(screen.getByText('Nothing found for “train” tagged water.')).toBeTruthy();
  });

  it('cancels search from the Cancel button', async () => {
    const { view, update } = await setup();
    await update((v) => v.openSearch());
    await update((v) => v.setQuery('train'));
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(view.current.searching).toBe(false);
    expect(view.current.query).toBe('');
  });

  it('shows a clear button in the field only when there is text', async () => {
    const { view, update } = await setup();
    await update((v) => v.openSearch());
    expect(screen.queryByLabelText('Clear search')).toBeNull();
    await update((v) => v.setQuery('x'));
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(view.current.query).toBe('');
  });
});

describe('DreamLogScreen buttons and states', () => {
  it('calls onNewDream from the New dream button', async () => {
    const { onNewDream } = await setup();
    await fireEvent.press(screen.getByLabelText('New dream'));
    expect(onNewDream).toHaveBeenCalled();
  });

  it('renders no list while loading but keeps the header', async () => {
    await setup({ dreams: null });
    expect(screen.getByText('Dreams')).toBeTruthy();
    expect(screen.queryByTestId('dream-log-list')).toBeNull();
    expect(screen.queryByText('No dreams yet.')).toBeNull();
  });

  it('shows the empty message when there are no dreams', async () => {
    await setup({ dreams: [] });
    expect(screen.getByText('No dreams yet.')).toBeTruthy();
    expect(screen.getByText('Tap New dream to record one.')).toBeTruthy();
    expect(screen.getByLabelText('New dream')).toBeTruthy();
  });

  it('shows the unreadable message', async () => {
    await setup({ dreams: [], status: 'unreadable' });
    expect(
      screen.getByText('Your saved dreams could not be read. Your recordings are safe.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('New dream')).toBeTruthy();
  });
});

describe('DreamLogScreen scroll position', () => {
  it('writes the offset on scroll and restores it once on first content layout', async () => {
    const scrollTo = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const { view } = await setup();
    view.current.offsetRef.current = 240;
    const list = screen.getByTestId('dream-log-list');
    await fireEvent(list, 'contentSizeChange', 390, 2000);
    expect(scrollTo).toHaveBeenCalledWith({ offset: 240, animated: false });
    await fireEvent(list, 'contentSizeChange', 390, 2200);
    expect(scrollTo).toHaveBeenCalledTimes(1);

    await fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 0, y: 512 } } });
    expect(view.current.offsetRef.current).toBe(512);
  });

  it('does not use up the restore while there are no items', async () => {
    const scrollTo = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const { view } = await setup({ dreams: [] });
    expect(screen.queryByTestId('dream-log-list')).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(view.current.offsetRef.current).toBe(0);
  });

  it('scrolls to the top and resets the offset when the filter changes', async () => {
    const scrollTo = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const { view, update } = await setup();
    view.current.offsetRef.current = 300;
    await update((v) => v.toggleTag('water'));
    expect(view.current.offsetRef.current).toBe(0);
    expect(scrollTo).toHaveBeenCalledWith({ offset: 0, animated: false });
  });
});
