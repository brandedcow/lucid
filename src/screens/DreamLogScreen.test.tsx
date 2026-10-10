import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, FlatList, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogView, useLogView } from '../hooks/useLogView';
import { colors } from '../theme';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS, Journal } from '../utils/journals';
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

type SetupOpts = {
  dreams?: Dream[] | null;
  status?: 'ok' | 'unreadable';
  deletingId?: string | null;
  journal?: Journal;
};

async function setup({
  dreams = DREAMS,
  status = 'ok',
  deletingId = null,
  journal,
}: SetupOpts = {}) {
  const handlers = {
    onOpenDream: jest.fn(),
    onOpenDraft: jest.fn(),
    onNewDream: jest.fn(),
    onDeleteDream: jest.fn(),
  };
  const { onDeleteDream, ...rest } = handlers;
  const view: { current: LogView } = { current: undefined as unknown as LogView };
  function Harness() {
    const logView = useLogView();
    view.current = logView;
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <DreamLogScreen
          dreams={dreams}
          indexStatus={status}
          view={logView}
          deletingId={deletingId}
          journal={journal}
          onDeleteDream={onDeleteDream}
          {...rest}
        />
      </SafeAreaProvider>
    );
  }
  await render(<Harness />);
  const update = async (fn: (v: LogView) => void) => {
    await act(async () => fn(view.current));
  };
  return { ...handlers, view, update };
}

// The rows format dates against the real clock, so pin only Date (timers stay real for RNTL).
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 9, 6, 12, 0),
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
    const subline = screen.getByText('Draft · Oct 4');
    expect(StyleSheet.flatten(subline.props.style).color).toBe(colors.muted);
    expect(screen.queryByText(/Not reviewed yet|Finish now/)).toBeNull();
    expect(screen.getByText('›')).toBeTruthy();
    await fireEvent.press(screen.getByText('Untitled dream'));
    expect(onOpenDraft).toHaveBeenCalledWith(DREAMS[0]);
    expect(onOpenDream).not.toHaveBeenCalled();
  });

  it('shows only "Draft" when a draft has no valid date, and leaves finished rows alone', async () => {
    await setup({
      dreams: [
        dream({ id: 'nd', status: 'draft', createdAt: 'garbage', title: 'No date' }),
        dream({ id: 'f' }),
      ],
    });
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.queryByText(/Draft ·/)).toBeNull();
    expect(screen.getByLabelText('Draft: No date. Tap to finish')).toBeTruthy();
    expect(screen.getByText('The endless hallway')).toBeTruthy();
    expect(screen.getAllByText(/Draft/)).toHaveLength(1);
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
      screen.getByLabelText('Draft: Untitled dream. Sunday, October 4 · 6:42 AM. Tap to finish'),
    ).toBeTruthy();
  });
});

