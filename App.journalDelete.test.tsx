import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler } from 'react-native';
import App from './App';
import type { Dream } from './src/types/dream';
import { __fs } from './src/test/fakeFileSystem';

// Integration tests for deleting a custom journal: the real hooks, the real storage and the real
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

// The recording flow is not under test here and needs native modules.

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
const hidden = { includeHiddenElements: true };
const lastButtons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
const lastAlert = () => jest.mocked(Alert.alert).mock.calls.at(-1) as unknown[];
const pressAlert = (text: string) =>
  act(async () => {
    lastButtons()
      .find((b) => b.text === text)
      ?.onPress?.();
  });
const openJournals = () => fireEvent.press(screen.getByLabelText('Open Journals'));
const swipeDelete = (name: string) =>
  fireEvent.press(screen.getByLabelText(`Delete ${name}`, hidden));
const waitForDone = (name: string) =>
  waitFor(() => expect(screen.queryByLabelText(new RegExp(`^${name}`))).toBeNull());

beforeEach(() => {
  jest.clearAllMocks();
  __fs.reset();
  mockRemoveJournalCalls = [];
  mockGate = null;
  mockAfterDelete = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove: () => {} }));
  putAll();
});
afterEach(() => jest.restoreAllMocks());

describe('App delete a custom journal', () => {
  it('asks first, naming the journal, counting drafts and mentioning recordings', async () => {
    await renderApp();
    await openJournals();
    await swipeDelete('Gratitude');
    expect(lastAlert()[0]).toBe('Delete "Gratitude"?');
    expect(lastAlert()[1]).toBe(
      "The journal, all 3 entries and their recordings will be permanently deleted. This can't be undone.",
    );
    expect(lastButtons().map((b) => [b.text, b.style])).toEqual([
      ['Keep', 'cancel'],
      ['Delete', 'destructive'],
    ]);
    // Nothing has been touched yet.
    expect(storedIds()).toHaveLength(RECORDS.length);
  });

  it('Keep deletes nothing and the card stays swipeable', async () => {
    await renderApp();
    await openJournals();
    await swipeDelete('Gratitude');
    await pressAlert('Keep');
    expect(storedIds()).toEqual(RECORDS.map((r) => r.id));
    expect(storedJournals()).toEqual(['j_g1', 'j_t1']);
    expect(mockRemoveJournalCalls).toEqual([]);
    expect(screen.getByLabelText('Gratitude, 2 entries')).toBeTruthy();
    // A second request works again (the dialog guard was released).
    await swipeDelete('Gratitude');
    expect(jest.mocked(Alert.alert)).toHaveBeenCalledTimes(2);
  });

  it('deleting every entry (finished and draft), then the journal, last; others untouched', async () => {
    await renderApp();
    await openJournals();
    await swipeDelete('Gratitude');
    await pressAlert('Delete');
    await waitForDone('Gratitude');

    // Only the journal's own entries are gone, drafts included.
    expect(storedIds()).toEqual(['d1', 'd2', 'l1', 't1']);
    // Its recording is gone; every other recording is still there.
    expect(__fs.has(`${DOC}/dreams/g1.m4a`)).toBe(false);
    expect(__fs.has(`${DOC}/dreams/d1.m4a`)).toBe(true);
    // The registry no longer lists it; Travel does.
    expect(storedJournals()).toEqual(['j_t1']);
    // The registry was changed after every one of its entries was already gone.
    expect(mockRemoveJournalCalls).toEqual([{ id: 'j_g1', entriesLeft: [] }]);
    // The card is gone, the others remain with their counts, and no alert was shown after confirm.
    expect(screen.getByLabelText('Dreams, 2 dreams')).toBeTruthy();
    expect(screen.getByLabelText('Life, 1 entry')).toBeTruthy();
    expect(screen.getByLabelText('Travel, 1 entry')).toBeTruthy();
    expect(jest.mocked(Alert.alert)).toHaveBeenCalledTimes(1);
  });

  it('removes a journal with no entries without touching any entry', async () => {
    putAll(RECORDS.filter((r) => r.journalId !== 'j_g1'));
    await renderApp();
    await openJournals();
    await swipeDelete('Gratitude');
    expect(lastAlert()[1]).toBe(
      "This journal has no entries. It will be permanently deleted. This can't be undone.",
    );
    await pressAlert('Delete');
    await waitForDone('Gratitude');
    expect(storedIds()).toEqual(['d1', 'd2', 'l1', 't1']);
    expect(storedJournals()).toEqual(['j_t1']);
  });

  it('never offers Delete on Dreams or Life', async () => {
    await renderApp();
    await openJournals();
    expect(screen.queryByLabelText('Delete Dreams', hidden)).toBeNull();
    expect(screen.queryByLabelText('Delete Life', hidden)).toBeNull();
    expect(screen.getByLabelText('Delete Travel', hidden)).toBeTruthy();
  });

  describe('while it runs', () => {
    let open: () => void;
    beforeEach(() => {
      mockGate = new Promise<void>((resolve) => {
        open = resolve;
      });
    });

    const startDelete = async () => {
      await renderApp();
      await openJournals();
      await swipeDelete('Gratitude');
      await pressAlert('Delete');
    };

    it('greys and locks the card, locks other swipes and keeps navigation free', async () => {
      await startDelete();
      expect(screen.getByLabelText('Gratitude, deleting')).toBeTruthy();
      expect(screen.getByText('Deleting...')).toBeTruthy();
      // Delete cannot fire twice, and the other custom card cannot be swiped to delete either.
      const alerts = jest.mocked(Alert.alert).mock.calls.length;
      await swipeDelete('Gratitude');
      await swipeDelete('Travel');
      expect(jest.mocked(Alert.alert)).toHaveBeenCalledTimes(alerts);
      // Other journals still open.
      await fireEvent.press(screen.getByLabelText('Travel, 1 entry'));
      expect(screen.getByText('Lisbon trip')).toBeTruthy();
      await act(async () => open());
      await settle();
      expect(storedJournals()).toEqual(['j_t1']);
    });

    it('keeps the card count unfiltered', async () => {
      await startDelete();
      expect(screen.getByText('Deleting...')).toBeTruthy();
      expect(screen.getByLabelText('Dreams, 2 dreams')).toBeTruthy();
      await act(async () => open());
      await settle();
    });

    it('hides its entries on Today and its row in the Add entry sheet, and restores nothing early', async () => {
      await startDelete();
      await fireEvent.press(screen.getByLabelText('Back to Today'));
      expect(screen.getByLabelText('Add entry')).toBeTruthy();
      expect(screen.queryByText('Thankful for tea')).toBeNull();
      expect(screen.queryByText('Half-written')).toBeNull();
      expect(screen.getByText('Old dream')).toBeTruthy();
      expect(screen.getByText('Lisbon trip')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Add entry'));
      expect(screen.queryByRole('menuitem', { name: /^Gratitude,/ })).toBeNull();
      expect(screen.getByRole('menuitem', { name: /^Travel,/ })).toBeTruthy();
      await act(async () => open());
      await settle();
    });

    it('hides its entries in Search', async () => {
      await startDelete();
      await fireEvent.press(screen.getByLabelText('Search all journals'));
      expect(screen.getByText('Lisbon trip')).toBeTruthy();
      expect(screen.queryByText('Thankful for tea')).toBeNull();
      expect(screen.queryByText('Warm sun')).toBeNull();
      await act(async () => open());
      await settle();
    });

    it('ignores an entry delete elsewhere, and a second journal delete', async () => {
      await startDelete();
      await fireEvent.press(screen.getByLabelText('Back to Today'));
      const row = screen.getByLabelText(/^Old dream/);
      await act(async () => {
        row.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } });
      });
      await pressAlert('Delete');
      await act(async () => open());
      await settle();
      await waitFor(() => expect(storedJournals()).toEqual(['j_t1']));
      // The dream the user tried to delete in the meantime is still there.
      expect(storedIds()).toEqual(['d1', 'd2', 'l1', 't1']);
    });
  });

  describe('when it fails', () => {
    it('stops in the middle: remaining count, alert, journal still listed, retry works', async () => {
      // g1 is deleted, then g2 (a draft), and g3 fails (its file is blocked): the last delete.
      putAll(RECORDS.map((r) => (r.id === 'g3' ? { ...r, ...withAudio('g3') } : r)));
      __fs.failWhen('delete', (uri) => uri.endsWith('g3.m4a'));
      await renderApp();
      await openJournals();
      await swipeDelete('Gratitude');
      await pressAlert('Delete');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
      expect(lastAlert()[0]).toBe('Could not delete "Gratitude"');
      expect(lastAlert()[1]).toBe('Deleted 2 of 3 entries. 1 still remains. Try again.');
      // Entries after the failed one were not attempted; the journal is still registered.
      expect(storedIds()).toEqual(['d1', 'd2', 'l1', 'g3', 't1']);
      expect(storedJournals()).toEqual(['j_g1', 'j_t1']);
      expect(mockRemoveJournalCalls).toEqual([]);
      // The card is back to normal with the live remaining count.
      expect(screen.getByLabelText('Gratitude, 1 entry')).toBeTruthy();
      expect(screen.queryByText('Deleting...')).toBeNull();
      await swipeDelete('Gratitude');
      expect(lastAlert()[1]).toBe(
        "The journal, its entry and the recording will be permanently deleted. This can't be undone.",
      );
      await pressAlert('Keep');

      // Retry once the cause is gone.
      __fs.clearFailures();
      await swipeDelete('Gratitude');
      await pressAlert('Delete');
      await waitForDone('Gratitude');
      expect(storedIds()).toEqual(['d1', 'd2', 'l1', 't1']);
      expect(storedJournals()).toEqual(['j_t1']);
    });

    it('shows its entries on Today again after a failure', async () => {
      putAll(RECORDS.map((r) => (r.id === 'g3' ? { ...r, ...withAudio('g3') } : r)));
      __fs.failWhen('delete', (uri) => uri.endsWith('g3.m4a'));
      await renderApp();
      await openJournals();
      await swipeDelete('Gratitude');
      await pressAlert('Delete');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
      await fireEvent.press(screen.getByLabelText('Back to Today'));
      expect(screen.getByText('Warm sun')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Add entry'));
      expect(screen.getByRole('menuitem', { name: /^Gratitude,/ })).toBeTruthy();
    });

    it('does not remove the journal if an entry for it appears just before the registry step', async () => {
      // After the last entry is deleted, another entry of the same journal shows up in the store.
      mockAfterDelete = (id) => {
        if (id !== 'g3') return;
        const list = JSON.parse(__fs.read(`${DOC}/dreams.json`) ?? '[]');
        list.push(rec('g9', 'Late arrival', { journalId: 'j_g1', transcript: 'late' }));
        __fs.put(`${DOC}/dreams.json`, JSON.stringify(list));
      };
      await renderApp();
      await openJournals();
      await swipeDelete('Gratitude');
      await pressAlert('Delete');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
      expect(lastAlert()[0]).toBe('Could not delete "Gratitude"');
      expect(lastAlert()[1]).toBe('Deleted 3 of 4 entries. 1 still remains. Try again.');
      expect(mockRemoveJournalCalls).toEqual([]);
      expect(storedJournals()).toEqual(['j_g1', 'j_t1']);
      expect(storedIds()).toContain('g9');
      expect(screen.getByLabelText('Gratitude, 1 entry')).toBeTruthy();
    });

    it('keeps the empty journal listed when only its registry removal fails', async () => {
      __fs.failWhen('write', (uri) => uri.includes('journals.tmp'));
      await renderApp();
      await openJournals();
      await swipeDelete('Gratitude');
      await pressAlert('Delete');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
      expect(lastAlert()[0]).toBe('Could not remove "Gratitude"');
      expect(lastAlert()[1]).toBe(
        'All its entries were deleted, but the journal itself could not be removed. It is still listed, now empty. Try again.',
      );
      expect(storedIds()).toEqual(['d1', 'd2', 'l1', 't1']);
      expect(storedJournals()).toEqual(['j_g1', 'j_t1']);
      expect(screen.getByLabelText('Gratitude, No entries yet')).toBeTruthy();
      // Retry removes it.
      __fs.clearFailures();
      await swipeDelete('Gratitude');
      await pressAlert('Delete');
      await waitForDone('Gratitude');
      expect(storedJournals()).toEqual(['j_t1']);
    });
  });
});
