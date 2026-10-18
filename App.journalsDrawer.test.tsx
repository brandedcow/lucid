import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler } from 'react-native';
import App from './App';
import { runBackChain } from './src/test/hardwareBackChain';
import type { Dream } from './src/types/dream';
import { __fs } from './src/test/fakeFileSystem';

// Integration tests for the Journals drawer on Today: the real hooks, the real storage and the real
// screens, on the in-memory file system. Only native modules are faked.
jest.mock('expo-file-system', () => jest.requireActual('./src/test/fakeFileSystem'));
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 800 },
    insets: { top: 0, left: 0, right: 0, bottom: 34 },
  };
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => (
      <actual.SafeAreaProvider initialMetrics={metrics}>{children}</actual.SafeAreaProvider>
    ),
  };
});
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: {} },
}));
jest.mock('./src/screens/AddEntryScreen', () => {
  const { Text, Pressable } = jest.requireActual('react-native');
  return {
    AddEntryScreen: (p: {
      journal: { id: string };
      onBack: () => void;
      onBodyChange: (t: string) => void;
      onSave: () => void;
    }) => (
      <>
        <Text>{`add-journal:${p.journal.id}`}</Text>
        <Pressable onPress={p.onBack}>
          <Text>stub-add-back</Text>
        </Pressable>
        <Pressable onPress={() => p.onBodyChange('some words')}>
          <Text>stub-add-body</Text>
        </Pressable>
        <Pressable onPress={p.onSave}>
          <Text>stub-add-save</Text>
        </Pressable>
      </>
    ),
  };
});
// A test can hold every entry delete until it opens the gate.
let mockGate: Promise<void> | null = null;
jest.mock('./src/services/dreamStorage', () => {
  const actual = jest.requireActual('./src/services/dreamStorage');
  return {
    ...actual,
    deleteDream: async (id: string) => {
      if (mockGate) await mockGate;
      await actual.deleteDream(id);
    },
  };
});

const DOC = 'file:///document';
const now = new Date().toISOString();
const rec = (id: string, title: string, extra: Partial<Dream> = {}): Dream => ({
  id,
  createdAt: now,
  durationMs: 0,
  title,
  tags: [],
  ...extra,
});
const gratitude = {
  id: 'j_g1',
  name: 'Gratitude',
  kind: 'journal',
  createdAt: '2026-10-09T08:00:00Z',
};
const travel = { id: 'j_t1', name: 'Travel', kind: 'journal', createdAt: '2026-10-09T09:00:00Z' };
const RECORDS = [
  rec('d1', 'Old dream'),
  rec('l1', 'Walk', { journalId: 'life', transcript: 'went for a walk' }),
  rec('g1', 'Thankful for tea', { journalId: 'j_g1', transcript: 'tea' }),
  rec('g2', 'Half-written', { journalId: 'j_g1', status: 'draft' }),
  rec('t1', 'Lisbon trip', { journalId: 'j_t1', transcript: 'trams' }),
];

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function renderApp() {
  await render(<App />);
  await settle();
}
const hidden = { includeHiddenElements: true };
const openJournals = () => fireEvent.press(screen.getByLabelText('Open Journals'));
const press = (text: string) => fireEvent.press(screen.getByText(text));
const expectToday = () => expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
const expectJournals = () => expect(screen.getByRole('header', { name: 'Journals' })).toBeTruthy();
// The drawer slides out before it unmounts; until then it hides the page from queries.
const drawerGone = () => waitFor(() => expect(screen.queryByTestId('journals-drawer')).toBeNull());
const closeDrawer = async () => {
  await fireEvent.press(screen.getByLabelText('Close journals'));
  await drawerGone();
};
const lastButtons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];

let handlers: (() => boolean)[] = [];
const hardwareBack = async () => {
  let handled = false;
  await act(async () => {
    handled = runBackChain(handlers);
  });
  return handled;
};

beforeEach(() => {
  jest.clearAllMocks();
  __fs.reset();
  mockGate = null;
  handlers = [];
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
    handlers.push(h as () => boolean);
    return {
      remove: () => {
        handlers = handlers.filter((x) => x !== h);
      },
    };
  });
  __fs.put(`${DOC}/journals.json`, JSON.stringify({ version: 1, journals: [gratitude, travel] }));
  __fs.put(`${DOC}/settings.json`, JSON.stringify({ autoOpenDreamCapture: false }));
  __fs.put(`${DOC}/dreams.json`, JSON.stringify(RECORDS));
});
afterEach(() => jest.restoreAllMocks());

