import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler } from 'react-native';
import App from './App';
import type { Dream } from './src/types/dream';
import { __fs } from './src/test/fakeFileSystem';

// Defensive guards of the journal delete: a session open for the journal, a save in flight, and
// the log / entry screens of a journal that starts deleting. The entry-session hook and the
// Journals screen are stubbed (the real UI cannot reach these states); storage is real.
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
jest.mock('./src/screens/ReadItBackScreen', () => ({ ReadItBackScreen: () => null }));
jest.mock('./src/screens/AddEntryScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    AddEntryScreen: ({ onSave }: any) => (
      <Pressable onPress={onSave}>
        <Text>stub-done</Text>
      </Pressable>
    ),
  };
});
jest.mock('./src/screens/ReviewScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    ReviewScreen: ({ onDone }: any) => (
      <Pressable onPress={onDone}>
        <Text>stub-done</Text>
      </Pressable>
    ),
  };
});
// The newest "ask to delete" the Journals screen was given. It only reads refs, so it still works
// after the screen is gone: that is how a delete is started while another screen is showing.
let mockAsk: ((id: string) => void) | null = null;
jest.mock('./src/screens/JournalsScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    JournalsScreen: ({ onDeleteJournal, onOpenJournal, onBack, deletingId }: any) => {
      mockAsk = onDeleteJournal;
      return (
        <>
          <Text>journals-screen</Text>
          <Text>{`deleting:${deletingId}`}</Text>
          <Pressable onPress={() => onOpenJournal('j_g1')}>
            <Text>open-j_g1</Text>
          </Pressable>
          <Pressable onPress={onBack}>
            <Text>journals-back</Text>
          </Pressable>
        </>
      );
    },
  };
});
let mockSession: any = null;
let mockEntrySession: any = null;
let mockSaveGate: Promise<unknown> | null = null;
jest.mock('./src/hooks/useDreamSession', () => ({
  useDreamSession: () =>
    new Proxy(
      { session: mockSession, save: () => mockSaveGate, isSaving: () => false },
      { get: (t: any, k) => (k in t ? t[k] : jest.fn()) },
    ),
}));

jest.mock('./src/hooks/useEntrySession', () => ({
  ...jest.requireActual('./src/hooks/useEntrySession'),
  useEntrySession: () =>
    new Proxy(
      { session: mockEntrySession, save: () => mockSaveGate, isSaving: () => false },
      { get: (t: any, k) => (k in t ? t[k] : jest.fn()) },
    ),
}));

