import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, AlertButton, AppState, AppStateStatus, BackHandler, Keyboard } from 'react-native';
import App from './App';
import { __fs } from './src/test/fakeFileSystem';
import { localDateKey } from './src/utils/today';
import { discardRecording, saveDream } from './src/services/dreamStorage';
import {
  DISCARD_CHANGES_DISCARD,
  DISCARD_CHANGES_KEEP,
  DISCARD_CHANGES_MESSAGE,
  DISCARD_CHANGES_TITLE,
} from './src/utils/sessionNavigation';

jest.mock('expo-file-system', () => jest.requireActual('./src/test/fakeFileSystem'));
// The real provider renders nothing until it measures the screen, which never happens in tests,
// so it gets fixed metrics (the Today page reads the insets).
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
// journals.json is read through the real storage (and the fake file system); a test can swap the read.
let mockLoadJournals: (() => Promise<unknown[]>) | null = null;
jest.mock('./src/services/journalStorage', () => {
  const actual = jest.requireActual('./src/services/journalStorage');
  return {
    ...actual,
    loadJournals: () => (mockLoadJournals ? mockLoadJournals() : actual.loadJournals()),
  };
});
jest.mock('./src/services/dreamStorage', () => ({
  discardRecording: jest.fn(),
  dreamAudioUri: jest.fn(),
  recordingUri: (r: { fileName: string }) => `file:///document/dreams/${r.fileName}`,
  saveDream: jest.fn(),
  isIndexUnreadableError: (e: any) => e?.kind === 'unreadable',
  isSafetyCopyBlockedError: (e: any) => e?.kind === 'blocked',
}));

jest.mock('./src/screens/AddEntryScreen', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    AddEntryScreen: (p: any) => (
      <View>
        <Text>add-screen</Text>
        <Text>{`add-journal:${p.journal?.id}`}</Text>
        <Text>{`add-title:${p.title}`}</Text>
        <Text>{`add-body:${p.body}`}</Text>
        <Text>{`add-date:${p.date}`}</Text>
        <Text>{`add-saving:${p.saving}`}</Text>
        <Text>{`add-autofocus:${p.autoFocus}`}</Text>
        <Text>{`add-locked:${p.journalLocked}`}</Text>
        <Text>{`add-has-delete:${!!p.onDelete}`}</Text>
        <Text>{`add-delete-disabled:${p.deleteDisabled}`}</Text>
        <Text>{`add-emotions:${(p.emotions ?? []).join(',')}`}</Text>
        {p.onDelete && (
          <Pressable onPress={p.onDelete}>
            <Text>stub-add-delete</Text>
          </Pressable>
        )}
        {p.attachment}
        <Text>{`add-offered:${(p.journals ?? []).map((j: any) => j.id).join(',')}`}</Text>
        <Pressable onPress={() => p.onJournalChange('life')}>
          <Text>stub-add-pick-life</Text>
        </Pressable>
        <Pressable onPress={p.onBack}>
          <Text>stub-add-back</Text>
        </Pressable>
        <Pressable onPress={p.onSave}>
          <Text>stub-add-save</Text>
        </Pressable>
        <Pressable onPress={() => p.onTitleChange('My title')}>
          <Text>stub-add-set-title</Text>
        </Pressable>
        <Pressable onPress={() => p.onTitleChange('')}>
          <Text>stub-add-clear-title</Text>
        </Pressable>
        <Pressable onPress={() => p.onBodyChange('some words')}>
          <Text>stub-add-set-body</Text>
        </Pressable>
      </View>
    ),
  };
});
const mockListDream = {
  createdAt: '2026-10-02T08:00:00.000Z',
  durationMs: 1,
  title: 'x',
  tags: [],
};
jest.mock('./src/screens/DreamLogScreen', () => {
  const { Pressable, Text } = require('react-native');
  const draft = {
    id: '42',
    createdAt: '2026-10-05T08:00:00.000Z',
    durationMs: 9000,
    audioFileName: '42.m4a',
    title: 'Flooded hall',
    tags: [],
    transcript: 'it filled up',
    status: 'draft',
  };
  return {
    DreamLogScreen: ({
      journal,
      dreams,
      onBack,
      view,
      onOpenDream,
      onOpenDraft,
      onDeleteDream,
      deletingId,
    }: any) => (
      <>
        <Text>log-screen</Text>
        <Text>{`log-journal:${journal?.id}`}</Text>
        <Text>{`log-ids:${(dreams ?? []).map((d: any) => d.id).join(',')}`}</Text>
        <Pressable onPress={onBack}>
          <Text>stub-log-back</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            onDeleteDream({ ...mockListDream, id: 'L1', journalId: 'life', title: 'x' })
          }
        >
          <Text>stub-list-delete-life</Text>
        </Pressable>
        <Text>{`query:${view.query}`}</Text>
        <Text>{`searching:${view.searching}`}</Text>
        <Text>{`deletingId:${deletingId}`}</Text>
        <Pressable onPress={() => onDeleteDream({ ...mockListDream, id: '7' })}>
          <Text>stub-list-delete</Text>
        </Pressable>
        <Pressable onPress={() => onDeleteDream({ ...mockListDream, id: '8' })}>
          <Text>stub-list-delete-other</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDraft(draft)}>
          <Text>stub-open-draft</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDream('7')}>
          <Text>stub-open-dream</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDream('L1')}>
          <Text>stub-open-life-entry</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDream('missing')}>
          <Text>stub-open-missing</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDream('42')}>
          <Text>stub-open-draft-as-dream</Text>
        </Pressable>
        <Pressable onPress={view.openSearch}>
          <Text>stub-open-search</Text>
        </Pressable>
        <Pressable onPress={() => view.setQuery('hall')}>
          <Text>stub-set-query</Text>
        </Pressable>
      </>
    ),
  };
});
jest.mock('./src/components/JournalsDrawer', () => {
  const { useEffect } = require('react');
  const { BackHandler, Pressable, Text } = require('react-native');
  return {
    JournalsDrawer: ({
      open,
      onClose,
      journals,
      counts,
      unreadable,
      onOpenJournal,
      onSearch,
      onNewJournal,
    }: any) => {
      // Like the real drawer: while open, Back closes it first.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useEffect(() => {
        if (!open) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
          onClose();
          return true;
        });
        return () => sub.remove();
      }, [open, onClose]);
      return open ? (
        <>
          <Text>journals-drawer</Text>
          <Text>{`journal-cards:${journals.map((j: any) => j.name).join(',')}`}</Text>
          {journals
            .filter((j: any) => j.id !== 'dreams' && j.id !== 'life')
            .map((j: any) => (
              <Pressable key={j.id} onPress={() => onOpenJournal(j.id)}>
                <Text>{`stub-open-${j.id}`}</Text>
              </Pressable>
            ))}
          <Pressable onPress={onClose}>
            <Text>stub-drawer-close</Text>
          </Pressable>
          <Text>{`counts:${counts ? JSON.stringify(counts) : 'null'}`}</Text>
          <Text>{`unreadable:${unreadable}`}</Text>
          <Pressable onPress={() => onOpenJournal('dreams')}>
            <Text>stub-open-dreams</Text>
          </Pressable>
          <Pressable onPress={() => onOpenJournal('life')}>
            <Text>stub-open-life</Text>
          </Pressable>
          <Pressable onPress={onSearch}>
            <Text>stub-journals-search</Text>
          </Pressable>
          <Pressable onPress={onNewJournal}>
            <Text>stub-journals-new</Text>
          </Pressable>
        </>
      ) : null;
    },
  };
});
jest.mock('./src/screens/SearchScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    SearchScreen: ({ journals, records, view, onBack, onOpenDream }: any) => (
      <>
        <Text>search-screen</Text>
        <Text>{`search-journals:${journals.map((j: any) => j.name).join(',')}`}</Text>
        <Text>{`search-count:${(records ?? []).length}`}</Text>
        <Text>{`search-query:${view.query}`}</Text>
        <Text>{`search-tags:${view.tags.join(',')}`}</Text>
        <Pressable onPress={onBack}>
          <Text>stub-search-back</Text>
        </Pressable>
        <Pressable onPress={() => view.setQuery('hall')}>
          <Text>stub-search-set-query</Text>
        </Pressable>
        <Pressable onPress={() => view.toggleTag('water')}>
          <Text>stub-search-toggle-tag</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDream('7')}>
          <Text>stub-search-open</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDream('L1')}>
          <Text>stub-search-open-life</Text>
        </Pressable>
      </>
    ),
  };
});
// The library is faked so tests control what the log holds and when a refresh finishes.
const mockLibrary: {
  // null: the library has not loaded yet; `push` then delivers the data later.
  dreams: any[] | null;
  push?: (dreams: any[]) => void;
  indexStatus?: 'ok' | 'unreadable';
  onRefresh?: () => Promise<void> | void;
  onRemove?: (id: string) => Promise<void>;
  afterRemoveFilter?: () => Promise<void>;
} = { dreams: [] };
jest.mock('./src/hooks/useDreamLibrary', () => {
  const { useState } = require('react');
  return {
    useDreamLibrary: () => {
      const [dreams, setDreams] = useState(mockLibrary.dreams);
      mockLibrary.push = setDreams;
      return {
        dreams,
        indexStatus: mockLibrary.indexStatus ?? 'ok',
        refresh: async () => {
          await mockLibrary.onRefresh?.();
          setDreams(mockLibrary.dreams ?? []);
        },
        // Like the real hook: the dream leaves state only once storage succeeded.
        remove: async (id: string) => {
          await mockLibrary.onRemove?.(id);
          mockLibrary.dreams = (mockLibrary.dreams ?? []).filter((d) => d.id !== id);
          setDreams(mockLibrary.dreams);
          // Like the real hook's `await refresh()` after the list has already dropped the dream.
          await mockLibrary.afterRemoveFilter?.();
        },
      };
    },
  };
});

const finishedDream = {
  id: '7',
  createdAt: '2026-10-01T08:00:00.000Z',
  durationMs: 5000,
  audioFileName: '7.m4a',
  title: 'Old title',
  emotion: '',
  tags: ['water'],
  transcript: 'old text',
};

let addListener: jest.SpyInstance;
// Handlers registered and not yet removed (the Today "+" menu adds and removes its own).
let liveBackHandlers: (() => boolean)[] = [];
const hardwareBack = async (): Promise<boolean> => {
  const handler = liveBackHandlers[liveBackHandlers.length - 1];
  let result = false;
  await act(async () => {
    result = handler();
  });
  return result;
};

// The app shows a blank view until the library, the No dream marker and the settings are read;
// this renders and lets those reads finish so the launch rule has chosen a screen.
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function renderApp() {
  const view = await render(<App />);
  await flush();
  return view;
}