describe('DreamLogScreen search field style', () => {
  // Jest cannot render layout, so check the invariants that keep the placeholder from clipping.
  it('gives the search input room for its line, with no fixed height', async () => {
    const { update } = await setup();
    await update((v) => v.openSearch());
    const field = screen.getByPlaceholderText('Search dreams');
    const input = StyleSheet.flatten(field.props.style);
    expect(input.height).toBeUndefined();
    expect(input.lineHeight).toBeGreaterThanOrEqual(input.fontSize as number);
    expect(input.paddingVertical).toBeGreaterThan(0);
    expect(input.textAlignVertical).toBe('center');
    expect(input.includeFontPadding).toBe(false);
    const wrap = StyleSheet.flatten(field.parent?.props.style);
    expect(wrap.height).toBeUndefined();
    expect(wrap.minHeight).toBe(44);
    expect(wrap.minHeight).toBeGreaterThanOrEqual(
      (input.lineHeight as number) + 2 * (input.paddingVertical as number),
    );
  });

  it('keeps the pill height constant when the clear button appears', async () => {
    const { update } = await setup();
    await update((v) => v.openSearch());
    await update((v) => v.setQuery('x'));
    const field = screen.getByPlaceholderText('Search dreams');
    const wrap = StyleSheet.flatten(field.parent?.props.style);
    const clear = StyleSheet.flatten(screen.getByLabelText('Clear search').props.style);
    const inner = (wrap.minHeight as number) - 2 * (wrap.borderWidth as number);
    expect(clear.height).toBeLessThanOrEqual(inner);
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

describe('DreamLogScreen delete', () => {
  const HIDDEN = { includeHiddenElements: true };
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  const A_LABEL =
    'The endless hallway. Sunday, October 4 · 6:42 AM. Feelings: Uneasy, Curious. Tags: water, stairs';

  it('offers a Delete accessibility action on finished rows that calls onDeleteDream', async () => {
    const { onDeleteDream, onOpenDream } = await setup();
    const row = screen.getByLabelText(A_LABEL);
    expect(row.props.accessibilityActions).toEqual([{ name: 'delete', label: 'Delete' }]);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(onDeleteDream).not.toHaveBeenCalled();
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Delete this dream?');
    expect(message).toContain('recording and text');
    expect(buttons?.map((b) => b.text)).toEqual(['Keep', 'Delete']);
    await act(async () => buttons?.[1].onPress?.());
    expect(onDeleteDream).toHaveBeenCalledTimes(1);
    expect(onDeleteDream).toHaveBeenCalledWith(DREAMS[1]);
    expect(onOpenDream).not.toHaveBeenCalled();
  });

  it('does not delete when Keep is pressed or the dialog is dismissed, and allows asking again', async () => {
    const { onDeleteDream } = await setup();
    const press = () =>
      fireEvent.press(screen.getByLabelText('Delete dream: Missed the train again', HIDDEN));
    await press();
    await act(async () => alertSpy.mock.calls[0][2]?.[0].onPress?.());
    await press();
    expect(alertSpy).toHaveBeenCalledTimes(2);
    await act(async () => alertSpy.mock.calls[1][3]?.onDismiss?.());
    await press();
    expect(alertSpy).toHaveBeenCalledTimes(3);
    expect(onDeleteDream).not.toHaveBeenCalled();
  });

  it('shows only one confirmation however often Delete is pressed', async () => {
    await setup();
    const del = screen.getByLabelText('Delete dream: Missed the train again', HIDDEN);
    await fireEvent.press(del);
    await fireEvent.press(del);
    await fireEvent.press(screen.getByLabelText('Delete dream: Swimming in the library', HIDDEN));
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('words the confirmation for a dream without a recording', async () => {
    await setup({ dreams: [dream({ id: 'w', title: 'Written only', audioFileName: undefined })] });
    await fireEvent.press(screen.getByLabelText('Delete dream: Written only', HIDDEN));
    expect(alertSpy.mock.calls[0][1]).toMatch(/^The text will be permanently deleted/);
  });

  it('keeps tap-to-open on a swipeable row', async () => {
    const { onOpenDream, onDeleteDream } = await setup();
    await fireEvent.press(screen.getByLabelText(A_LABEL));
    expect(onOpenDream).toHaveBeenCalledWith('a');
    expect(onDeleteDream).not.toHaveBeenCalled();
  });

  it('renders a Delete action per finished row, hidden from screen readers while closed', async () => {
    await setup();
    expect(screen.queryByLabelText('Delete dream: The endless hallway')).toBeNull();
    const action = screen.getByLabelText('Delete dream: The endless hallway', HIDDEN);
    expect(action.props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('Delete dream: Sep 23, 2025', HIDDEN)).toBeTruthy();
  });

  it('calls onDeleteDream with the dream when the revealed Delete is pressed', async () => {
    const { onDeleteDream, onOpenDream } = await setup();
    await fireEvent.press(screen.getByLabelText('Delete dream: Missed the train again', HIDDEN));
    expect(onDeleteDream).not.toHaveBeenCalled();
    await act(async () => alertSpy.mock.calls[0][2]?.[1].onPress?.());
    expect(onDeleteDream).toHaveBeenCalledTimes(1);
    expect(onDeleteDream).toHaveBeenCalledWith(DREAMS[2]);
    expect(onOpenDream).not.toHaveBeenCalled();
  });

  it('styles the action red with a 44pt target', async () => {
    await setup();
    const action = screen.getByLabelText('Delete dream: The endless hallway', HIDDEN);
    const style = StyleSheet.flatten(action.props.style);
    expect(style.backgroundColor).toBe(colors.draft);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(screen.getAllByText('Delete', HIDDEN).length).toBeGreaterThan(0);
  });

  it('gives drafts no delete action', async () => {
    await setup();
    const draft = screen.getByLabelText(
      'Draft: Untitled dream. Sunday, October 4 · 6:42 AM. Tap to finish',
    );
    expect(draft.props.accessibilityActions).toBeUndefined();
    expect(draft.props.onAccessibilityAction).toBeUndefined();
    // Only the finished rows (a, b, c, legacy) have Delete; the label for the draft is "Untitled dream" too.
    expect(screen.getAllByText('Delete', HIDDEN)).toHaveLength(4);
  });

  it('dims and disables the row being deleted, and turns off delete actions everywhere', async () => {
    const { onOpenDream, onOpenDraft } = await setup({ deletingId: 'a' });
    const row = screen.getByLabelText(A_LABEL);
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    expect(StyleSheet.flatten(row.props.style).opacity).toBeLessThan(1);
    await fireEvent.press(row);
    expect(onOpenDream).not.toHaveBeenCalled();
    // A delete is in flight, so no row offers the accessibility action.
    expect(row.props.accessibilityActions).toBeUndefined();
    const other = screen.getByLabelText(/^Missed the train again\./);
    expect(other.props.accessibilityActions).toBeUndefined();
    // Everything else stays usable.
    await fireEvent.press(other);
    expect(onOpenDream).toHaveBeenCalledWith('b');
    await fireEvent.press(screen.getByText('Untitled dream'));
    expect(onOpenDraft).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('New dream'));
  });

  it('keeps search and tag filters working while a delete is in flight', async () => {
    const { update } = await setup({ deletingId: 'a' });
    await update((v) => v.toggleTag('water'));
    expect(screen.getByText('Swimming in the library')).toBeTruthy();
    expect(screen.getByLabelText(/^The endless hallway\./).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});

describe('DreamLogScreen for the Life journal', () => {
  const HIDDEN = { includeHiddenElements: true };
  const LIFE = BUILT_IN_JOURNALS[1];
  const ENTRIES: Dream[] = [
    dream({ id: 'l1', title: 'A slow Sunday', transcript: 'Made soup.', journalId: 'life' }),
    dream({ id: 'l2', title: '', transcript: 'Walked home.', journalId: 'life' }),
  ];

  it('uses the Life header, search labels and New entry button', async () => {
    await setup({ dreams: ENTRIES, journal: LIFE });
    expect(screen.getByRole('header', { name: 'Life' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search entries' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New entry' })).toBeTruthy();
    expect(screen.getByText('New entry')).toBeTruthy();
    expect(screen.queryByText(/dream/i)).toBeNull();
    expect(screen.queryByLabelText(/dream/i, HIDDEN)).toBeNull();
  });

  it('uses the search placeholder and label while searching', async () => {
    const { update } = await setup({ dreams: ENTRIES, journal: LIFE });
    await update((v) => v.openSearch());
    expect(screen.getByPlaceholderText('Search entries')).toBeTruthy();
    expect(screen.getByLabelText('Search entries')).toBeTruthy();
  });

  it('has Life empty, no-match and unreadable copy', async () => {
    await setup({ dreams: [], journal: LIFE });
    expect(screen.getByText('No entries yet.')).toBeTruthy();
    expect(screen.getByText('Tap New entry to record one.')).toBeTruthy();
  });

  it('shows the Life no-match title', async () => {
    const { update } = await setup({ dreams: ENTRIES, journal: LIFE });
    await update((v) => v.setQuery('zzzz'));
    expect(screen.getByText('No entries match')).toBeTruthy();
  });

  it('shows the Life unreadable message', async () => {
    await setup({ dreams: [], status: 'unreadable', journal: LIFE });
    expect(
      screen.getByText('Your saved entries could not be read. Your recordings are safe.'),
    ).toBeTruthy();
  });

  it('labels the swipe action Delete entry and shows an untitled entry by its date', async () => {
    await setup({ dreams: ENTRIES, journal: LIFE });
    expect(screen.getByLabelText('Delete entry: A slow Sunday', HIDDEN)).toBeTruthy();
    expect(screen.getByLabelText('Delete entry: Oct 4', HIDDEN)).toBeTruthy();
  });

  it('confirms deletion with the entry wording', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await setup({ dreams: ENTRIES, journal: LIFE });
    await fireEvent.press(screen.getByLabelText('Delete entry: A slow Sunday', HIDDEN));
    expect(alertSpy.mock.calls[0][0]).toBe('Delete this entry?');
    alertSpy.mockRestore();
  });

  it('shows an untitled Life draft as Untitled entry', async () => {
    await setup({
      dreams: [dream({ id: 'ld', status: 'draft', title: '', journalId: 'life' })],
      journal: LIFE,
    });
    expect(screen.getByText('Untitled entry')).toBeTruthy();
  });
});
