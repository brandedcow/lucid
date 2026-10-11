import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler } from 'react-native';
import App from './App';
import type { Dream } from './src/types/dream';
import { __fs } from './src/test/fakeFileSystem';

// Integration tests for renaming a custom journal: the real hooks, the real storage and the real
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
}));
jest.mock('./src/screens/CaptureScreen', () => ({ CaptureScreen: () => null }));
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
const lastButtons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];

let handlers: (() => boolean)[] = [];
const hardwareBack = async () => {
  let handled = false;
  await act(async () => {
    handled = handlers.at(-1)?.() ?? false;
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

describe('App Add entry button on Journals home', () => {
  it('shows the button on Journals home and the sheet lists every journal', async () => {
    await renderApp();
    await openJournals();
    expectJournals();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    for (const name of ['Dreams', 'Life', 'Gratitude', 'Travel']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(`^${name},`) })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'New journal' })).toBeTruthy();
  });

  it('is not shown on other screens it was not added to (the log)', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Gratitude, 1 entry'));
    expect(screen.queryByLabelText('Add entry')).toBeNull();
  });

  it('picking a journal opens the add-entry page; Back returns to Today', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('menuitem', { name: /^Gratitude,/ }));
    expect(screen.getByText('add-journal:j_g1')).toBeTruthy();
    await press('stub-add-back');
    expectToday();
  });

  it('Android back from that page returns to Today', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('menuitem', { name: /^Travel,/ }));
    expect(screen.getByText('add-journal:j_t1')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expectToday();
  });

  it('a Dreams page started here returns to Today without marking No dream', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('menuitem', { name: /^Dreams,/ }));
    await press('stub-add-back');
    expectToday();
    expect(screen.queryByText('No dream today')).toBeNull();
  });

  it('after a save the user is on Today, and the entry is stored in that journal', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('menuitem', { name: /^Gratitude,/ }));
    await press('stub-add-body');
    await press('stub-add-save');
    await settle();
    expectToday();
    const stored = JSON.parse(__fs.read(`${DOC}/dreams.json`) ?? '[]') as { journalId?: string }[];
    expect(stored.filter((d) => d.journalId === 'j_g1')).toHaveLength(3);
  });

  it("New journal opens the name sheet; Create opens the new journal's empty log", async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('button', { name: 'New journal' }));
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.getByRole('header', { name: 'New journal' })).toBeTruthy();
    // One overlay at a time: the button is gone while the name sheet is up.
    expect(screen.queryByLabelText('Add entry')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Journal name'), 'Ideas');
    await fireEvent.press(screen.getByLabelText('Create'));
    await settle();
    expect(screen.getByRole('header', { name: 'Ideas' })).toBeTruthy();
    expect(__fs.read(`${DOC}/journals.json`)).toContain('Ideas');
    expect(screen.queryByLabelText('Journal name')).toBeNull();
  });

  it('cancelling the name sheet stays on Journals home with the button back', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('button', { name: 'New journal' }));
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expectJournals();
    expect(screen.getByLabelText('Add entry')).toBeTruthy();
  });

  it('Android back closes the sheet first, then leaves Journals home to Today', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    expect(screen.getByRole('menuitem', { name: /^Dreams,/ })).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    expectJournals();
    expect(await hardwareBack()).toBe(true);
    expectToday();
  });

  it('the Rename sheet and the Add entry sheet are never open together', async () => {
    await renderApp();
    await openJournals();
    await fireEvent.press(screen.getByLabelText('Rename Gratitude', hidden));
    expect(screen.getByText('Rename journal')).toBeTruthy();
    expect(screen.queryByLabelText('Add entry')).toBeNull();
  });

  it('is hidden while a journal is being deleted, and the journal card stays', async () => {
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
    expect(screen.getByLabelText('Add entry').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Gratitude, deleting')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    expect(screen.queryByRole('menuitem')).toBeNull();
    await act(async () => {
      open();
    });
    await settle();
    expect(screen.queryByLabelText(/^Gratitude/)).toBeNull();
    expect(screen.getByLabelText('Add entry').props.accessibilityState.disabled).toBe(false);
  });
});
