import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, BackHandler } from 'react-native';
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
  RecordingPresets: { HIGH_QUALITY: {} },
}));

// Records the props App gives Journals home, so a test can call the handlers directly (with ids
// the UI never offers).
let mockJournalsProps: {
  onRenameJournal?: (id: string) => void;
  onDeleteJournal?: (id: string) => void;
} | null = null;
// A test can hold the registry write of a rename until it opens the gate.
let mockRenameGate: Promise<void> | null = null;
jest.mock('./src/services/journalStorage', () => {
  const actual = jest.requireActual('./src/services/journalStorage');
  return {
    ...actual,
    renameJournal: async (id: string, name: string) => {
      if (mockRenameGate) await mockRenameGate;
      return actual.renameJournal(id, name);
    },
  };
});
jest.mock('./src/screens/JournalsScreen', () => {
  const actual = jest.requireActual('./src/screens/JournalsScreen');
  return {
    ...actual,
    JournalsScreen: (props: NonNullable<typeof mockJournalsProps>) => {
      mockJournalsProps = props;
      return <actual.JournalsScreen {...props} />;
    },
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

const storedJournalsRaw = () => __fs.read(`${DOC}/journals.json`);
const storedJournals = () =>
  JSON.parse(storedJournalsRaw() ?? '{"journals":[]}').journals as {
    id: string;
    name: string;
    createdAt?: string;
  }[];
const dreamsRaw = () => __fs.read(`${DOC}/dreams.json`);

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
const swipeRename = (name: string) =>
  fireEvent.press(screen.getByLabelText(`Rename ${name}`, hidden));
const sheetOpen = () => screen.queryByText('Rename journal') !== null;
const nameField = () => screen.getByLabelText('Journal name');
const typeName = (text: string) => fireEvent.changeText(nameField(), text);
const save = async () => {
  await fireEvent.press(screen.getByLabelText('Save'));
  await settle();
};
async function renameTo(from: string, to: string) {
  await swipeRename(from);
  await typeName(to);
  await save();
}

let handlers: (() => boolean)[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  __fs.reset();
  mockGate = null;
  mockRenameGate = null;
  mockJournalsProps = null;
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

describe('App rename a custom journal', () => {
  it('opens the sheet prefilled with the current name, titled Rename journal', async () => {
    await renderApp();
    await openJournals();
    expect(sheetOpen()).toBe(false);
    await swipeRename('Gratitude');
    expect(screen.getByText('Rename journal')).toBeTruthy();
    expect(nameField().props.value).toBe('Gratitude');
    expect(screen.getByLabelText('Save')).toBeTruthy();
  });

  it('renames: persists, updates the card, closes the sheet, leaves entries untouched', async () => {
    await renderApp();
    await openJournals();
    const entriesBefore = dreamsRaw();
    await renameTo('Gratitude', '  Thankful  ');
    expect(sheetOpen()).toBe(false);
    const stored = storedJournals();
    expect(stored.map((j) => [j.id, j.name])).toEqual([
      ['j_g1', 'Thankful'],
      ['j_t1', 'Travel'],
    ]);
    // Nothing else about the journal changed.
    expect(stored[0].createdAt).toBe(gratitude.createdAt);
    expect(screen.getByLabelText('Thankful, 1 entry')).toBeTruthy();
    expect(screen.queryByLabelText(/^Gratitude/)).toBeNull();
    expect(screen.getByLabelText('Dreams, 1 dream')).toBeTruthy();
    expect(screen.getByLabelText('Travel, 1 entry')).toBeTruthy();
    expect(dreamsRaw()).toBe(entriesBefore);
  });

  it('shows the new name everywhere it is derived: log header, search label, + sheet', async () => {
    await renderApp();
    await openJournals();
    // Open the log first, so its copy is already built for the old name.
    await fireEvent.press(screen.getByLabelText('Gratitude, 1 entry'));
    expect(screen.getByRole('header', { name: 'Gratitude' })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    await renameTo('Gratitude', 'Thankful');
    await fireEvent.press(screen.getByLabelText('Thankful, 1 entry'));
    expect(screen.getByRole('header', { name: 'Thankful' })).toBeTruthy();
    expect(screen.getByLabelText('Search Thankful')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Gratitude' })).toBeNull();
    // Entries are still there under the same journal.
    expect(screen.getByText('Thankful for tea')).toBeTruthy();
    // Today: the Add entry sheet lists the new name.
    await fireEvent.press(screen.getByLabelText('Back'));
    await fireEvent.press(screen.getByLabelText('Back to Today'));
    await fireEvent.press(screen.getByLabelText('Add entry'));
    expect(screen.getByRole('menuitem', { name: /^Thankful,/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /^Gratitude,/ })).toBeNull();
  });

  it('closing without a change (Cancel) writes nothing', async () => {
    await renderApp();
    await openJournals();
    const before = storedJournalsRaw();
    await swipeRename('Gratitude');
    await typeName('Other');
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(sheetOpen()).toBe(false);
    expect(storedJournalsRaw()).toBe(before);
    expect(screen.getByLabelText('Gratitude, 1 entry')).toBeTruthy();
    // Reopening starts from the stored name again.
    await swipeRename('Gratitude');
    expect(nameField().props.value).toBe('Gratitude');
  });

  it('saving the same name (also after trimming) closes without writing', async () => {
    await renderApp();
    await openJournals();
    const before = storedJournalsRaw();
    const writes = jest.fn();
    __fs.failWhen('write', (uri) => {
      writes(uri);
      return false;
    });
    await renameTo('Gratitude', '  Gratitude ');
    expect(sheetOpen()).toBe(false);
    expect(writes).not.toHaveBeenCalled();
    expect(storedJournalsRaw()).toBe(before);
  });

  it('allows a case-only change', async () => {
    __fs.put(
      `${DOC}/journals.json`,
      JSON.stringify({ version: 1, journals: [{ ...gratitude, name: 'gratitude' }, travel] }),
    );
    await renderApp();
    await openJournals();
    await renameTo('gratitude', 'Gratitude');
    expect(sheetOpen()).toBe(false);
    expect(storedJournals()[0].name).toBe('Gratitude');
    expect(screen.getByLabelText('Gratitude, 1 entry')).toBeTruthy();
  });

  it.each([
    ['another journal', 'Travel', 'Travel'],
    ['another journal, other case', 'tRAVEL', 'tRAVEL'],
    ['Dreams', 'Dreams', 'Dreams'],
    ['Life, other case', 'life', 'life'],
  ])('blocks a duplicate of %s', async (_n, typed, shown) => {
    await renderApp();
    await openJournals();
    const before = storedJournalsRaw();
    await swipeRename('Gratitude');
    await typeName(typed);
    expect(screen.getByText(`A journal named "${shown}" already exists.`)).toBeTruthy();
    expect(screen.getByLabelText('Save').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Save'));
    await settle();
    expect(sheetOpen()).toBe(true);
    expect(storedJournalsRaw()).toBe(before);
  });

  it('blocks an empty and a too-long name', async () => {
    await renderApp();
    await openJournals();
    const before = storedJournalsRaw();
    await swipeRename('Gratitude');
    await typeName('   ');
    await fireEvent(nameField(), 'submitEditing');
    expect(screen.getByText('Give the journal a name.')).toBeTruthy();
    await typeName('x'.repeat(200));
    expect(screen.getByText(/characters or fewer/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save'));
    await settle();
    expect(sheetOpen()).toBe(true);
    expect(storedJournalsRaw()).toBe(before);
  });

  it('keeps the name and allows a retry after a write failure', async () => {
    await renderApp();
    await openJournals();
    __fs.failWhen('write', (uri) => uri.includes('journals.tmp'));
    await swipeRename('Gratitude');
    await typeName('Thankful');
    await save();
    expect(screen.getByText("Couldn't save the journal. Please try again.")).toBeTruthy();
    expect(sheetOpen()).toBe(true);
    expect(nameField().props.value).toBe('Thankful');
    expect(storedJournals()[0].name).toBe('Gratitude');
    expect(screen.getByLabelText('Gratitude, 1 entry', hidden)).toBeTruthy();
    __fs.clearFailures();
    await save();
    expect(sheetOpen()).toBe(false);
    expect(storedJournals()[0].name).toBe('Thankful');
    expect(screen.getByLabelText('Thankful, 1 entry')).toBeTruthy();
  });

  it('refuses built-in and unknown ids at the handler', async () => {
    await renderApp();
    await openJournals();
    for (const id of ['dreams', 'life', 'j_nope']) {
      await act(async () => mockJournalsProps?.onRenameJournal?.(id));
      expect(sheetOpen()).toBe(false);
    }
    expect(screen.queryByLabelText('Rename Dreams', hidden)).toBeNull();
    expect(screen.queryByLabelText('Rename Life', hidden)).toBeNull();
  });

  it('is only reachable from Journals home', async () => {
    await renderApp();
    expect(screen.queryByText('Rename journal')).toBeNull();
    expect(screen.queryByLabelText('Rename Gratitude', hidden)).toBeNull();
    await act(async () => mockJournalsProps?.onRenameJournal?.('j_g1'));
    expect(sheetOpen()).toBe(false);
  });

  it('Android back closes the sheet and stays on Journals home', async () => {
    await renderApp();
    await openJournals();
    await swipeRename('Gratitude');
    expect(sheetOpen()).toBe(true);
    const sheetBack = handlers.at(-1);
    await act(async () => {
      expect(sheetBack?.()).toBe(true);
    });
    expect(sheetOpen()).toBe(false);
    expect(screen.getByRole('header', { name: 'Journals' })).toBeTruthy();
  });

  it('Android back is swallowed while saving', async () => {
    let release!: () => void;
    mockRenameGate = new Promise<void>((r) => (release = r));
    await renderApp();
    await openJournals();
    await swipeRename('Gratitude');
    await typeName('Thankful');
    await fireEvent.press(screen.getByLabelText('Save'));
    await settle();
    expect(screen.getByLabelText('Save').props.accessibilityState.busy).toBe(true);
    await act(async () => {
      expect(handlers.at(-1)?.()).toBe(true);
    });
    expect(sheetOpen()).toBe(true);
    await act(async () => release());
    await settle();
    expect(sheetOpen()).toBe(false);
    expect(storedJournals()[0].name).toBe('Thankful');
  });

  it('opening New journal and Rename never leaves both name sheets open', async () => {
    await renderApp();
    await openJournals();
    await swipeRename('Gratitude');
    expect(screen.getAllByLabelText('Journal name')).toHaveLength(1);
    // Leaving Journals home closes Rename.
    await fireEvent.press(screen.getByLabelText('Close'));
    await fireEvent.press(screen.getByLabelText('Back to Today'));
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByLabelText('New journal'));
    expect(screen.getByText('New journal')).toBeTruthy();
    expect(sheetOpen()).toBe(false);
    expect(screen.getAllByLabelText('Journal name')).toHaveLength(1);
  });

  it('closes the Rename sheet when Journals home is left', async () => {
    await renderApp();
    await openJournals();
    await swipeRename('Gratitude');
    await act(async () => {
      // The hardware back handler of App itself (registered first) leaves Journals home.
      handlers[0]();
    });
    expect(sheetOpen()).toBe(false);
    expect(screen.queryByLabelText('Journal name')).toBeNull();
  });

  it('closes safely if its journal starts being deleted while the sheet is open', async () => {
    await renderApp();
    await openJournals();
    await swipeRename('Gratitude');
    expect(sheetOpen()).toBe(true);
    // Cannot happen from the UI (the sheet covers the cards): call the delete handler directly.
    await act(async () => mockJournalsProps?.onDeleteJournal?.('j_g1'));
    const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as {
      text?: string;
      onPress?: () => void;
    }[];
    await act(async () => buttons.find((b) => b.text === 'Delete')?.onPress?.());
    await settle();
    expect(sheetOpen()).toBe(false);
    expect(storedJournals().map((j) => j.id)).toEqual(['j_t1']);
  });

  describe('while a journal delete runs', () => {
    it('is refused at the handler for any journal, and the deleting card offers no Rename', async () => {
      let open!: () => void;
      mockGate = new Promise<void>((resolve) => {
        open = resolve;
      });
      await renderApp();
      await openJournals();
      await fireEvent.press(screen.getByLabelText('Delete Gratitude', hidden));
      const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as {
        text?: string;
        onPress?: () => void;
      }[];
      await act(async () => buttons.find((b) => b.text === 'Delete')?.onPress?.());
      expect(screen.getByLabelText('Gratitude, deleting')).toBeTruthy();
      await swipeRename('Gratitude');
      await swipeRename('Travel');
      await act(async () => mockJournalsProps?.onRenameJournal?.('j_g1'));
      await act(async () => mockJournalsProps?.onRenameJournal?.('j_t1'));
      expect(sheetOpen()).toBe(false);
      await act(async () => open());
      await settle();
    });
  });
});
