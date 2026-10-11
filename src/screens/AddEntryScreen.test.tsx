import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { entryJournalLocked, useEntrySession } from '../hooks/useEntrySession';
import { saveDream } from '../services/dreamStorage';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { bodyText } from '../test/bodyText';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS, Journal, journalOrDefault } from '../utils/journals';
import { AddEntryScreen } from './AddEntryScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 34 }),
}));

jest.mock('../services/dreamStorage', () => ({
  saveDream: jest.fn(),
  discardRecording: jest.fn(),
  recordingUri: (r: { fileName: string }) => `file:///document/dreams/${r.fileName}`,
  isIndexUnreadableError: () => false,
}));

const save = saveDream as jest.Mock;
const [DREAMS, LIFE] = BUILT_IN_JOURNALS;
const GRATITUDE: Journal = { id: 'j_g1', name: 'Gratitude', kind: 'journal' };
const REGISTRY = [...BUILT_IN_JOURNALS, GRATITUDE];

const stored: Dream = {
  id: '7',
  createdAt: '2026-10-01T08:00:00.000Z',
  durationMs: 12_000,
  audioFileName: '7.m4a',
  title: 'Old title',
  emotion: 'uneasy',
  tags: ['water'],
  transcript: 'old text',
};

const callbacks = { onBack: jest.fn(), onSaved: jest.fn() };

type Start = {
  journal?: Journal;
  open?: { dream: Dream; as: 'draft' | 'edit' };
  /** The journals the dropdown offers (App passes the registry minus one being deleted). */
  offered?: readonly Journal[];
};