const press = (label: string) => fireEvent.press(screen.getByText(label));
/** The Today page is showing (its "+" button is unique to it). */
const expectToday = () => {
  expect(screen.getByLabelText('Add entry')).toBeTruthy();
  expect(screen.queryByText('New dream')).toBeNull();
  expect(screen.queryByText('New Life entry')).toBeNull();
};
/** On Today: open the "+" menu and pick a journal ("Dreams" or "Life"). */
const addEntry = async (journal: 'Dreams' | 'Life') => {
  await fireEvent.press(screen.getByLabelText('Add entry'));
  await fireEvent.press(screen.getByRole('menuitem', { name: new RegExp(`^${journal},`) }));
};
const pressLabel = (label: string) => fireEvent.press(screen.getByLabelText(label));
/** The shared "+" button: opens the sheet and picks that journal (as the old per-log button did). */
async function newEntryIn(journalName: string) {
  await pressLabel('Add entry');
  await fireEvent.press(screen.getByRole('menuitem', { name: new RegExp(`^${journalName},`) }));
}
/** From Today: the Journals drawer, then the Dream log. */
async function openDreamLog() {
  await pressLabel('Open Journals');
  await press('stub-open-dreams');
}
/** From the launch page: back while empty is No dream (lands on Today), then the Dream log. */
async function goToLog() {
  await press('stub-add-back');
  await openDreamLog();
}
const lastAlertButtons = () =>
  (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];

beforeEach(() => {
  jest.clearAllMocks();
  __fs.reset();
  mockLibrary.dreams = [finishedDream];
  mockLibrary.push = undefined;
  mockLibrary.indexStatus = undefined;
  mockLibrary.onRefresh = undefined;
  mockLibrary.onRemove = undefined;
  mockLibrary.afterRemoveFilter = undefined;
  mockLoadJournals = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(saveDream).mockResolvedValue({ id: '1', createdAt: 'c' } as any);
  liveBackHandlers = [];
  addListener = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      liveBackHandlers.push(handler as () => boolean);
      return {
        remove: () => {
          liveBackHandlers = liveBackHandlers.filter((h) => h !== handler);
        },
      };
    });
});
afterEach(() => jest.restoreAllMocks());

describe('App launch page', () => {
  it('opens the empty Dreams add-entry page, focused', async () => {
    await renderApp();
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
    expect(screen.getByText('add-body:')).toBeTruthy();
    expect(screen.getByText('add-title:')).toBeTruthy();
    expect(screen.getByText('add-autofocus:true')).toBeTruthy();
    expect(screen.getByText('add-locked:false')).toBeTruthy();
  });

  it('shows today as the date', async () => {
    await renderApp();
    expect(screen.getByText(`add-date:${dateLabel(new Date())}`)).toBeTruthy();
  });

  it('saves a finished dream from the check, then shows Today', async () => {
    await renderApp();
    await press('stub-add-set-title');
    await press('stub-add-set-body');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'saved',
        journalId: 'dreams',
        details: expect.objectContaining({ title: 'My title', transcript: 'some words' }),
      }),
    );
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('recordingUri');
    expectToday();
    expect(screen.queryByText('No dream today')).toBeNull();
  });

  it('stays on the page with its content when saving fails', async () => {
    jest.mocked(saveDream).mockRejectedValue(new Error('disk full'));
    await renderApp();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.');
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-title:My title')).toBeTruthy();
    expect(screen.getByText('add-saving:false')).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('back with content asks Save draft / Discard / Keep writing, and deletes no file', async () => {
    await renderApp();
    await press('stub-add-set-body');
    await press('stub-add-back');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Save a draft?',
      'Keep what you wrote to finish later, or discard it.',
      expect.any(Array),
    );
    expect(lastAlertButtons().map((b) => b.text)).toEqual([
      'Save draft',
      'Discard',
      'Keep writing',
    ]);
    const keep = lastAlertButtons().find((b) => b.text === 'Keep writing');
    expect(keep?.style).toBe('cancel');
    expect(keep?.onPress).toBeUndefined();
    expect(screen.getByText('add-screen')).toBeTruthy();
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(discardRecording).not.toHaveBeenCalled();
    expect(saveDream).not.toHaveBeenCalled();
    // Content was typed, so this is not No dream: Today with no marker.
    expectToday();
    expect(screen.queryByText('No dream today')).toBeNull();
  });

  it('Save draft from the leave prompt saves a draft and lands on Today', async () => {
    await renderApp();
    await press('stub-add-set-body');
    await press('stub-add-back');
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.(),
    );
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', journalId: 'dreams' }),
    );
    expectToday();
  });
});

const dateLabel = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** Saves the launch page's text as a draft so the log stub is on screen. */
async function reachList() {
  await renderApp();
  await press('stub-add-set-body');
  await press('stub-add-back');
  await act(async () =>
    lastAlertButtons()
      .find((b) => b.text === 'Save draft')
      ?.onPress?.(),
  );
  await openDreamLog();
  jest.mocked(saveDream).mockClear();
}

describe('App draft reopening', () => {
  it('opens a draft on the add-entry page with its fields and its created date', async () => {
    await reachList();
    await press('stub-open-draft');
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-body:it filled up')).toBeTruthy();
    expect(screen.getByText('add-title:Flooded hall')).toBeTruthy();
    expect(screen.getByText('add-autofocus:false')).toBeTruthy();
    expect(
      screen.getByText(`add-date:${dateLabel(new Date('2026-10-05T08:00:00.000Z'))}`),
    ).toBeTruthy();
  });

  it('back with a draft open asks; Save draft updates it (no new recording) and returns to the log', async () => {
    await reachList();
    await press('stub-open-draft');
    await press('stub-add-set-title');
    await press('stub-add-back');
    expect(saveDream).not.toHaveBeenCalled();
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.(),
    );
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '42',
        status: 'draft',
        details: expect.objectContaining({ title: 'My title' }),
      }),
    );
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('recordingUri');
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('hardware back from a reopened draft asks the same', async () => {
    await reachList();
    await press('stub-open-draft');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Save a draft?',
      expect.any(String),
      expect.any(Array),
    );
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.(),
    );
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: '42', status: 'draft' }));
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('Discard on a reopened draft leaves the stored draft alone and returns to the log', async () => {
    await reachList();
    await press('stub-open-draft');
    await press('stub-add-back');
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(saveDream).not.toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('stays on the draft when saving it from the prompt fails', async () => {
    await reachList();
    await press('stub-open-draft');
    jest.mocked(saveDream).mockRejectedValue(new Error('disk full'));
    await press('stub-add-back');
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.(),
    );
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.');
    expect(screen.getByText('add-screen')).toBeTruthy();
  });
});

describe('App add-entry back while saving', () => {
  it('blocks the arrow and hardware back until the save finishes', async () => {
    let resolve: (v: unknown) => void = () => {};
    jest.mocked(saveDream).mockReturnValue(new Promise((r) => (resolve = r)) as any);
    await renderApp();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(screen.getByText('add-saving:true')).toBeTruthy();

    await press('stub-add-back');
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();

    await act(async () => resolve({ id: '1', createdAt: 'c' }));
    expectToday();
  });
});

describe('App back rules on the launch page', () => {
  it('an empty launch page counts as No dream, with no alert', async () => {
    await renderApp();
    await press('stub-add-back');
    expect(Alert.alert).not.toHaveBeenCalled();
    expectToday();
    expect(screen.getByText('No dream today')).toBeTruthy();
  });

  it('a page with only a title is not empty: it asks and is not No dream', async () => {
    await renderApp();
    await press('stub-add-set-title');
    await press('stub-add-back');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Save a draft?',
      expect.any(String),
      expect.any(Array),
    );
    expect(screen.queryByText('No dream today')).toBeNull();
  });
});

describe('App Android hardware back', () => {
  it('is handled on the launch page: it goes to Today as No dream instead of exiting', async () => {
    await renderApp();
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expectToday();
    expect(screen.getByText('No dream today')).toBeTruthy();
  });

  it('after saving goes to Today, then the drawer and the log from there; Today exits', async () => {
    await renderApp();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expectToday();
    await openDreamLog();
    expect(await hardwareBack()).toBe(true);
    expectToday();
    expect(screen.queryByText('journals-drawer')).toBeNull();
    expect(await hardwareBack()).toBe(false);
  });

  it('on the launch page with content shows the leave prompt and is handled', async () => {
    await renderApp();
    await press('stub-add-set-body');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Save a draft?',
      expect.any(String),
      expect.any(Array),
    );
    expect(screen.getByText('add-screen')).toBeTruthy();
  });

  it('removes its listener on unmount', async () => {
    const remove = jest.fn();
    addListener.mockReturnValue({ remove });
    const view = await renderApp();
    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });
});

/** Launch page -> No dream -> log, then opens the finished dream on the add-entry page. */
async function reachEntry() {
  await renderApp();
  await goToLog();
  await press('stub-open-dream');
}
const reachEdit = reachEntry;