// What the world looked like at the moment the registry entry was removed, and how often it was.
let mockRemoveJournalCalls: { id: string; entriesLeft: string[] }[] = [];
jest.mock('./src/services/journalStorage', () => {
  const actual = jest.requireActual('./src/services/journalStorage');
  return {
    ...actual,
    removeJournal: (id: string) => {
      const { __fs: fs } = require('./src/test/fakeFileSystem');
      const text = fs.read('file:///document/dreams.json');
      const list: { id: string; journalId?: string }[] = text ? JSON.parse(text) : [];
      mockRemoveJournalCalls.push({
        id,
        entriesLeft: list.filter((d) => d.journalId === id).map((d) => d.id),
      });
      return actual.removeJournal(id);
    },
  };
});
// A test can hold every entry delete until it opens the gate.
let mockGate: Promise<void> | null = null;
// Runs after each real entry delete (to simulate something else changing the store).
let mockAfterDelete: ((id: string) => void) | null = null;
jest.mock('./src/services/dreamStorage', () => {
  const actual = jest.requireActual('./src/services/dreamStorage');
  return {
    ...actual,
    deleteDream: async (id: string) => {
      if (mockGate) await mockGate;
      await actual.deleteDream(id);
      mockAfterDelete?.(id);
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
const withAudio = (id: string): Partial<Dream> => ({
  durationMs: 5000,
  audioFileName: `${id}.m4a`,
});

const gratitude = {
  id: 'j_g1',
  name: 'Gratitude',
  kind: 'journal',
  createdAt: '2026-10-09T08:00:00Z',
};
const travel = { id: 'j_t1', name: 'Travel', kind: 'journal', createdAt: '2026-10-09T09:00:00Z' };

// Three Gratitude entries (two finished, one with audio, and a draft), one Travel entry, and one
// each of Dreams (legacy, no journalId), Dreams (explicit) and Life.
const RECORDS = [
  rec('d1', 'Old dream', withAudio('d1')), // legacy: no journalId, counts as Dreams
  rec('d2', 'Explicit dream', { journalId: 'dreams' }),
  rec('l1', 'Walk', { journalId: 'life', transcript: 'went for a walk' }),
  rec('g1', 'Thankful for tea', { journalId: 'j_g1', transcript: 'tea', ...withAudio('g1') }),
  rec('g2', 'Half-written', { journalId: 'j_g1', status: 'draft' }),
  rec('g3', 'Warm sun', { journalId: 'j_g1', transcript: 'sun' }),
  rec('t1', 'Lisbon trip', { journalId: 'j_t1', transcript: 'trams' }),
];

const putAll = (records = RECORDS, journals = [gratitude, travel]) => {
  __fs.put(`${DOC}/journals.json`, JSON.stringify({ version: 1, journals }));
  __fs.put(`${DOC}/settings.json`, JSON.stringify({ autoOpenDreamCapture: false }));
  __fs.put(`${DOC}/dreams.json`, JSON.stringify(records));
  for (const r of records) {
    if (r.audioFileName) __fs.put(`${DOC}/dreams/${r.audioFileName}`, 'audio');
  }
};
const storedIds = () =>
  (JSON.parse(__fs.read(`${DOC}/dreams.json`) ?? '[]') as { id: string }[]).map((d) => d.id);
const storedJournals = () =>
  (
    JSON.parse(__fs.read(`${DOC}/journals.json`) ?? '{"journals":[]}').journals as { id: string }[]
  ).map((j) => j.id);

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function renderApp() {
  await render(<App />);
  await settle();
}
const lastButtons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
const pressAlert = (text: string) =>
  act(async () => {
    lastButtons()
      .find((b) => b.text === text)
      ?.onPress?.();
  });
const ask = (id: string) =>
  act(async () => {
    mockAsk?.(id);
  });
const press = (text: string) => fireEvent.press(screen.getByText(text));
const untouched = () => {
  expect(storedIds()).toEqual(RECORDS.map((r) => r.id));
  expect(storedJournals()).toEqual(['j_g1', 'j_t1']);
  expect(mockRemoveJournalCalls).toEqual([]);
};

beforeEach(() => {
  jest.clearAllMocks();
  __fs.reset();
  mockRemoveJournalCalls = [];
  mockGate = null;
  mockAfterDelete = null;
  mockAsk = null;
  mockSession = null;
  mockEntrySession = null;
  mockSaveGate = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove: () => {} }));
  putAll();
});
afterEach(() => jest.restoreAllMocks());

describe('App journal delete live guards', () => {
  it('refuses to ask while a session is open for that journal', async () => {
    mockSession = { journalId: 'j_g1', origin: 'write', title: '', tags: [] };
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Open Journals'));
    await ask('j_g1');
    expect(Alert.alert).not.toHaveBeenCalled();
    untouched();
  });

  it('refuses a confirmed delete if a session for that journal opened while the dialog was up', async () => {
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Open Journals'));
    await ask('j_g1');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    mockSession = { journalId: 'j_g1', origin: 'write', title: '', tags: [] };
    await press('journals-back');
    await fireEvent.press(screen.getByLabelText('Open Journals'));
    await pressAlert('Delete');
    await settle();
    untouched();
  });

  it('refuses while a save is in flight', async () => {
    // A draft on Today opens the add-entry page; the check starts a save that stays pending.
    __fs.put(
      `${DOC}/dreams.json`,
      JSON.stringify([...RECORDS, rec('dr', 'Unfinished', { status: 'draft' })]),
    );
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Open Journals'));
    await press('journals-back');
    mockEntrySession = { journalId: 'dreams', origin: 'draft', title: 'x', body: '', tags: [] };
    let finish!: () => void;
    mockSaveGate = new Promise((resolve) => {
      finish = () => resolve(false);
    });
    await fireEvent.press(screen.getByText('Unfinished'));
    await press('stub-done');
    await ask('j_g1');
    expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(storedIds()).toEqual([...RECORDS.map((r) => r.id), 'dr']);
    expect(storedJournals()).toEqual(['j_g1', 'j_t1']);
    expect(mockRemoveJournalCalls).toEqual([]);
  });

  it('refuses a confirmed delete if a save started while the dialog was up', async () => {
    __fs.put(
      `${DOC}/dreams.json`,
      JSON.stringify([...RECORDS, rec('dr', 'Unfinished', { status: 'draft' })]),
    );
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Open Journals'));
    await ask('j_g1');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = lastButtons();
    await press('journals-back');
    mockEntrySession = { journalId: 'dreams', origin: 'draft', title: 'x', body: '', tags: [] };
    let finish!: () => void;
    mockSaveGate = new Promise((resolve) => {
      finish = () => resolve(false);
    });
    await fireEvent.press(screen.getByText('Unfinished'));
    await press('stub-done');
    await act(async () => {
      buttons.find((b) => b.text === 'Delete')?.onPress?.();
    });
    await act(async () => finish());
    await settle();
    expect(storedIds()).toEqual([...RECORDS.map((r) => r.id), 'dr']);
    expect(storedJournals()).toEqual(['j_g1', 'j_t1']);
  });

  describe('a screen of the journal that starts deleting', () => {
    let open: () => void;
    beforeEach(() => {
      mockGate = new Promise<void>((resolve) => {
        open = resolve;
      });
    });
    const startFrom = async () => {
      await ask('j_g1');
      await pressAlert('Delete');
    };

    it('sends its open log back to Journals home', async () => {
      await renderApp();
      await fireEvent.press(screen.getByLabelText('Open Journals'));
      await press('open-j_g1');
      expect(screen.getByText('Thankful for tea')).toBeTruthy();
      await startFrom();
      expect(screen.getByText('journals-screen')).toBeTruthy();
      expect(screen.getByText('deleting:j_g1')).toBeTruthy();
      expect(screen.queryByText('Thankful for tea')).toBeNull();
      await act(async () => open());
      await waitFor(() => expect(mockRemoveJournalCalls).toHaveLength(1));
      await settle();
      expect(screen.getByText('journals-screen')).toBeTruthy();
    });

    it('sends its open entry back to Journals home without crashing', async () => {
      await renderApp();
      await fireEvent.press(screen.getByLabelText('Open Journals'));
      await press('open-j_g1');
      await fireEvent.press(screen.getByText('Thankful for tea'));
      await startFrom();
      expect(screen.getByText('journals-screen')).toBeTruthy();
      await act(async () => open());
      await waitFor(() => expect(mockRemoveJournalCalls).toHaveLength(1));
      await settle();
      expect(screen.getByText('journals-screen')).toBeTruthy();
      expect(storedIds()).toEqual(['d1', 'd2', 'l1', 't1']);
    });
  });
});
