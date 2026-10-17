import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler } from 'react-native';
import App from './App';
import { runBackChain } from './src/test/hardwareBackChain';
import { fakeKeyboard } from './src/test/fakeKeyboard';
import type { Dream } from './src/types/dream';
import { __fs } from './src/test/fakeFileSystem';

// Integration tests for the one shared "+" button owned by App: the real hooks, the real storage and the real
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
  rec('g1', 'Thankful for tea', { journalId: 'j_g1', transcript: 'tea', tags: ['tea'] }),
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

const fabs = () => screen.queryAllByLabelText('Add entry');
const pick = async (name: string) => {
  await fireEvent.press(screen.getByLabelText('Add entry'));
  await fireEvent.press(screen.getByRole('menuitem', { name: new RegExp(`^${name},`) }));
};
const openSearch = async () => {
  await openJournals();
  await fireEvent.press(screen.getByLabelText('Search all journals'));
};
const openLog = async (label: string) => {
  await openJournals();
  await fireEvent.press(screen.getByLabelText(label));
};

describe('App shared Add entry button', () => {
  it('shows exactly one button on Today, a log, Search and Settings, and none while the Journals drawer is open', async () => {
    await renderApp();
    expectToday();
    expect(fabs()).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('Open Settings'));
    expect(screen.getByRole('header', { name: 'Settings' })).toBeTruthy();
    expect(fabs()).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('Back to Today'));
    await openJournals();
    expect(fabs()).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Search all journals'));
    expect(fabs()).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('Back'));
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Gratitude, 1 entry'));
    expect(screen.getByRole('header', { name: 'Gratitude' })).toBeTruthy();
    expect(fabs()).toHaveLength(1);
  });

  it('is absent on the add page and back when it returns', async () => {
    await renderApp();
    await pick('Life');
    expect(screen.getByText('add-journal:life')).toBeTruthy();
    expect(fabs()).toHaveLength(0);
    await press('stub-add-back');
    expect(fabs()).toHaveLength(1);
  });

  it('a log has no "New dream"/"New entry" pill; the button opens the same sheet', async () => {
    await renderApp();
    await openLog('Gratitude, 1 entry');
    expect(screen.queryByLabelText('New entry')).toBeNull();
    expect(screen.queryByLabelText('New dream')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    for (const name of ['Dreams', 'Life', 'Gratitude', 'Travel']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(`^${name},`) })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'New journal' })).toBeTruthy();
  });

  // The log of Gratitude with a query typed (the log's view state lives in App).
  const openGratitudeWithQuery = async () => {
    await openLog('Gratitude, 1 entry');
    await fireEvent.press(screen.getByLabelText('Search Gratitude'));
    await fireEvent.changeText(screen.getByPlaceholderText('Search Gratitude'), 'tea');
  };
  const expectGratitudeWithQuery = () => {
    // The open search field replaces the title, so the field itself shows this is Gratitude's log.
    expect(screen.getByPlaceholderText('Search Gratitude')).toBeTruthy();
    expect(screen.getByDisplayValue('tea')).toBeTruthy();
    expect(screen.getByText('Thankful for tea')).toBeTruthy();
  };

  it('from a log: picking that journal opens the add page; Back and save return to the log', async () => {
    await renderApp();
    await openLog('Gratitude, 1 entry');
    await pick('Gratitude');
    expect(screen.getByText('add-journal:j_g1')).toBeTruthy();
    await press('stub-add-back');
    expect(screen.getByRole('header', { name: 'Gratitude' })).toBeTruthy();
    await pick('Gratitude');
    await press('stub-add-body');
    await press('stub-add-save');
    await settle();
    expect(screen.getByRole('header', { name: 'Gratitude' })).toBeTruthy();
  });

  it('log A, pick B, Save: back on log A with its query kept (the entry is stored in B)', async () => {
    await renderApp();
    await openGratitudeWithQuery();
    await pick('Travel');
    expect(screen.getByText('add-journal:j_t1')).toBeTruthy();
    await press('stub-add-body');
    await press('stub-add-save');
    await settle();
    expectGratitudeWithQuery();
    const stored = JSON.parse(__fs.read(`${DOC}/dreams.json`) ?? '[]') as { journalId?: string }[];
    expect(stored.filter((d) => d.journalId === 'j_t1')).toHaveLength(2);
  });

  it('log A, pick B, Back (empty page): back on log A with its query kept', async () => {
    await renderApp();
    await openGratitudeWithQuery();
    await pick('Travel');
    await press('stub-add-back');
    expectGratitudeWithQuery();
  });

  it('log A, pick B, Back then Discard of typed text: back on log A with its query kept', async () => {
    await renderApp();
    await openGratitudeWithQuery();
    await pick('Life');
    await press('stub-add-body');
    await press('stub-add-back');
    await act(async () => {
      lastButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.();
    });
    expectGratitudeWithQuery();
  });

  it('log A, pick B, Save draft: back on log A with its query kept', async () => {
    await renderApp();
    await openGratitudeWithQuery();
    await pick('Travel');
    await press('stub-add-body');
    await press('stub-add-back');
    await act(async () => {
      lastButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.();
    });
    await settle();
    expectGratitudeWithQuery();
    const stored = JSON.parse(__fs.read(`${DOC}/dreams.json`) ?? '[]') as {
      journalId?: string;
      status?: string;
    }[];
    expect(stored.filter((d) => d.journalId === 'j_t1' && d.status === 'draft')).toHaveLength(1);
  });

  it('from Search with a query: Save and Back both return to Search with the query kept', async () => {
    await renderApp();
    await openSearch();
    await fireEvent.changeText(screen.getByPlaceholderText(/search/i), 'tea');
    await pick('Life');
    expect(screen.getByText('add-journal:life')).toBeTruthy();
    await press('stub-add-back');
    expect(screen.getByDisplayValue('tea')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Journals' })).toBeNull();
    await pick('Life');
    await press('stub-add-body');
    await press('stub-add-save');
    await settle();
    expect(screen.getByDisplayValue('tea')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Journals' })).toBeNull();
    expect(fabs()).toHaveLength(1);
  });

  it('from Today: save returns to Today', async () => {
    await renderApp();
    await pick('Travel');
    await press('stub-add-body');
    await press('stub-add-save');
    await settle();
    expectToday();
  });

  it('from Settings: Back and Save both return to Settings', async () => {
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Open Settings'));
    await pick('Dreams');
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
    await press('stub-add-back');
    expect(screen.getByRole('header', { name: 'Settings' })).toBeTruthy();
    await pick('Life');
    await press('stub-add-body');
    await press('stub-add-save');
    await settle();
    expect(screen.getByRole('header', { name: 'Settings' })).toBeTruthy();
  });

  it('from Today after the Journals drawer was used: Back and Save return to Today, drawer closed', async () => {
    await renderApp();
    await openJournals();
    expect(fabs()).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Close journals'));
    await waitFor(() => expect(screen.queryByTestId('journals-drawer')).toBeNull());
    await pick('Travel');
    await press('stub-add-back');
    expectToday();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
    await pick('Travel');
    await press('stub-add-body');
    await press('stub-add-save');
    await settle();
    expectToday();
    expect(screen.queryByTestId('journals-drawer')).toBeNull();
  });

  it('is hidden while the Journals drawer or its Rename sheet is open, and back once both are closed', async () => {
    await renderApp();
    expect(fabs()).toHaveLength(1);
    await openJournals();
    expect(screen.queryAllByLabelText('Add entry', hidden)).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Rename Gratitude', hidden));
    expect(screen.getByText('Rename journal')).toBeTruthy();
    // Include elements the modal sheet hides from accessibility: the button must not be rendered at all.
    expect(screen.queryAllByLabelText('Add entry', hidden)).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.queryByText('Rename journal')).toBeNull();
    // The drawer is still open under the closed sheet.
    expect(screen.queryAllByLabelText('Add entry', hidden)).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Close journals'));
    expect(fabs()).toHaveLength(1);
  });

  it('is hidden while a keyboard is visible and back when it closes', async () => {
    const { emit } = fakeKeyboard();
    await renderApp();
    await openLog('Gratitude, 1 entry');
    expect(fabs()).toHaveLength(1);
    await emit('keyboardWillShow', 300);
    expect(fabs()).toHaveLength(0);
    await emit('keyboardWillHide', 0);
    expect(fabs()).toHaveLength(1);
  });

  it('is hidden while the New journal sheet is open over a log, and Create opens the new log', async () => {
    await renderApp();
    await openLog('Gratitude, 1 entry');
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('button', { name: 'New journal' }));
    expect(screen.getByRole('header', { name: 'New journal' })).toBeTruthy();
    expect(fabs()).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText('Journal name'), 'Ideas');
    await fireEvent.press(screen.getByLabelText('Create'));
    await settle();
    expect(screen.getByRole('header', { name: 'Ideas' })).toBeTruthy();
    expect(fabs()).toHaveLength(1);
  });
});