describe('App Dream log and entry', () => {
  it('opens on the Dreams add-entry page, and backing out empty goes to Today and then the log', async () => {
    await renderApp();
    expect(screen.getByText('add-screen')).toBeTruthy();
    await goToLog();
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('New dream opens the add-entry page without resetting the log view state', async () => {
    await renderApp();
    await goToLog();
    await press('stub-open-search');
    await press('stub-set-query');
    await newEntryIn('Dreams');
    expect(screen.getByText('add-screen')).toBeTruthy();
    // The back arrow of a page opened from the log returns to the log.
    await press('stub-add-back');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.getByText('query:hall')).toBeTruthy();
    expect(screen.getByText('searching:true')).toBeTruthy();
  });

  it('a row tap opens that dream on the editable add-entry page, with the keyboard closed', async () => {
    await reachEntry();
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.queryByText('log-screen')).toBeNull();
    expect(screen.getByText('add-title:Old title')).toBeTruthy();
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
    expect(screen.getByText('add-autofocus:false')).toBeTruthy();
    // An entry never moves journal.
    expect(screen.getByText('add-locked:true')).toBeTruthy();
  });

  it('back from an opened entry returns to the log with the view state kept, and does not ask', async () => {
    await renderApp();
    await goToLog();
    await press('stub-set-query');
    await press('stub-open-dream');
    await press('stub-add-back');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.getByText('query:hall')).toBeTruthy();
  });

  it('leaving the add page dismisses the keyboard, and only then', async () => {
    await renderApp();
    await goToLog();
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    await press('stub-open-dream');
    expect(dismiss).not.toHaveBeenCalled();
    await press('stub-add-back');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('hardware back on an opened entry goes to the log and is handled', async () => {
    await reachEntry();
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('hardware back on the log closes an open search first, then goes to Today', async () => {
    await renderApp();
    await goToLog();
    await press('stub-open-search');
    await press('stub-set-query');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('searching:false')).toBeTruthy();
    expect(screen.getByText('query:')).toBeTruthy();
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expectToday();
    expect(screen.queryByText('journals-drawer')).toBeNull();
    expect(await hardwareBack()).toBe(false);
  });

  it('hardware back on the log with search closed goes to Today and keeps the view state', async () => {
    await renderApp();
    await goToLog();
    await press('stub-set-query');
    expect(await hardwareBack()).toBe(true);
    expectToday();
    await pressLabel('Open Journals');
    await press('stub-open-dreams');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.getByText('query:hall')).toBeTruthy();
  });

  it('stays on the log when the tapped entry is no longer stored', async () => {
    await renderApp();
    await goToLog();
    await press('stub-open-missing');
    expect(screen.queryByText('add-screen')).toBeNull();
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('a stored draft opened by id keeps the draft rules (leave prompt only when typed)', async () => {
    mockLibrary.dreams = [finishedDream, { ...finishedDream, id: '42', status: 'draft' }];
    await renderApp();
    await goToLog();
    await press('stub-open-draft-as-dream');
    expect(screen.getByText('add-screen')).toBeTruthy();
    await press('stub-add-set-title');
    await press('stub-add-back');
    expect(lastAlertButtons().map((b) => b.text)).toContain('Save draft');
  });
});

describe('App edit flow', () => {
  it('an opened entry is prefilled', async () => {
    await reachEdit();
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-title:Old title')).toBeTruthy();
    // The stored tag is written into the body (the stub's text collapses the newline).
    expect(screen.getByText('add-body:old text #water')).toBeTruthy();
    expect(screen.getByText('add-autofocus:false')).toBeTruthy();
    expect(
      screen.getByText(`add-date:${dateLabel(new Date(finishedDream.createdAt))}`),
    ).toBeTruthy();
  });

  it('the check with no edits writes nothing and returns to the log', async () => {
    await reachEdit();
    await press('stub-add-save');
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('the check with changes saves as saved with full strings, refreshes and returns to the log', async () => {
    mockLibrary.onRefresh = () => {
      mockLibrary.dreams = [{ ...finishedDream, title: 'My title' }];
    };
    await reachEdit();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledTimes(1);
    const arg = jest.mocked(saveDream).mock.calls[0][0] as any;
    expect(arg).toMatchObject({
      id: '7',
      status: 'saved',
      details: { title: 'My title', emotion: '', tags: ['water'], transcript: 'old text\n#water' },
    });
    expect(arg).not.toHaveProperty('recordingUri');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('keeps a stored emotion when an edit is saved', async () => {
    mockLibrary.dreams = [{ ...finishedDream, emotion: 'uneasy, calm' }];
    await reachEdit();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ emotion: 'uneasy, calm' }),
      }),
    );
  });

  it('never saves a draft for an edit session (back, hardware back, Save draft)', async () => {
    await reachEdit();
    await press('stub-add-set-title');
    await press('stub-add-back');
    await hardwareBack();
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    for (const call of jest.mocked(Alert.alert).mock.calls) {
      expect((call[2] ?? []).map((b: AlertButton) => b.text)).not.toContain('Save draft');
    }
    expect(saveDream).not.toHaveBeenCalled();
  });

  it('stays on the page with the session kept when saving the edit fails', async () => {
    jest.mocked(saveDream).mockRejectedValue(new Error('disk full'));
    await reachEdit();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.');
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-title:My title')).toBeTruthy();
    expect(screen.getByText('add-saving:false')).toBeTruthy();
  });

  it('back with edits asks first; Keep editing stays on the page', async () => {
    await reachEdit();
    await press('stub-add-set-title');
    await press('stub-add-back');
    expect(Alert.alert).toHaveBeenCalledWith(
      DISCARD_CHANGES_TITLE,
      DISCARD_CHANGES_MESSAGE,
      expect.any(Array),
    );
    const keep = lastAlertButtons().find((b) => b.text === DISCARD_CHANGES_KEEP);
    expect(keep?.style).toBe('cancel');
    expect(keep?.onPress).toBeUndefined();
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-title:My title')).toBeTruthy();
  });

  it('Discard clears the edit and returns to the log without saving', async () => {
    await reachEdit();
    await press('stub-add-set-title');
    await press('stub-add-back');
    const discard = lastAlertButtons().find((b) => b.text === DISCARD_CHANGES_DISCARD);
    expect(discard?.style).toBe('destructive');
    await act(async () => discard?.onPress?.());
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(saveDream).not.toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();
    // The session is gone: opening the entry again starts from the stored values.
    await press('stub-open-dream');
    expect(screen.getByText('add-title:Old title')).toBeTruthy();
  });

  it('back and hardware back without edits go straight to the log', async () => {
    await reachEdit();
    await press('stub-add-back');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('log-screen')).toBeTruthy();
    await press('stub-open-dream');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('a closed stored voice note counts as a change: back asks, check saves, a reopened note has no prompt', async () => {
    mockLibrary.dreams = [{ ...finishedDream, recordings: undefined }];
    await reachEdit();
    await press('stub-add-back');
    expect(Alert.alert).not.toHaveBeenCalled();
    await press('stub-open-dream');
    await fireEvent.press(screen.getByLabelText(/^Remove /));
    await press('stub-add-back');
    expect(Alert.alert).toHaveBeenCalledWith(
      DISCARD_CHANGES_TITLE,
      DISCARD_CHANGES_MESSAGE,
      expect.any(Array),
    );
    const discard = lastAlertButtons().find((b) => b.text === DISCARD_CHANGES_DISCARD);
    await act(async () => discard?.onPress?.());
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(saveDream).not.toHaveBeenCalled();
    // The check with the note closed is a real save, not the no-change return.
    await press('stub-open-dream');
    await fireEvent.press(screen.getByLabelText(/^Remove /));
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({ id: '7', removeRecordings: ['7.m4a'] }),
    );
  });

  it('hardware back with edits shows the same alert', async () => {
    await reachEdit();
    await press('stub-add-set-title');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      DISCARD_CHANGES_TITLE,
      DISCARD_CHANGES_MESSAGE,
      expect.any(Array),
    );
  });
});

describe('App refresh before leaving', () => {
  it('awaits the library refresh before leaving the page after the check', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await renderApp();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalled();
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.queryByText('log-screen')).toBeNull();
    await act(async () => finishRefresh());
    expectToday();
  });

  it('awaits the refresh for Save draft and for a draft back, and blocks back meanwhile', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await renderApp();
    await press('stub-add-set-body');
    await press('stub-add-back');
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.(),
    );
    expect(screen.getByText('add-screen')).toBeTruthy();
    // A second back while the refresh is pending must not save again.
    await press('stub-add-back');
    expect(saveDream).toHaveBeenCalledTimes(1);
    await act(async () => finishRefresh());
    expectToday();

    jest.mocked(saveDream).mockClear();
    await openDreamLog();
    await press('stub-open-draft');
    await press('stub-add-back');
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.(),
    );
    expect(screen.getByText('add-screen')).toBeTruthy();
    // A second tap on the check while the refresh is pending must not save again.
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledTimes(1);
    await act(async () => finishRefresh());
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: '42', status: 'draft' }));
  });

  it('awaits the refresh before returning to the log after an edit', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await reachEdit();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(screen.getByText('add-screen')).toBeTruthy();
    await act(async () => finishRefresh());
    expect(screen.getByText('log-screen')).toBeTruthy();
  });
});