describe('App Journals drawer on Today', () => {
  it('lists every journal with counts, Search and New journal; there is no Journals screen', async () => {
    await renderApp();
    expect(screen.queryByRole('header', { name: 'Journals' })).toBeNull();
    await openJournals();
    expectJournals();
    for (const label of [
      'Dreams, 1 dream',
      'Life, 1 entry',
      'Gratitude, 1 entry',
      'Travel, 1 entry',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByLabelText('Search all journals')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New journal' })).toBeTruthy();
    // Today stays underneath.
    expect(screen.getByText('Old dream', hidden)).toBeTruthy();
  });

  it('hides the + button while open and brings it back when closed', async () => {
    await renderApp();
    expect(screen.getByLabelText('Add entry')).toBeTruthy();
    await openJournals();
    expect(screen.queryByLabelText('Add entry')).toBeNull();
    await closeDrawer();
    expectToday();
    expect(screen.getByLabelText('Add entry')).toBeTruthy();
  });

  it('the backdrop closes it and shows Today again', async () => {
    await renderApp();
    await openJournals();
    await closeDrawer();
    expectToday();
    expect(screen.queryByLabelText('Close journals')).toBeNull();
  });

  it('picking a journal closes the drawer and opens its log; Back returns to Today with the drawer closed', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Gratitude, 1 entry'));
    expect(screen.getByRole('header', { name: 'Gratitude' })).toBeTruthy();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Back'));
    expectToday();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
    expect(screen.queryByRole('header', { name: 'Journals' })).toBeNull();
    expect(screen.getByLabelText('Add entry')).toBeTruthy();
  });

  it('Android back from a log returns to Today, and the next Back leaves the app', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Travel, 1 entry'));
    expect(await hardwareBack()).toBe(true);
    // Today stays mounted under the log, so the drawer's slide-out finishes there.
    await drawerGone();
    expectToday();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
    expect(await hardwareBack()).toBe(false);
  });

  it('Search closes the drawer and opens Search; Back returns to Today with the drawer closed', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Search all journals'));
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
    expect(screen.getByText('Lisbon trip')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expectToday();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
  });

  it('Android back closes the drawer first, then leaves the app from Today', async () => {
    await renderApp();
    await openJournals();
    expect(await hardwareBack()).toBe(true);
    await drawerGone();
    expectToday();
    expect(await hardwareBack()).toBe(false);
  });

  it('Android back closes the Add entry sheet first (drawer closed), then leaves the app', async () => {
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    expect(screen.getByRole('menuitem', { name: /^Dreams,/ })).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    expect(await hardwareBack()).toBe(false);
  });

  it('the + sheet works after the drawer: pick a journal, Back and Save return to Today', async () => {
    await renderApp();
    await openJournals();
    await closeDrawer();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('menuitem', { name: /^Gratitude,/ }));
    expect(screen.getByText('add-journal:j_g1')).toBeTruthy();
    await press('stub-add-back');
    expectToday();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('menuitem', { name: /^Gratitude,/ }));
    await press('stub-add-body');
    await press('stub-add-save');
    await settle();
    expectToday();
    const stored = JSON.parse(__fs.read(`${DOC}/dreams.json`) ?? '[]') as { journalId?: string }[];
    expect(stored.filter((d) => d.journalId === 'j_g1')).toHaveLength(3);
  });

  it("New journal opens the name sheet over the drawer; Create opens the new journal's empty log", async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByRole('button', { name: 'New journal' }));
    expect(screen.getByRole('header', { name: 'New journal' })).toBeTruthy();
    // One overlay at a time: the + button stays hidden under the sheet.
    expect(screen.queryByLabelText('Add entry')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Journal name'), 'Ideas');
    await fireEvent.press(screen.getByLabelText('Create'));
    await settle();
    expect(screen.getByRole('header', { name: 'Ideas' })).toBeTruthy();
    expect(__fs.read(`${DOC}/journals.json`)).toContain('Ideas');
    expect(screen.queryByLabelText('Journal name')).toBeNull();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Back'));
    await drawerGone();
    expectToday();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
  });

  it('cancelling the name sheet leaves the drawer open, with the + button still hidden', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByRole('button', { name: 'New journal' }));
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expectJournals();
    expect(screen.queryByLabelText('Journal name')).toBeNull();
    expect(screen.queryByLabelText('Add entry')).toBeNull();
  });

  it('the + sheet "New journal" still opens the name sheet over Today (drawer closed)', async () => {
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('button', { name: 'New journal' }));
    expect(screen.getByRole('header', { name: 'New journal' })).toBeTruthy();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
  });

  it('the Rename sheet and the + button are never shown together', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Rename Gratitude', hidden));
    expect(screen.getByText('Rename journal')).toBeTruthy();
    expect(screen.queryByLabelText('Add entry')).toBeNull();
  });

  it('while a journal is being deleted the card stays dimmed in the drawer, and the drawer cannot be reopened until it ends', async () => {
    let open: () => void = () => {};
    mockGate = new Promise<void>((resolve) => {
      open = resolve;
    });
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Delete Gratitude', hidden));
    await act(async () => {
      lastButtons()
        .find((b) => b.text === 'Delete')
        ?.onPress?.();
    });
    expect(screen.getByLabelText('Gratitude, deleting')).toBeTruthy();
    expect(screen.queryByLabelText('Add entry')).toBeNull();
    await closeDrawer();
    // Closing is allowed; opening again is not.
    const book = screen.getByLabelText('Open Journals');
    expect(book.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(book);
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
    expect(screen.getByLabelText('Add entry').props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      open();
    });
    await settle();
    expect(screen.getByLabelText('Open Journals').props.accessibilityState).toMatchObject({
      disabled: false,
    });
    await openJournals();
    expect(screen.queryByLabelText(/^Gratitude/)).toBeNull();
  });
});