/** Wires the page to the real session hook the way App does: the check saves a finished entry. */
function Harness({ journal = DREAMS, open, offered = REGISTRY }: Start) {
  const entry = useEntrySession(REGISTRY);
  const { session } = entry;
  useEffect(() => {
    if (open?.as === 'edit') entry.openEntry(open.dream);
    else if (open) entry.openDraft(open.dream);
    else entry.startNew(journal.id);
    // Starts the session once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!session) return null;
  return (
    <AddEntryScreen
      journal={journalOrDefault(REGISTRY, session.journalId)}
      journals={offered}
      onJournalChange={entry.setJournal}
      journalLocked={entryJournalLocked(session)}
      title={session.title}
      onTitleChange={entry.setTitle}
      body={session.body}
      onBodyChange={entry.setBody}
      date="Sunday, October 6"
      saving={entry.saving}
      autoFocus={session.origin === 'new'}
      onSave={() => {
        // Not awaited, like App: a pending save must not hold the press.
        void entry.save('saved').then((ok) => ok && callbacks.onSaved());
      }}
      onBack={callbacks.onBack}
    />
  );
}

const renderPage = async (props: Start = {}) => {
  await render(<Harness {...props} />);
  await act(async () => {});
};
const check = (label = 'Save dream') => screen.getByLabelText(label);

beforeEach(() => {
  jest.clearAllMocks();
  save.mockResolvedValue({ id: '1', createdAt: 'c' });
});

describe('AddEntryScreen', () => {
  it('renders the date, journal, placeholders and the check', async () => {
    await renderPage();
    expect(screen.getByText('Sunday, October 6')).toBeTruthy();
    expect(screen.getByLabelText('Journal: Dreams')).toBeTruthy();
    expect(screen.getByPlaceholderText('Title...')).toBeTruthy();
    expect(screen.getByPlaceholderText('Start writing...')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Add a tag...')).toBeNull();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(check()).toBeTruthy();
  });

  it('focuses the title of a new entry but not a reopened one', async () => {
    await renderPage();
    expect(screen.getByLabelText('Title').props.autoFocus).toBe(true);
    await screen.unmount();
    await renderPage({ open: { dream: stored, as: 'edit' } });
    expect(screen.getByLabelText('Title').props.autoFocus).toBe(false);
  });

  it('takes a typed title and body', async () => {
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Flooded hall');
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'it filled up');
    expect(screen.getByLabelText('Title').props.value).toBe('Flooded hall');
    expect(bodyText(screen.getByLabelText('Entry text'))).toBe('it filled up');
  });

  it('saves a finished entry with the body as the transcript and its #tags as the tags', async () => {
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Flooded hall');
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'it filled up #Water');
    await fireEvent.press(check());
    await act(async () => {});
    expect(save).toHaveBeenCalledWith({
      details: {
        title: 'Flooded hall',
        emotion: '',
        tags: ['water'],
        transcript: 'it filled up #Water',
      },
      status: 'saved',
      journalId: 'dreams',
      requireTitle: true,
    });
    expect(callbacks.onSaved).toHaveBeenCalled();
  });

  it('disables the check until a Dreams entry has a title', async () => {
    await renderPage();
    expect(check().props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'words only');
    await fireEvent.press(check());
    expect(save).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Title'), '   ');
    expect(check().props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'A title');
    expect(check().props.accessibilityState.disabled).toBe(false);
  });

  it('lets an entry in a Life journal save with no title', async () => {
    await renderPage({ journal: LIFE });
    expect(screen.getByLabelText('Journal: Life')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'a walk');
    expect(check('Save entry').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(check('Save entry'));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'life', requireTitle: false, status: 'saved' }),
    );
  });

  it('calls onBack from the back arrow', async () => {
    await renderPage();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  });

  it('locks the fields, the check and Back while a save is in flight', async () => {
    let resolve: (d: unknown) => void = () => {};
    save.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderPage();
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Flooded hall');
    await fireEvent.press(check());
    expect(screen.getByLabelText('Title').props.editable).toBe(false);
    expect(screen.getByLabelText('Entry text').props.editable).toBe(false);
    expect(check().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(callbacks.onBack).not.toHaveBeenCalled();
    await act(async () => resolve({ id: '1', createdAt: 'c' }));
    expect(screen.getByLabelText('Title').props.editable).toBe(true);
  });

  it('prefills a finished entry for editing and keeps its emotion on save', async () => {
    await renderPage({ open: { dream: stored, as: 'edit' } });
    expect(screen.getByLabelText('Title').props.value).toBe('Old title');
    // The stored tag is written into the body.
    expect(bodyText(screen.getByLabelText('Entry text'))).toBe('old text\n#water');
    // There is no emotion field on the page.
    expect(screen.queryByText(/feel/i)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'new text #water');
    await fireEvent.press(check());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '7',
        status: 'saved',
        details: {
          title: 'Old title',
          emotion: 'uneasy',
          tags: ['water'],
          transcript: 'new text #water',
        },
      }),
    );
    expect(save.mock.calls[0][0]).not.toHaveProperty('recordingUri');
  });

  it('prefills a reopened draft', async () => {
    const draft: Dream = { ...stored, status: 'draft', audioFileName: undefined, durationMs: 0 };
    await renderPage({ open: { dream: draft, as: 'draft' } });
    expect(screen.getByLabelText('Title').props.value).toBe('Old title');
    expect(bodyText(screen.getByLabelText('Entry text'))).toBe('old text\n#water');
    await fireEvent.press(check());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: '7', status: 'saved' }));
  });

  it('renders an attachment and a toolbar passed into its slots', async () => {
    await render(
      <AddEntryScreen
        title=""
        onTitleChange={jest.fn()}
        body=""
        onBodyChange={jest.fn()}
        date="Sunday, October 6"
        onSave={jest.fn()}
        onBack={jest.fn()}
        attachment={<Text>slot-attachment</Text>}
        toolbar={<Text>slot-toolbar</Text>}
      />,
    );
    expect(screen.getByText('slot-attachment')).toBeTruthy();
    expect(screen.getByText('slot-toolbar')).toBeTruthy();
  });

  describe('bottom dock', () => {
    const originalOS = Platform.OS;
    const setOS = (os: 'ios' | 'android') =>
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
    afterEach(() =>
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS }),
    );
    const dockPadding = () =>
      StyleSheet.flatten(screen.getByTestId('entry-bottom-dock').props.style).paddingBottom;
    const renderDock = () =>
      render(
        <AddEntryScreen
          title=""
          onTitleChange={jest.fn()}
          body=""
          onBodyChange={jest.fn()}
          date="d"
          onSave={jest.fn()}
          onBack={jest.fn()}
          toolbar={<Text>slot-toolbar</Text>}
        />,
      );
    let emit: ReturnType<typeof fakeKeyboard>['emit'];
    beforeEach(() => {
      ({ emit } = fakeKeyboard());
    });

    it('holds the toolbar', async () => {
      await renderDock();
      expect(screen.getByTestId('entry-bottom-dock')).toContainElement(
        screen.getByText('slot-toolbar'),
      );
    });

    it('Android: bottom inset when closed, keyboard height plus inset when open, inset again after', async () => {
      setOS('android');
      await renderDock();
      expect(dockPadding()).toBe(34);
      await emit('keyboardDidShow', 300);
      expect(dockPadding()).toBe(334);
      await emit('keyboardDidShow', 340);
      expect(dockPadding()).toBe(374);
      await emit('keyboardDidHide');
      expect(dockPadding()).toBe(34);
    });

    it('iOS: bottom inset when closed, none while open (KeyboardAvoidingView lifts the page)', async () => {
      setOS('ios');
      await renderDock();
      expect(dockPadding()).toBe(34);
      await emit('keyboardWillShow', 336);
      expect(dockPadding()).toBe(0);
      await emit('keyboardWillHide');
      expect(dockPadding()).toBe(34);
    });
  });

  describe('page layout (one scrolling page)', () => {
    const renderLayout = (props: Partial<React.ComponentProps<typeof AddEntryScreen>> = {}) =>
      render(
        <AddEntryScreen
          title=""
          onTitleChange={jest.fn()}
          body=""
          onBodyChange={jest.fn()}
          date="d"
          onSave={jest.fn()}
          onBack={jest.fn()}
          attachment={<Text>slot-notes</Text>}
          toolbar={<Text>slot-toolbar</Text>}
          suggestions={<Text>slot-suggestions</Text>}
          {...props}
        />,
      );
    const scrollViews = () =>
      (JSON.stringify(screen.toJSON()).match(/"RCTScrollView"/g) ?? []).length;
    const page = () => screen.getByTestId('entry-page');
    const dock = () => screen.getByTestId('entry-bottom-dock');

    it('has one page ScrollView holding the notes, date, title and body', async () => {
      await renderLayout();
      expect(scrollViews()).toBe(1);
      expect(page()).toContainElement(screen.getByText('slot-notes'));
      expect(page()).toContainElement(screen.getByTestId('entry-notes'));
      expect(page()).toContainElement(screen.getByTestId('entry-date-title'));
      expect(page()).toContainElement(screen.getByLabelText('Title'));
      expect(page()).toContainElement(screen.getByTestId('entry-body'));
    });

    it('keeps the page ScrollView even without notes, and renders no notes wrapper', async () => {
      await renderLayout({ attachment: undefined });
      expect(scrollViews()).toBe(1);
      expect(screen.queryByTestId('entry-notes')).toBeNull();
    });

    it('lets handled taps through and dismisses on blank taps', async () => {
      await renderLayout();
      expect(page().props.keyboardShouldPersistTaps).toBe('handled');
    });

    it('gives the body an auto-grow height (minHeight 160, no flex) and keeps its testID and label', async () => {
      await renderLayout();
      const body = screen.getByTestId('entry-body');
      expect(body).toBe(screen.getByLabelText('Entry text'));
      const style = StyleSheet.flatten(body.props.style);
      expect(style.flex).toBeUndefined();
      expect(style.minHeight).toBe(160);
    });

    it('does not cap the number of notes (no nested scroller, no fixed height)', async () => {
      await renderLayout();
      expect(
        StyleSheet.flatten(screen.getByTestId('entry-notes').props.style)?.height,
      ).toBeUndefined();
      expect(screen.getByTestId('entry-notes').props.nestedScrollEnabled).toBeUndefined();
    });

    it('keeps the toolbar and suggestions in the dock, outside the ScrollView', async () => {
      await renderLayout();
      expect(dock()).toContainElement(screen.getByText('slot-toolbar'));
      expect(dock()).toContainElement(screen.getByText('slot-suggestions'));
      expect(page()).not.toContainElement(screen.getByText('slot-toolbar'));
    });

    it('shows the recording panel in the dock and hides the toolbar and suggestions', async () => {
      await renderLayout({ recordingPanel: <Text>slot-panel</Text> });
      expect(dock()).toContainElement(screen.getByTestId('entry-recording-panel'));
      expect(screen.getByTestId('entry-recording-panel')).toContainElement(
        screen.getByText('slot-panel'),
      );
      expect(page()).not.toContainElement(screen.getByText('slot-panel'));
      expect(screen.queryByText('slot-toolbar')).toBeNull();
      expect(screen.queryByText('slot-suggestions')).toBeNull();
    });

    it('brings the toolbar back when the recording panel goes away', async () => {
      const props = {
        title: '',
        onTitleChange: jest.fn(),
        body: '',
        onBodyChange: jest.fn(),
        date: 'd',
        onSave: jest.fn(),
        onBack: jest.fn(),
        toolbar: <Text>slot-toolbar</Text>,
      };
      const { rerender } = await render(
        <AddEntryScreen {...props} recordingPanel={<Text>slot-panel</Text>} />,
      );
      expect(screen.queryByText('slot-toolbar')).toBeNull();
      await rerender(<AddEntryScreen {...props} />);
      expect(screen.getByText('slot-toolbar')).toBeTruthy();
      expect(screen.queryByTestId('entry-recording-panel')).toBeNull();
    });

    it('still lifts the dock with the keyboard', async () => {
      const originalOS = Platform.OS;
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
      const { emit } = fakeKeyboard();
      await renderLayout();
      await emit('keyboardDidShow', 300);
      expect(StyleSheet.flatten(dock().props.style).paddingBottom).toBe(334);
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
    });
  });

  describe('journal picker', () => {
    const openMenu = () => fireEvent.press(screen.getByLabelText('Journal: Dreams'));
    const option = (name: string) => screen.getByRole('menuitem', { name });

    it('shows the pill as a button with a chevron, closed by default', async () => {
      await renderPage();
      const pill = screen.getByRole('button', { name: 'Journal: Dreams' });
      expect(pill.props.accessibilityState).toMatchObject({ expanded: false });
      expect(screen.getByText('▾', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.queryByRole('menuitem')).toBeNull();
    });

    it('lists every offered journal in order, marking the current one', async () => {
      await renderPage();
      await openMenu();
      expect(screen.getAllByRole('menuitem').map((o) => o.props.accessibilityLabel)).toEqual([
        'Dreams',
        'Life',
        'Gratitude',
      ]);
      expect(option('Dreams').props.accessibilityState).toMatchObject({ selected: true });
      expect(option('Life').props.accessibilityState).toMatchObject({ selected: false });
      expect(
        screen.getByRole('button', { name: 'Journal: Dreams', hidden: true }).props
          .accessibilityState,
      ).toMatchObject({
        expanded: true,
      });
    });

    it('picking a journal switches at once and closes the menu', async () => {
      await renderPage();
      await openMenu();
      await fireEvent.press(option('Gratitude'));
      expect(screen.getByLabelText('Journal: Gratitude')).toBeTruthy();
      expect(screen.queryByRole('menuitem')).toBeNull();
    });

    it('closes on the backdrop and on Android back, changing nothing', async () => {
      const BackHandler = require('react-native').BackHandler;
      const add = jest.spyOn(BackHandler, 'addEventListener');
      await renderPage();
      await openMenu();
      await fireEvent.press(screen.getByLabelText('Close journal list'));
      expect(screen.queryByRole('menuitem')).toBeNull();
      expect(screen.getByLabelText('Journal: Dreams')).toBeTruthy();
      await openMenu();
      const handler = add.mock.calls.at(-1)![1] as () => boolean;
      await act(async () => {
        expect(handler()).toBe(true);
      });
      expect(screen.queryByRole('menuitem')).toBeNull();
      add.mockRestore();
    });

    it('does not offer a journal left out of the list (one being deleted)', async () => {
      await renderPage({ offered: [DREAMS, LIFE] });
      await openMenu();
      expect(screen.queryByRole('menuitem', { name: 'Gratitude' })).toBeNull();
      expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    });

    it('the check, its label and the title rule follow the picked journal', async () => {
      await renderPage();
      await fireEvent.changeText(screen.getByLabelText('Entry text'), 'a walk');
      expect(check().props.accessibilityState.disabled).toBe(true);
      await openMenu();
      await fireEvent.press(option('Life'));
      expect(check('Save entry').props.accessibilityState.disabled).toBe(false);
      // Back to Dreams: the title is required again.
      await fireEvent.press(screen.getByLabelText('Journal: Life'));
      await fireEvent.press(option('Dreams'));
      expect(check().props.accessibilityState.disabled).toBe(true);
    });

    it('keeps the typed title and body (with its tags) across a switch, and saves in the picked journal', async () => {
      await renderPage();
      await fireEvent.changeText(screen.getByLabelText('Title'), 'Flooded hall');
      await fireEvent.changeText(
        screen.getByLabelText('Entry text'),
        'it filled up #hallway #half',
      );
      await openMenu();
      await fireEvent.press(option('Gratitude'));
      expect(screen.getByLabelText('Title').props.value).toBe('Flooded hall');
      expect(bodyText(screen.getByLabelText('Entry text'))).toBe('it filled up #hallway #half');
      await fireEvent.press(check('Save entry'));
      await act(async () => {});
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          journalId: 'j_g1',
          requireTitle: false,
          details: expect.objectContaining({
            title: 'Flooded hall',
            transcript: 'it filled up #hallway #half',
            tags: ['hallway', 'half'],
          }),
        }),
      );
    });

    it('is a plain label with no chevron for a reopened draft or a finished entry', async () => {
      const draft: Dream = { ...stored, status: 'draft' };
      await renderPage({ open: { dream: draft, as: 'draft' } });
      expect(screen.queryByRole('button', { name: 'Journal: Dreams' })).toBeNull();
      expect(screen.getByLabelText('Journal: Dreams')).toBeTruthy();
      expect(screen.queryByText('▾', { includeHiddenElements: true })).toBeNull();
      await fireEvent.press(screen.getByLabelText('Journal: Dreams'));
      expect(screen.queryByRole('menuitem')).toBeNull();
      await screen.unmount();
      await renderPage({ open: { dream: stored, as: 'edit' } });
      expect(screen.queryByRole('button', { name: 'Journal: Dreams' })).toBeNull();
      expect(screen.queryByText('▾', { includeHiddenElements: true })).toBeNull();
    });

    it('is display only without a change handler', async () => {
      await render(
        <AddEntryScreen
          journal={DREAMS}
          journals={REGISTRY}
          title=""
          onTitleChange={() => {}}
          body=""
          onBodyChange={() => {}}
          date="d"
          onSave={() => {}}
          onBack={() => {}}
        />,
      );
      expect(screen.queryByText('▾', { includeHiddenElements: true })).toBeNull();
    });

    it('closes for good and locks the pill while a save is in flight', async () => {
      save.mockReturnValue(new Promise(() => {}));
      await renderPage({ journal: LIFE });
      await fireEvent.press(check('Save entry'));
      await fireEvent.press(screen.getByLabelText('Journal: Life'));
      expect(screen.queryByRole('menuitem')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Journal: Life' }).props.accessibilityState.disabled,
      ).toBe(true);
    });
  });
});