describe('App delete dream', () => {
  const gate = () => {
    let resolve: () => void = () => {};
    let reject: (e: unknown) => void = () => {};
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: () => resolve(), reject: (e: unknown) => reject(e) };
  };

  // Deleting a stored entry from the add-entry page arrives with the "..." menu (a later chunk);
  // until then only the list swipe-delete exists, and these are its tests.
  describe('from the Dream log', () => {
    const otherDream = { ...finishedDream, id: '8', title: 'Other title' };
    const reachLog = async () => {
      await renderApp();
      await goToLog();
    };

    it('success removes the dream without changing the screen, and shows deletingId only in flight', async () => {
      const g = gate();
      const remove = jest.fn(() => g.promise);
      mockLibrary.onRemove = remove;
      await reachLog();
      await press('stub-set-query');
      expect(screen.getByText('deletingId:null')).toBeTruthy();
      await press('stub-list-delete');
      expect(remove).toHaveBeenCalledWith('7');
      expect(screen.getByText('deletingId:7')).toBeTruthy();
      await act(async () => g.resolve());
      expect(screen.getByText('log-screen')).toBeTruthy();
      expect(screen.queryByText('add-screen')).toBeNull();
      expect(screen.getByText('query:hall')).toBeTruthy();
      expect(screen.getByText('deletingId:null')).toBeTruthy();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('failure alerts, stays on the log and frees the row', async () => {
      mockLibrary.onRemove = jest.fn().mockRejectedValueOnce(new Error('disk'));
      await reachLog();
      await press('stub-list-delete');
      expect(Alert.alert).toHaveBeenCalledWith('Could not delete dream', 'Please try again.');
      expect(screen.getByText('log-screen')).toBeTruthy();
      expect(screen.getByText('deletingId:null')).toBeTruthy();
      await press('stub-list-delete');
      expect(mockLibrary.onRemove).toHaveBeenCalledTimes(2);
    });

    it('ignores a second delete while one is in flight', async () => {
      const g = gate();
      const remove = jest.fn(() => g.promise);
      mockLibrary.onRemove = remove;
      await reachLog();
      await press('stub-list-delete');
      await press('stub-list-delete');
      await press('stub-list-delete-other');
      expect(remove).toHaveBeenCalledTimes(1);
      expect(screen.getByText('deletingId:7')).toBeTruthy();
      await act(async () => g.resolve());
    });

    it('does not block hardware back on the log, or opening another dream', async () => {
      const g = gate();
      mockLibrary.dreams = [finishedDream, otherDream];
      mockLibrary.onRemove = () => g.promise;
      await reachLog();
      await press('stub-list-delete-other');
      expect(screen.getByText('deletingId:8')).toBeTruthy();
      await press('stub-open-dream');
      expect(screen.getByText('add-title:Old title')).toBeTruthy();
      expect(await hardwareBack()).toBe(true);
      expect(screen.getByText('log-screen')).toBeTruthy();
      expect(await hardwareBack()).toBe(true);
      expectToday();
      await act(async () => g.resolve());
      expectToday();
    });

    it('does not pull the user off another open entry when the list delete ends', async () => {
      const g = gate();
      mockLibrary.dreams = [finishedDream, otherDream];
      mockLibrary.onRemove = () => g.promise;
      await reachLog();
      await press('stub-list-delete-other');
      await press('stub-open-dream');
      await act(async () => g.resolve());
      expect(screen.getByText('add-screen')).toBeTruthy();
      expect(screen.getByText('add-title:Old title')).toBeTruthy();
    });
  });
});

const lifeEntry = {
  id: 'L1',
  createdAt: '2026-10-03T08:00:00.000Z',
  durationMs: 0,
  title: '',
  emotion: '',
  tags: ['water'],
  transcript: 'went for a walk',
  journalId: 'life',
};

describe('App journals navigation', () => {
  it('opens on the Dreams add-entry page with a plain back arrow and no No dream button', async () => {
    await renderApp();
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
    expect(screen.queryByLabelText('No dream, go to Today')).toBeNull();
  });

  it('backing out of the empty launch page goes to Today, and its Dream log is one tap away', async () => {
    await renderApp();
    await goToLog();
    expect(screen.getByText('log-journal:dreams')).toBeTruthy();
  });

  it('saving a launch dream goes to Today', async () => {
    await renderApp();
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expectToday();
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ journalId: 'dreams' }));
  });

  it('the log back arrow goes to Today; the drawer has counts and Back closes it, then exits', async () => {
    mockLibrary.dreams = [
      finishedDream,
      lifeEntry,
      { ...finishedDream, id: 'dr', status: 'draft' },
    ];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    expectToday();
    expect(screen.queryByText('journals-drawer')).toBeNull();
    await pressLabel('Open Journals');
    expect(screen.getByText('journals-drawer')).toBeTruthy();
    expect(screen.getByText('counts:{"dreams":1,"life":1}')).toBeTruthy();
    expect(screen.getByText('unreadable:false')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expectToday();
    expect(screen.queryByText('journals-drawer')).toBeNull();
    expect(await hardwareBack()).toBe(false);
  });

  it('the drawer shows unreadable from the library status', async () => {
    mockLibrary.indexStatus = 'unreadable';
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    expect(screen.getByText('unreadable:true')).toBeTruthy();
  });

  it('each log shows only its own journal entries', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    expect(screen.getByText('log-ids:7')).toBeTruthy();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-open-life');
    expect(screen.getByText('log-journal:life')).toBeTruthy();
    expect(screen.getByText('log-ids:L1')).toBeTruthy();
  });

  it('opening another journal starts its log with a fresh view', async () => {
    await renderApp();
    await goToLog();
    await press('stub-set-query');
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-open-life');
    expect(screen.getByText('query:')).toBeTruthy();
  });

  const reachLifeAdd = async () => {
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-open-life');
    await newEntryIn('Life');
  };

  it('a new Life entry opens the add-entry page from the Life log, with a back arrow and no No dream', async () => {
    await reachLifeAdd();
    expect(screen.getByText('add-journal:life')).toBeTruthy();
    await press('stub-add-back');
    expect(screen.getByText('log-journal:life')).toBeTruthy();
    expect(screen.queryByText('No dream today')).toBeNull();
  });

  it('Android back on an empty Life page goes to the Life log', async () => {
    await reachLifeAdd();
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('saving an untitled Life entry goes to the Life log', async () => {
    await reachLifeAdd();
    await press('stub-add-set-body');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'life', status: 'saved', requireTitle: false }),
    );
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('the picked journal is what gets saved, and the entry lands in the log of that journal', async () => {
    await reachLifeAdd();
    expect(screen.getByText('add-locked:false')).toBeTruthy();
    expect(screen.getByText('add-offered:dreams,life')).toBeTruthy();
    await press('stub-add-set-title');
    await press('stub-add-pick-life');
    expect(screen.getByText('add-journal:life')).toBeTruthy();
    expect(screen.getByText('add-title:My title')).toBeTruthy();
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'life', status: 'saved', requireTitle: false }),
    );
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('a draft saved from a Life page after switching keeps the picked journal', async () => {
    await reachLifeAdd();
    await press('stub-add-set-body');
    await press('stub-add-pick-life');
    await press('stub-add-back');
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.(),
    );
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({ journalId: 'life', status: 'draft' }),
    );
  });

  it('launch Dreams page: switching to Life then backing out empty is not No dream; Dreams again is', async () => {
    await renderApp();
    await press('stub-add-pick-life');
    await press('stub-add-back');
    expect(Alert.alert).not.toHaveBeenCalled();
    expectToday();
    expect(screen.queryByText('No dream today')).toBeNull();
  });

  it('a reopened draft and an edit are locked to their journal', async () => {
    await reachList();
    await press('stub-open-draft');
    expect(screen.getByText('add-locked:true')).toBeTruthy();
    await press('stub-add-pick-life');
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
  });

  it('the leave prompt on a Life page returns to the Life log on Discard', async () => {
    await reachLifeAdd();
    await press('stub-add-set-body');
    await press('stub-add-back');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Save a draft?',
      expect.any(String),
      expect.any(Array),
    );
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('the drawer search opens Search over all records', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-journals-search');
    expect(screen.getByText('search-screen')).toBeTruthy();
    expect(screen.getByText('search-count:2')).toBeTruthy();
  });

  it('Search back (arrow and Android) goes to Today and resets the search view', async () => {
    const toSearch = async () => {
      await pressLabel('Open Journals');
      await press('stub-journals-search');
      await press('stub-search-set-query');
      await press('stub-search-toggle-tag');
      expect(screen.getByText('search-query:hall')).toBeTruthy();
      expect(screen.getByText('search-tags:water')).toBeTruthy();
    };
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await toSearch();
    await press('stub-search-back');
    expectToday();
    expect(screen.queryByText('journals-drawer')).toBeNull();
    await pressLabel('Open Journals');
    await press('stub-journals-search');
    expect(screen.getByText('search-query:')).toBeTruthy();
    expect(screen.getByText('search-tags:')).toBeTruthy();
    await press('stub-search-set-query');
    expect(await hardwareBack()).toBe(true);
    expectToday();
    await pressLabel('Open Journals');
    await press('stub-journals-search');
    expect(screen.getByText('search-query:')).toBeTruthy();
  });

  it('a search result opens its entry; Back returns to Search with the view kept', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-journals-search');
    await press('stub-search-set-query');
    await press('stub-search-open-life');
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-journal:life')).toBeTruthy();
    await press('stub-add-back');
    expect(screen.getByText('search-screen')).toBeTruthy();
    expect(screen.getByText('search-query:hall')).toBeTruthy();
    await press('stub-search-open');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('search-query:hall')).toBeTruthy();
  });

  it('Back from a Life entry opened in its log returns to the Life log', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-open-life');
    await press('stub-open-life-entry');
    await press('stub-add-back');
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('an entry opened from Search returns to Search with the view kept after back, save and discard', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-journals-search');
    await press('stub-search-set-query');
    await press('stub-search-open');
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
    await press('stub-add-back');
    expect(screen.getByText('search-screen')).toBeTruthy();
    expect(screen.getByText('search-query:hall')).toBeTruthy();
    // Save with changes.
    await press('stub-search-open');
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledTimes(1);
    expect(screen.getByText('search-screen')).toBeTruthy();
    expect(screen.getByText('search-query:hall')).toBeTruthy();
    // Save with no changes writes nothing.
    await press('stub-search-open');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledTimes(1);
    expect(screen.getByText('search-screen')).toBeTruthy();
    // Discard.
    await press('stub-search-open');
    await press('stub-add-set-title');
    await press('stub-add-back');
    const discard = lastAlertButtons().find((b) => b.text === DISCARD_CHANGES_DISCARD);
    await act(async () => discard?.onPress?.());
    expect(screen.getByText('search-screen')).toBeTruthy();
    expect(screen.getByText('search-query:hall')).toBeTruthy();
  });

  it('edit-save of an untitled Life entry is allowed and returns to Search', async () => {
    mockLibrary.dreams = [lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-journals-search');
    await press('stub-search-open-life');
    await press('stub-add-set-body');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: 'L1' }));
    expect(screen.getByText('search-screen')).toBeTruthy();
  });

  it('edit-save of a Dreams entry with its title cleared is still blocked', async () => {
    await reachEdit();
    await press('stub-add-clear-title');
    await press('stub-add-save');
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByText('add-screen')).toBeTruthy();
  });

  it('back with changes uses the entry wording for Life', async () => {
    mockLibrary.dreams = [lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-open-life');
    await press('stub-open-life-entry');
    await press('stub-add-set-title');
    await press('stub-add-back');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard changes?',
      'Your changes to this entry will be lost.',
      expect.any(Array),
    );
  });

  it('a Life delete failure uses the entry wording', async () => {
    mockLibrary.onRemove = () => Promise.reject({ kind: 'unreadable' });
    await renderApp();
    await goToLog();
    await press('stub-list-delete-life');
    await act(async () => {});
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not delete entry',
      'Your saved entries could not be read. Nothing was deleted.',
    );
  });

  it('a Dreams delete failure keeps the dream wording', async () => {
    mockLibrary.onRemove = () => Promise.reject({ kind: 'blocked' });
    await renderApp();
    await goToLog();
    await press('stub-list-delete');
    await act(async () => {});
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not delete dream',
      'A saved copy of your dreams is damaged, so this dream was not deleted. Nothing was changed.',
    );
  });
});

// ---- Today page, launch rule and Settings ----

const iso = (hoursAgo = 0) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
const todayDream = {
  ...finishedDream,
  id: 't1',
  createdAt: iso(),
  title: 'Flying over the sea',
};
const todayLife = {
  ...finishedDream,
  id: 'tl',
  journalId: 'life',
  createdAt: iso(),
  title: 'Long walk',
};
const oldDream = { ...finishedDream, id: 'old', createdAt: iso(40), title: 'Old news' };
const todayDraft = {
  ...finishedDream,
  id: 'td',
  createdAt: iso(),
  title: 'Half a dream',
  status: 'draft',
};
const DOC = 'file:///document';
const putSettings = (autoOpen: boolean) =>
  __fs.put(`${DOC}/settings.json`, JSON.stringify({ autoOpenDreamCapture: autoOpen }));
const todayKeyNow = () => localDateKey(new Date());
const putMarker = (date: string) =>
  __fs.put(`${DOC}/no-dream.json`, JSON.stringify({ noDreamDate: date }));
const alertDelete = () =>
  act(async () =>
    lastAlertButtons()
      .find((b) => b.text === 'Delete')
      ?.onPress?.(),
  );

describe('App launch rule', () => {
  it('shows a blank view until the stored data is read, then resolves once', async () => {
    mockLibrary.dreams = null;
    await render(<App />);
    await flush();
    expect(screen.queryByText('add-screen')).toBeNull();
    expect(screen.queryByLabelText('Add entry')).toBeNull();
    await act(async () => {
      mockLibrary.push?.([]);
    });
    expect(screen.getByText('add-screen')).toBeTruthy();
  });

  it.each([
    ['nothing today', [oldDream], true, null, 'add'],
    ['a finished dream today', [todayDream], true, null, 'today'],
    ['No dream chosen today', [oldDream], true, 'today', 'today'],
    ['a stale No dream date', [oldDream], true, '2020-01-01', 'add'],
    ['only a Life entry today', [todayLife], true, null, 'add'],
    ['only a Dream draft today', [todayDraft], true, null, 'add'],
    ['nothing today with auto-open off', [oldDream], false, null, 'today'],
  ] as const)('%s', async (_name, dreams, autoOpen, marker, expected) => {
    mockLibrary.dreams = [...dreams];
    putSettings(autoOpen);
    if (marker) putMarker(marker === 'today' ? todayKeyNow() : marker);
    await renderApp();
    if (expected === 'add') {
      // The launch page is the new Dreams add-entry page, empty.
      expect(screen.getByText('add-screen')).toBeTruthy();
      expect(screen.getByText('add-journal:dreams')).toBeTruthy();
      expect(screen.getByText('add-body:')).toBeTruthy();
      expect(screen.queryByLabelText('Add entry')).toBeNull();
    } else {
      expectToday();
      expect(screen.queryByText('add-screen')).toBeNull();
    }
  });

  it('opens the Dreams page when the data is not ready within the cap, and does not move later', async () => {
    jest.useFakeTimers();
    try {
      mockLibrary.dreams = null;
      await render(<App />);
      expect(screen.queryByText('add-screen')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(999);
      });
      expect(screen.queryByText('add-screen')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.getByText('add-screen')).toBeTruthy();
      expect(screen.getByText('add-journal:dreams')).toBeTruthy();

      // The data arrives late and says a dream exists today: the user is not moved.
      await act(async () => {
        mockLibrary.push?.([todayDream]);
      });
      expect(screen.getByText('add-screen')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not open the Dreams page by the cap once the data resolved the launch', async () => {
    jest.useFakeTimers();
    try {
      mockLibrary.dreams = [todayDream];
      await render(<App />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expectToday();
      expect(screen.queryByText('add-screen')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('No dream (back on the empty launch page) saves the marker, lands on Today with "No dream today", and the next launch opens Today', async () => {
    mockLibrary.dreams = [oldDream];
    const view = await renderApp();
    await press('stub-add-back');
    expectToday();
    expect(screen.getByText('No dream today')).toBeTruthy();
    await flush();
    expect(__fs.read(`${DOC}/no-dream.json`)).toContain(todayKeyNow());
    await view.unmount();

    await renderApp();
    expectToday();
    expect(screen.getByText('No dream today')).toBeTruthy();
  });

  it('the Settings toggle changes the next launch decision', async () => {
    mockLibrary.dreams = [todayDream];
    const view = await renderApp();
    expectToday();
    await pressLabel('Open Settings');
    const toggle = screen.getByLabelText('Open dream capture on launch');
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, 'valueChange', false);
    await flush();
    await view.unmount();

    // Nothing today now: with the toggle on this would open the Dreams page.
    mockLibrary.dreams = [oldDream];
    await renderApp();
    expectToday();
    expect(screen.queryByText('add-screen')).toBeNull();
  });
});

describe('App Today page', () => {
  it("lists only today's entries, from every journal", async () => {
    mockLibrary.dreams = [todayDream, todayLife, oldDream, todayDraft];
    await renderApp();
    expect(screen.getByText('Flying over the sea')).toBeTruthy();
    expect(screen.getByText('Long walk')).toBeTruthy();
    expect(screen.getByText('Half a dream')).toBeTruthy();
    expect(screen.queryByText('Old news')).toBeNull();
  });

  it('an entry opens on the add-entry page and Back (arrow and Android) returns to Today', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    await press('Flying over the sea');
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-title:Flying over the sea')).toBeTruthy();
    expect(screen.getByText('add-autofocus:false')).toBeTruthy();
    await press('stub-add-back');
    expect(Alert.alert).not.toHaveBeenCalled();
    expectToday();
    await press('Flying over the sea');
    expect(await hardwareBack()).toBe(true);
    expectToday();
  });

  it('a save or a discard of an entry opened from Today returns to Today', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    await press('Flying over the sea');
    await press('stub-add-save');
    expect(saveDream).not.toHaveBeenCalled();
    expectToday();
    await press('Flying over the sea');
    await press('stub-add-set-body');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledTimes(1);
    expectToday();
    await press('Flying over the sea');
    await press('stub-add-set-body');
    await press('stub-add-back');
    const discard = lastAlertButtons().find((b) => b.text === DISCARD_CHANGES_DISCARD);
    await act(async () => discard?.onPress?.());
    expectToday();
  });

  it('a swipe delete from Today removes the row and stays on Today', async () => {
    mockLibrary.dreams = [todayDream, todayLife];
    await renderApp();
    await fireEvent.press(
      screen.getByLabelText('Delete dream: Flying over the sea', { includeHiddenElements: true }),
    );
    await alertDelete();
    expectToday();
    expect(screen.queryByText('Flying over the sea')).toBeNull();
    expect(screen.getByText('Long walk')).toBeTruthy();
  });

  it('the drawer opens from the book icon; its close and Android back leave Today open under it', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    await pressLabel('Open Journals');
    expect(screen.getByText('journals-drawer')).toBeTruthy();
    await press('stub-drawer-close');
    expectToday();
    expect(screen.queryByText('journals-drawer')).toBeNull();
    await pressLabel('Open Journals');
    expect(await hardwareBack()).toBe(true);
    expectToday();
    expect(screen.queryByText('journals-drawer')).toBeNull();
    // Closed, so Back now leaves the app.
    expect(await hardwareBack()).toBe(false);
  });

  it('Settings opens from the gear and Back (arrow and Android) returns to Today', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    await pressLabel('Open Settings');
    expect(screen.getByText('Settings')).toBeTruthy();
    await pressLabel('Back to Today');
    expectToday();
    await pressLabel('Open Settings');
    expect(await hardwareBack()).toBe(true);
    expectToday();
  });

  it('Android back on Today exits the app', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    expect(await hardwareBack()).toBe(false);
  });

  it('Android back on the launch page goes to Today as No dream, not out of the app', async () => {
    mockLibrary.dreams = [oldDream];
    await renderApp();
    expect(await hardwareBack()).toBe(true);
    expectToday();
    expect(screen.getByText('No dream today')).toBeTruthy();
  });

  it('shows the unreadable note from the library status', async () => {
    mockLibrary.dreams = [];
    mockLibrary.indexStatus = 'unreadable';
    putSettings(false);
    await renderApp();
    expectToday();
    expect(screen.queryByText('Nothing here yet today.')).toBeNull();
  });
});

describe('App add-entry page opened from Today and the log', () => {
  beforeEach(() => {
    mockLibrary.dreams = [todayDream];
  });

  it('a Dream page from Today has a back arrow, no "No dream", and returns to Today', async () => {
    await renderApp();
    await addEntry('Dreams');
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
    expect(screen.getByText('add-autofocus:true')).toBeTruthy();
    await press('stub-add-back');
    expectToday();
    // Not the launch page: an empty back is not No dream.
    expect(screen.queryByText('No dream today')).toBeNull();
    await addEntry('Dreams');
    expect(await hardwareBack()).toBe(true);
    expectToday();
  });

  it('saving a Dream from Today returns to Today', async () => {
    await renderApp();
    await addEntry('Dreams');
    await press('stub-add-set-title');
    await press('stub-add-set-body');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'saved',
        journalId: 'dreams',
        details: expect.objectContaining({ title: 'My title', transcript: 'some words' }),
      }),
    );
    expectToday();
  });

  it('a Dream page from the Dream log returns to the log', async () => {
    await renderApp();
    await openDreamLog();
    await newEntryIn('Dreams');
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
    await press('stub-add-back');
    expect(screen.getByText('log-screen')).toBeTruthy();

    await newEntryIn('Dreams');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('saving a Dream from the Dream log returns to the log', async () => {
    await renderApp();
    await openDreamLog();
    await newEntryIn('Dreams');
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(screen.getByText('log-journal:dreams')).toBeTruthy();
  });

  it('the launch page saved lands on Today; a new page there is not the launch page', async () => {
    mockLibrary.dreams = [oldDream];
    await renderApp();
    expect(screen.getByText('add-screen')).toBeTruthy();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expectToday();
    await addEntry('Dreams');
    expect(screen.getByText('add-screen')).toBeTruthy();
    await press('stub-add-back');
    expectToday();
    expect(screen.queryByText('No dream today')).toBeNull();
  });

  it('a Life page from Today returns to Today by arrow, Android back and save', async () => {
    await renderApp();
    await addEntry('Life');
    expect(screen.getByText('add-journal:life')).toBeTruthy();
    await press('stub-add-back');
    expectToday();

    await addEntry('Life');
    expect(await hardwareBack()).toBe(true);
    expectToday();

    await addEntry('Life');
    await press('stub-add-set-body');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ journalId: 'life' }));
    expectToday();
  });

  it('a Life page from the Life log still returns to the Life log', async () => {
    await renderApp();
    await pressLabel('Open Journals');
    await press('stub-open-life');
    await newEntryIn('Life');
    expect(screen.getByText('add-journal:life')).toBeTruthy();
    await press('stub-add-back');
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('a Dream page needs a title: saving without one writes nothing and stays', async () => {
    await renderApp();
    await addEntry('Dreams');
    await press('stub-add-set-body');
    await press('stub-add-save');
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByText('add-screen')).toBeTruthy();
  });

  it('a draft opened from Today goes to the add-entry page, and the check saves it finished', async () => {
    mockLibrary.dreams = [todayDraft];
    await renderApp();
    expect(screen.getByText('add-screen')).toBeTruthy();
    await press('stub-add-back');
    await press('Half a dream');
    expect(screen.getByText('add-screen')).toBeTruthy();
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: 'td', status: 'saved' }));
    expectToday();
  });

  it('a draft opened from Today returns to Today from Save draft and from Discard', async () => {
    mockLibrary.dreams = [todayDraft];
    putSettings(false);
    await renderApp();
    await press('Half a dream');
    await press('stub-add-back');
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.(),
    );
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: 'td', status: 'draft' }));
    expectToday();
    await press('Half a dream');
    await press('stub-add-back');
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expectToday();
  });
});

describe('App launch cap timer', () => {
  it('is cleared on unmount', async () => {
    jest.useFakeTimers();
    // Plain wrappers, put back before real timers return: a jest.spyOn here would be restored
    // after the test and leave the fake setTimeout installed for every later test.
    const fakeSet = globalThis.setTimeout;
    const fakeClear = globalThis.clearTimeout;
    const capIds: unknown[] = [];
    const cleared: unknown[] = [];
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      const id = fakeSet(fn, ms);
      if (ms === 1000) capIds.push(id);
      return id;
    }) as never;
    globalThis.clearTimeout = ((id: never) => {
      cleared.push(id);
      return fakeClear(id);
    }) as never;
    try {
      mockLibrary.dreams = null;
      const view = await render(<App />);
      expect(capIds).toHaveLength(1);
      await view.unmount();
      expect(cleared).toContain(capIds[0]);
    } finally {
      globalThis.setTimeout = fakeSet;
      globalThis.clearTimeout = fakeClear;
      jest.useRealTimers();
    }
  });

  it('a late fire after the launch decided opens no launch page', async () => {
    jest.useFakeTimers();
    try {
      mockLibrary.dreams = [todayDream];
      await render(<App />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expectToday();
      await addEntry('Dreams');
      // Not a launch page: it opens the add-entry page, and backing out empty is not No dream.
      expect(screen.getByText('add-screen')).toBeTruthy();
      await press('stub-add-back');
      expect(screen.queryByText('No dream today')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('App resume on a new day', () => {
  const DAY1 = new Date(2026, 9, 10, 12, 0, 0);
  const DAY2 = new Date(2026, 9, 11, 9, 0, 0);
  const at = (d: Date, h = 12) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString();
  const day1Dream = { ...finishedDream, id: 'd1', createdAt: at(DAY1), title: 'Day one dream' };
  const day0Dream = {
    ...finishedDream,
    id: 'd0',
    createdAt: new Date(2026, 9, 8, 12).toISOString(),
    title: 'Older dream',
  };
  let handlers: Array<(s: AppStateStatus) => void>;
  let appState: AppStateStatus;

  const emit = (s: AppStateStatus) =>
    act(async () => {
      appState = s;
      handlers.forEach((h) => h(s));
    });
  /** Leave the app, let the clock pass to `to`, return. */
  const awayUntil = async (to: Date) => {
    await emit('background');
    jest.setSystemTime(to);
    await emit('active');
  };
  const settle = () =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
  const launch = async () => {
    await render(<App />);
    await settle();
  };
  const expectLaunchCapture = () => {
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-journal:dreams')).toBeTruthy();
    expect(screen.getByText('add-body:')).toBeTruthy();
    expect(screen.getByText('add-autofocus:true')).toBeTruthy();
  };
  /** From the launch page: type something, then Save draft (nothing counts as done). */
  const saveLaunchDraft = async () => {
    await press('stub-add-set-body');
    await press('stub-add-back');
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Save draft')
        ?.onPress?.(),
    );
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: DAY1 });
    handlers = [];
    appState = 'active';
    Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState });
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: never) => {
      handlers.push(h);
      return { remove: () => (handlers = handlers.filter((x) => x !== h)) };
    }) as never);
    mockLibrary.dreams = [day1Dream];
  });
  afterEach(() => jest.useRealTimers());

  it('from Today with nothing done on the new day: launch page, then back (empty) lands on Today as No dream', async () => {
    await launch();
    expectToday();
    await awayUntil(DAY2);
    expectLaunchCapture();
    await press('stub-add-back');
    expectToday();
    expect(screen.getByText('No dream today')).toBeTruthy();
  });

  it('the jump is a launch page: saving returns to Today', async () => {
    await launch();
    await awayUntil(DAY2);
    expectLaunchCapture();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expectToday();
  });

  it.each([
    ['Journals', async () => pressLabel('Open Journals'), 'journals-drawer'],
    [
      'the Dream log',
      async () => {
        await pressLabel('Open Journals');
        await press('stub-open-dreams');
      },
      'log-screen',
    ],
    [
      'the Life log',
      async () => {
        await pressLabel('Open Journals');
        await press('stub-open-life');
      },
      'log-screen',
    ],
    ['Settings', async () => pressLabel('Open Settings'), 'Settings'],
    [
      'Search',
      async () => {
        await pressLabel('Open Journals');
        await press('stub-journals-search');
      },
      'search-screen',
    ],
  ] as const)('from %s: launch page', async (_n, open, marker) => {
    await launch();
    await open();
    expect(screen.getByText(marker)).toBeTruthy();
    await awayUntil(DAY2);
    expectLaunchCapture();
  });

  it('stays when a finished dream exists on the new day', async () => {
    const day2Dream = { ...finishedDream, id: 'd2', createdAt: at(DAY2, 8), title: 'Day two' };
    mockLibrary.dreams = [day1Dream, day2Dream];
    await launch();
    await awayUntil(DAY2);
    expectToday();
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('stays when No dream was chosen for the new day', async () => {
    putMarker('2026-10-11');
    await launch();
    await awayUntil(DAY2);
    expectToday();
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('with auto-open off it does nothing at all, even from another screen', async () => {
    putSettings(false);
    await launch();
    await pressLabel('Open Journals');
    await awayUntil(DAY2);
    expect(screen.getByText('journals-drawer')).toBeTruthy();
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('uses the setting as changed in Settings, not the one read at launch', async () => {
    await launch();
    await pressLabel('Open Settings');
    await fireEvent(screen.getByLabelText('Open dream capture on launch'), 'valueChange', false);
    await awayUntil(DAY2);
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('stays on the add-entry page (a Life entry from Today)', async () => {
    await launch();
    await addEntry('Life');
    await awayUntil(DAY2);
    // Not replaced by a launch page (which would be a Dreams page).
    expect(screen.getByText('add-journal:life')).toBeTruthy();
  });

  it('stays on the add-entry page with text typed', async () => {
    await launch();
    await addEntry('Dreams');
    await press('stub-add-set-body');
    await awayUntil(DAY2);
    expect(screen.getByText('add-body:some words')).toBeTruthy();
  });

  it('stays while a delete is in flight', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    mockLibrary.onRemove = () => gate;
    await launch();
    await fireEvent.press(
      screen.getByLabelText('Delete dream: Day one dream', { includeHiddenElements: true }),
    );
    await alertDelete();
    await awayUntil(DAY2);
    expect(screen.queryByText('add-screen')).toBeNull();
    await act(async () => resolve());
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('stays on a same-day resume', async () => {
    mockLibrary.dreams = [day0Dream];
    putMarker('2026-10-10');
    await launch();
    expectToday();
    await awayUntil(new Date(2026, 9, 10, 20, 0, 0));
    expectToday();
  });

  it('never redirects on a foreground midnight rollover; Today just re-filters', async () => {
    await launch();
    expect(screen.getByText('Day one dream')).toBeTruthy();
    await act(async () => {
      jest.setSystemTime(new Date(2026, 9, 11, 0, 0, 0));
      await jest.advanceTimersByTimeAsync(13 * 3600_000);
    });
    expectToday();
    expect(screen.queryByText('add-screen')).toBeNull();
    expect(screen.queryByText('Day one dream')).toBeNull();
  });

  it('a foreground rollover after an earlier resume jump does not redirect either', async () => {
    await launch();
    await awayUntil(DAY2);
    expectLaunchCapture();
    await press('stub-add-back');
    expectToday();
    expect(screen.getByText('No dream today')).toBeTruthy();
    // The next midnight happens in the foreground (the pending timer fires ~15 h later).
    await act(async () => {
      await jest.advanceTimersByTimeAsync(16 * 3600_000);
    });
    // The day really rolled (the skip belonged to the earlier day) and nothing redirected.
    expectToday();
    expect(screen.queryByText('No dream today')).toBeNull();
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('an entry open on the add-entry page blocks the resume jump', async () => {
    await launch();
    await press('Day one dream');
    expect(screen.getByText('add-screen')).toBeTruthy();
    await awayUntil(DAY2);
    // Still the edit, not a fresh launch page.
    expect(screen.getByText('add-title:Day one dream')).toBeTruthy();
  });

  it('inactive then active on the same day does not jump', async () => {
    mockLibrary.dreams = [day0Dream];
    putMarker('2026-10-10');
    await launch();
    await emit('inactive');
    await emit('active');
    expectToday();
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('inactive then active across midnight jumps', async () => {
    await launch();
    await emit('inactive');
    jest.setSystemTime(DAY2);
    await emit('active');
    expectLaunchCapture();
  });

  it('two quick away/return cycles on the same new day jump at most once', async () => {
    await launch();
    await emit('background');
    jest.setSystemTime(DAY2);
    await emit('active');
    await emit('background');
    await emit('active');
    expectLaunchCapture();
    await saveLaunchDraft();
    expectToday();
    await emit('background');
    await emit('active');
    expectToday();
  });

  it('jumps once per new day, and again only when the day changes again', async () => {
    await launch();
    await awayUntil(DAY2);
    expectLaunchCapture();
    // A draft leaves nothing done, so only the once-per-day rule keeps the launch page away.
    await saveLaunchDraft();
    expectToday();
    await awayUntil(new Date(2026, 9, 11, 21, 0, 0));
    expectToday();
    expect(screen.queryByText('add-screen')).toBeNull();
    await awayUntil(new Date(2026, 9, 12, 8, 0, 0));
    expectLaunchCapture();
  });
});

describe('App leaving the launch page', () => {
  const marker = () => __fs.read(`${DOC}/no-dream.json`);
  const press_ = (text: string) =>
    act(async () => {
      lastAlertButtons()
        .find((b) => b.text === text)
        ?.onPress?.();
    });

  beforeEach(() => {
    mockLibrary.dreams = [oldDream];
  });

  describe('the launch page', () => {
    it('idle back arrow counts as No dream and lands on Today', async () => {
      await renderApp();
      await press('stub-add-back');
      await flush();
      expectToday();
      expect(screen.getByText('No dream today')).toBeTruthy();
      expect(marker()).toContain(todayKeyNow());
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('idle Android back does the same and does not exit', async () => {
      await renderApp();
      expect(await hardwareBack()).toBe(true);
      await flush();
      expectToday();
      expect(screen.getByText('No dream today')).toBeTruthy();
      expect(marker()).toContain(todayKeyNow());
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('a marker write failure still navigates to Today', async () => {
      __fs.failWhen('write', (uri) => uri.endsWith('no-dream.json'));
      __fs.failWhen('create', (uri) => uri.endsWith('no-dream.json'));
      await renderApp();
      await press('stub-add-back');
      await flush();
      expectToday();
      expect(screen.getByText('No dream today')).toBeTruthy();
      expect(marker()).toBeUndefined();
    });

    it('with content, back asks and marks nothing; Keep writing stays', async () => {
      await renderApp();
      await press('stub-add-set-body');
      await press('stub-add-back');
      await press_('Keep writing');
      await flush();
      expect(screen.getByText('add-screen')).toBeTruthy();
      expect(screen.getByText('add-body:some words')).toBeTruthy();
      expect(marker()).toBeUndefined();
    });

    it('with content, Discard goes to Today without a marker', async () => {
      await renderApp();
      await press('stub-add-set-body');
      await hardwareBack();
      await press_('Discard');
      await flush();
      expectToday();
      expect(screen.queryByText('No dream today')).toBeNull();
      expect(marker()).toBeUndefined();
      expect(discardRecording).not.toHaveBeenCalled();
    });

    it('with content, Save draft saves a draft, marks nothing and lands on Today', async () => {
      await renderApp();
      await press('stub-add-set-body');
      await press('stub-add-back');
      await press_('Save draft');
      await flush();
      expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
      expectToday();
      expect(marker()).toBeUndefined();
    });

    it('opens Today on relaunch the same day after leaving', async () => {
      const view = await renderApp();
      await hardwareBack();
      await flush();
      await view.unmount();
      await renderApp();
      expectToday();
    });

    it('saving from it marks nothing', async () => {
      await renderApp();
      await press('stub-add-set-title');
      await press('stub-add-save');
      await flush();
      expectToday();
      expect(saveDream).toHaveBeenCalled();
      expect(marker()).toBeUndefined();
    });
  });

  describe('the add-entry page opened from Today or a log', () => {
    beforeEach(() => {
      mockLibrary.dreams = [todayDream];
    });

    it('an empty back from Today marks nothing', async () => {
      await renderApp();
      await addEntry('Dreams');
      await press('stub-add-back');
      await flush();
      expectToday();
      expect(marker()).toBeUndefined();
    });

    it('Discard from the leave prompt returns to Today without a marker', async () => {
      await renderApp();
      await addEntry('Dreams');
      await press('stub-add-set-body');
      await hardwareBack();
      await press_('Discard');
      await flush();
      expectToday();
      expect(marker()).toBeUndefined();
      expect(discardRecording).not.toHaveBeenCalled();
    });

    it('Discard from the leave prompt returns to the Dream log', async () => {
      await renderApp();
      await openDreamLog();
      await newEntryIn('Dreams');
      await press('stub-add-set-body');
      await press('stub-add-back');
      await press_('Discard');
      await flush();
      expect(screen.getByText('log-journal:dreams')).toBeTruthy();
      expect(marker()).toBeUndefined();
    });
  });
});

describe('App custom journals', () => {
  const gratitude = {
    id: 'j_g1',
    name: 'Gratitude',
    kind: 'journal',
    createdAt: '2026-10-09T08:00:00Z',
  };
  const putJournals = () =>
    __fs.put(`${DOC}/journals.json`, JSON.stringify({ version: 1, journals: [gratitude] }));
  const gratitudeEntry = {
    ...finishedDream,
    id: 'g1',
    journalId: 'j_g1',
    title: 'Thankful for tea',
    createdAt: iso(),
    tags: [],
  };

  beforeEach(() => {
    putJournals();
    putSettings(false);
    mockLibrary.dreams = [finishedDream, lifeEntry, gratitudeEntry];
  });

  it('puts a card for the custom journal after Dreams and Life, with its count', async () => {
    await renderApp();
    await pressLabel('Open Journals');
    expect(screen.getByText('journal-cards:Dreams,Life,Gratitude')).toBeTruthy();
    expect(screen.getByText('counts:{"dreams":1,"life":1,"j_g1":1}')).toBeTruthy();
    await press('stub-open-j_g1');
    expect(screen.getByText('log-journal:j_g1')).toBeTruthy();
  });

  it('lists the custom journal in the Add entry sheet and captures for it', async () => {
    await renderApp();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    expect(screen.getByRole('menuitem', { name: /^Dreams,/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^Life,/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole('menuitem', { name: /^Gratitude,/ }));
    expect(screen.getByText('add-journal:j_g1')).toBeTruthy();
  });

  it('shows the custom entry on Today and saves a new one into its journal, back to Today', async () => {
    await renderApp();
    expect(screen.getByText('Thankful for tea')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('menuitem', { name: /^Gratitude,/ }));
    expect(screen.getByText('add-journal:j_g1')).toBeTruthy();
    // No title needed: a custom journal is Life-like.
    await press('stub-add-set-body');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ journalId: 'j_g1' }));
    expectToday();
  });

  it('saves from the custom journal log back into that log', async () => {
    await renderApp();
    await pressLabel('Open Journals');
    await press('stub-open-j_g1');
    await newEntryIn('Gratitude');
    expect(screen.getByText('add-journal:j_g1')).toBeTruthy();
    await press('stub-add-set-body');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ journalId: 'j_g1' }));
    expect(screen.getByText('log-journal:j_g1')).toBeTruthy();
  });

  it('gives Search the custom journal and its entries', async () => {
    await renderApp();
    await pressLabel('Open Journals');
    await press('stub-journals-search');
    expect(screen.getByText('search-journals:Dreams,Life,Gratitude')).toBeTruthy();
    expect(screen.getByText('search-count:3')).toBeTruthy();
  });

  it('opens a custom entry with the custom journal', async () => {
    await renderApp();
    await fireEvent.press(screen.getByText('Thankful for tea'));
    expect(screen.getByText('add-journal:j_g1')).toBeTruthy();
    expect(screen.getByText('add-locked:true')).toBeTruthy();
  });

  it('leaves Dreams and Life as they were', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await pressLabel('Open Journals');
    expect(screen.getByText('counts:{"dreams":1,"life":1,"j_g1":0}')).toBeTruthy();
    await press('stub-open-dreams');
    expect(screen.getByText('log-journal:dreams')).toBeTruthy();
  });

  describe('launch gate', () => {
    it('waits for the journals before it decides', async () => {
      mockLibrary.dreams = [todayDream];
      let resolve!: (list: unknown[]) => void;
      mockLoadJournals = () => new Promise((r) => (resolve = r));
      await render(<App />);
      await flush();
      expect(screen.queryByLabelText('Add entry')).toBeNull();
      await act(async () => resolve([{ id: 'j_g1', name: 'Gratitude', kind: 'journal' }]));
      expectToday();
      await fireEvent.press(screen.getByLabelText('Add entry'));
      expect(screen.getByRole('menuitem', { name: /^Gratitude,/ })).toBeTruthy();
    });

    it('opens the Dreams page at 1000 ms when the journals never load, with built-ins only', async () => {
      jest.useFakeTimers();
      try {
        mockLibrary.dreams = [todayDream];
        mockLoadJournals = () => new Promise(() => {});
        await render(<App />);
        await act(async () => {
          jest.advanceTimersByTime(999);
        });
        expect(screen.queryByText('add-screen')).toBeNull();
        await act(async () => {
          jest.advanceTimersByTime(1);
        });
        expect(screen.getByText('add-journal:dreams')).toBeTruthy();
        expect(screen.getByText('add-offered:dreams,life')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('treats a failed journals read as built-ins only and still launches', async () => {
      mockLibrary.dreams = [todayDream];
      mockLoadJournals = () => Promise.reject(new Error('boom'));
      await renderApp();
      expectToday();
      await fireEvent.press(screen.getByLabelText('Add entry'));
      expect(screen.queryByRole('menuitem', { name: /^Gratitude,/ })).toBeNull();
    });
  });
});

describe('App new journal', () => {
  beforeEach(() => {
    putSettings(false);
    mockLibrary.dreams = [finishedDream, lifeEntry];
  });

  const openNameSheet = async () => {
    await fireEvent.press(screen.getByLabelText('Add entry'));
    await fireEvent.press(screen.getByRole('button', { name: 'New journal' }));
  };
  const nameInput = () => screen.getByLabelText('Journal name');
  const createButton = () => screen.getByRole('button', { name: 'Create' });
  const create = async (name: string) => {
    await fireEvent.changeText(nameInput(), name);
    await fireEvent.press(createButton());
    await flush();
  };

  it("Add entry -> New journal -> name -> Create lands on the new journal's empty log", async () => {
    await renderApp();
    await openNameSheet();
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.getByRole('header', { name: 'New journal' })).toBeTruthy();
    await create('Gratitude');
    expect(screen.getByText('log-screen')).toBeTruthy();
    const id = (screen.getByText(/^log-journal:j_/).props.children as string).split(':')[1];
    expect(screen.getByText('log-ids:')).toBeTruthy();
    expect(screen.queryByLabelText('Journal name')).toBeNull();
    expect(__fs.read(`${DOC}/journals.json`)).toContain('Gratitude');
    // The new entry button of that log captures into the new journal.
    await newEntryIn('Gratitude');
    expect(screen.getByText(`add-journal:${id}`)).toBeTruthy();
  });

  it('the log back arrow goes to Today; the drawer has the new card and the sheet lists it', async () => {
    await renderApp();
    await openNameSheet();
    await create('Gratitude');
    await press('stub-log-back');
    await waitFor(expectToday);
    await pressLabel('Open Journals');
    expect(screen.getByText('journal-cards:Dreams,Life,Gratitude')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    await waitFor(expectToday);
    await fireEvent.press(screen.getByLabelText('Add entry'));
    expect(screen.getByRole('menuitem', { name: /^Gratitude,/ })).toBeTruthy();
    // The sheet is closed after returning: no stale name sheet.
    expect(screen.queryByLabelText('Journal name')).toBeNull();
  });

  it('blocks a duplicate or too-long name and writes nothing', async () => {
    await renderApp();
    await openNameSheet();
    await fireEvent.changeText(nameInput(), 'life');
    expect(screen.getByText('A journal named "life" already exists.')).toBeTruthy();
    expect(createButton().props.accessibilityState.disabled).toBe(true);
    await fireEvent(nameInput(), 'submitEditing');
    await fireEvent.changeText(nameInput(), 'x'.repeat(25));
    expect(screen.getByText('Use 24 characters or fewer.')).toBeTruthy();
    await fireEvent(nameInput(), 'submitEditing');
    await flush();
    expect(__fs.has(`${DOC}/journals.json`)).toBe(false);
    expectNoLogYet();
  });

  const expectNoLogYet = () => expect(screen.queryByText('log-screen')).toBeNull();

  it('a write failure keeps the sheet open with the name; a retry then works', async () => {
    await renderApp();
    await openNameSheet();
    __fs.failWhen('write', (uri) => uri.includes('journals'));
    __fs.failWhen('move', (uri) => uri.includes('journals'));
    await create('Gratitude');
    expectNoLogYet();
    expect(screen.getByText("Couldn't save the journal. Please try again.")).toBeTruthy();
    expect(nameInput().props.value).toBe('Gratitude');
    __fs.clearFailures();
    await fireEvent.press(createButton());
    await flush();
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(__fs.read(`${DOC}/journals.json`)).toContain('Gratitude');
  });

  it('Cancel and Android back close the sheet and stay on Today; no journal is made', async () => {
    await renderApp();
    await openNameSheet();
    await fireEvent.changeText(nameInput(), 'Work');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Journal name')).toBeNull();
    await waitFor(expectToday);
    await openNameSheet();
    expect(nameInput().props.value).toBe('');
    expect(await hardwareBack()).toBe(true);
    expect(screen.queryByLabelText('Journal name')).toBeNull();
    await waitFor(expectToday);
    expect(__fs.has(`${DOC}/journals.json`)).toBe(false);
  });

  it('Dreams and Life stay in the sheet and unchanged after creating', async () => {
    await renderApp();
    await openNameSheet();
    await create('Work');
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-open-dreams');
    expect(screen.getByText('log-ids:7')).toBeTruthy();
    expect(screen.getByText('log-journal:dreams')).toBeTruthy();
  });
});

describe('App delete from the add-entry page', () => {
  const gate = () => {
    let resolve: () => void = () => {};
    let reject: (e: unknown) => void = () => {};
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: () => resolve(), reject: (e: unknown) => reject(e) };
  };
  const otherDream = { ...finishedDream, id: '8', title: 'Other title' };
  const storedDraft = {
    id: '42',
    createdAt: '2026-10-05T08:00:00.000Z',
    durationMs: 9000,
    title: 'Flooded hall',
    tags: [],
    transcript: 'it filled up',
    status: 'draft',
  };
  const deleteAlerts = () =>
    jest.mocked(Alert.alert).mock.calls.filter(([title]) => /^Delete this/.test(String(title)));
  /** Opens the stored dream on the page from the Dream log, with a log query set first. */
  async function openFromLog() {
    await renderApp();
    await goToLog();
    await press('stub-set-query');
    await press('stub-open-dream');
  }
  async function reachSearchEntry() {
    await renderApp();
    await press('stub-add-back');
    await pressLabel('Open Journals');
    await press('stub-journals-search');
    await press('stub-search-set-query');
    await press('stub-search-open');
  }

  it('shows the menu action for a stored entry and a stored draft, never for a new entry', async () => {
    mockLibrary.dreams = [finishedDream, storedDraft];
    await renderApp();
    expect(screen.getByText('add-has-delete:false')).toBeTruthy();
    await goToLog();
    await newEntryIn('Dreams');
    expect(screen.getByText('add-has-delete:false')).toBeTruthy();
    await press('stub-add-back');
    await press('stub-open-dream');
    expect(screen.getByText('add-has-delete:true')).toBeTruthy();
    await press('stub-add-back');
    await press('stub-open-draft');
    expect(screen.getByText('add-has-delete:true')).toBeTruthy();
  });

  it('asks first (Keep is the default) and Keep removes nothing', async () => {
    mockLibrary.onRemove = jest.fn();
    await openFromLog();
    await press('stub-add-delete');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete this dream?',
      "The recording and text will be permanently deleted. This can't be undone.",
      expect.any(Array),
      expect.any(Object),
    );
    expect(lastAlertButtons().map((b) => [b.text, b.style])).toEqual([
      ['Keep', 'cancel'],
      ['Delete', 'destructive'],
    ]);
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Keep')
        ?.onPress?.(),
    );
    expect(mockLibrary.onRemove).not.toHaveBeenCalled();
    expect(screen.getByText('add-screen')).toBeTruthy();
    // The dialog is free again.
    await press('stub-add-delete');
    expect(deleteAlerts()).toHaveLength(2);
  });

  it('a text-only draft uses the text wording', async () => {
    mockLibrary.dreams = [finishedDream, storedDraft];
    await renderApp();
    await goToLog();
    await press('stub-open-draft');
    await press('stub-add-delete');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete this dream?',
      "The text will be permanently deleted. This can't be undone.",
      expect.any(Array),
      expect.any(Object),
    );
  });

  it('success returns to the log with its view state kept, with no discard prompt, even with edits', async () => {
    const remove = jest.fn(async () => {});
    mockLibrary.onRemove = remove;
    await openFromLog();
    await press('stub-add-set-title');
    await press('stub-add-delete');
    await alertDelete();
    expect(remove).toHaveBeenCalledWith('7');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.queryByText('add-screen')).toBeNull();
    expect(screen.getByText('query:hall')).toBeTruthy();
    expect(screen.getByText('log-ids:')).toBeTruthy();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(saveDream).not.toHaveBeenCalled();
    // The session is gone: the page is not left over.
    await press('stub-log-back');
    expectToday();
  });

  it('success from a Life entry returns to the Life log', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await pressLabel('Open Journals');
    await press('stub-open-life');
    await press('stub-open-life-entry');
    await press('stub-add-delete');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete this entry?',
      "The text will be permanently deleted. This can't be undone.",
      expect.any(Array),
      expect.any(Object),
    );
    await alertDelete();
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('success from Today returns to Today', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    await press('Flying over the sea');
    await press('stub-add-delete');
    await alertDelete();
    expectToday();
    expect(screen.queryByText('Flying over the sea')).toBeNull();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('success from Search returns to the results with the query kept', async () => {
    await reachSearchEntry();
    await press('stub-add-delete');
    await alertDelete();
    expect(screen.getByText('search-screen')).toBeTruthy();
    expect(screen.getByText('search-query:hall')).toBeTruthy();
    expect(screen.getByText('search-count:0')).toBeTruthy();
  });

  it('failure alerts, keeps the entry and its edits, and can be retried', async () => {
    mockLibrary.onRemove = jest.fn().mockRejectedValueOnce(new Error('disk'));
    await openFromLog();
    await press('stub-add-set-title');
    await press('stub-add-delete');
    await alertDelete();
    expect(Alert.alert).toHaveBeenLastCalledWith('Could not delete dream', 'Please try again.');
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-title:My title')).toBeTruthy();
    expect(screen.getByText('add-delete-disabled:false')).toBeTruthy();
    // Back works again (it asks about the edit, since the entry is still open).
    await press('stub-add-back');
    expect(Alert.alert).toHaveBeenLastCalledWith(
      DISCARD_CHANGES_TITLE,
      DISCARD_CHANGES_MESSAGE,
      expect.any(Array),
    );
    await press('stub-add-delete');
    await alertDelete();
    expect(mockLibrary.onRemove).toHaveBeenCalledTimes(2);
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it.each([
    [{ kind: 'unreadable' }, 'Your saved dreams could not be read. Nothing was deleted.'],
    [
      { kind: 'blocked' },
      'A saved copy of your dreams is damaged, so this dream was not deleted. Nothing was changed.',
    ],
  ])('failure %# shows the specific message and stays on the entry', async (error, body) => {
    mockLibrary.onRemove = jest.fn().mockRejectedValueOnce(error);
    await openFromLog();
    await press('stub-add-delete');
    await alertDelete();
    expect(Alert.alert).toHaveBeenLastCalledWith('Could not delete dream', body);
    expect(screen.getByText('add-screen')).toBeTruthy();
  });

  it('ignores back, hardware back and the check while this entry deletes, then works after a failure', async () => {
    const g = gate();
    mockLibrary.onRemove = jest.fn(() => g.promise);
    await openFromLog();
    await press('stub-add-set-title');
    await press('stub-add-delete');
    await alertDelete();
    expect(screen.getByText('add-delete-disabled:true')).toBeTruthy();
    const alerts = jest.mocked(Alert.alert).mock.calls.length;

    await press('stub-add-back');
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('add-screen')).toBeTruthy();
    await press('stub-add-save');
    expect(saveDream).not.toHaveBeenCalled();
    await press('stub-add-delete');
    expect(mockLibrary.onRemove).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Alert.alert).mock.calls.length).toBe(alerts);

    await act(async () => g.reject(new Error('x')));
    expect(screen.getByText('add-title:My title')).toBeTruthy();
    expect(screen.getByText('add-delete-disabled:false')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).toHaveBeenLastCalledWith(
      DISCARD_CHANGES_TITLE,
      DISCARD_CHANGES_MESSAGE,
      expect.any(Array),
    );
  });

  it('keeps the page while the delete is still finishing after the list dropped the entry', async () => {
    const g = gate();
    mockLibrary.afterRemoveFilter = () => g.promise;
    await openFromLog();
    await press('stub-add-delete');
    await alertDelete();
    expect(mockLibrary.dreams?.some((d) => d.id === '7')).toBe(false);
    expect(screen.getByText('add-screen')).toBeTruthy();
    await press('stub-add-back');
    expect(screen.getByText('add-screen')).toBeTruthy();
    await act(async () => g.resolve());
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.queryByText('add-screen')).toBeNull();
  });

  it('is blocked while a list delete runs, and unblocks after', async () => {
    const g = gate();
    const remove = jest.fn(() => g.promise);
    mockLibrary.dreams = [finishedDream, otherDream];
    mockLibrary.onRemove = remove;
    await renderApp();
    await goToLog();
    await press('stub-list-delete-other');
    await press('stub-open-dream');
    expect(screen.getByText('add-delete-disabled:true')).toBeTruthy();
    // Even if the action is invoked, nothing is asked and nothing is deleted.
    await press('stub-add-delete');
    expect(deleteAlerts()).toHaveLength(0);
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => g.resolve());
    expect(screen.getByText('add-screen')).toBeTruthy();
    expect(screen.getByText('add-delete-disabled:false')).toBeTruthy();
    await press('stub-add-delete');
    expect(deleteAlerts()).toHaveLength(1);
  });

  it('is blocked while a save is in flight', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await openFromLog();
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledTimes(1);
    await press('stub-add-delete');
    expect(deleteAlerts()).toHaveLength(0);
    await act(async () => finishRefresh());
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('shows a stored emotion read-only, capitalized, and nothing without one', async () => {
    mockLibrary.dreams = [{ ...finishedDream, emotion: 'uneasy, calm' }, otherDream];
    await renderApp();
    expect(screen.getByText('add-emotions:')).toBeTruthy();
    await goToLog();
    await press('stub-open-dream');
    expect(screen.getByText('add-emotions:Uneasy,Calm')).toBeTruthy();
    // Unchanged by an edit and saved back as it was.
    await press('stub-add-set-title');
    await press('stub-add-save');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ emotion: 'uneasy, calm' }),
      }),
    );
  });

  it('shows no emotions for an entry without any', async () => {
    await openFromLog();
    expect(screen.getByText('add-emotions:')).toBeTruthy();
  });
});
