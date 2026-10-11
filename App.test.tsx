import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, AlertButton, AppState, AppStateStatus, BackHandler } from 'react-native';
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
}));
jest.mock('./src/services/dreamStorage', () => ({
  discardRecording: jest.fn(),
  dreamAudioUri: jest.fn(),
  saveDream: jest.fn(),
  isIndexUnreadableError: (e: any) => e?.kind === 'unreadable',
  isSafetyCopyBlockedError: (e: any) => e?.kind === 'blocked',
}));

// The heavy screens are replaced by small stubs that expose their callbacks as buttons.
jest.mock('./src/screens/CaptureScreen', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    CaptureScreen: ({
      onRecorded,
      onWrite,
      onNoDream,
      onTypeInstead,
      onBack,
      onActiveChange,
      journal,
    }: any) => (
      <View>
        <Text>capture-screen</Text>
        <Text>{`capture-journal:${journal?.id}`}</Text>
        {onNoDream && (
          <Pressable onPress={onNoDream}>
            <Text>stub-no-dream</Text>
          </Pressable>
        )}
        {onBack && (
          <Pressable onPress={onBack}>
            <Text>stub-capture-back</Text>
          </Pressable>
        )}
        <Pressable onPress={() => onActiveChange(true)}>
          <Text>stub-capture-busy</Text>
        </Pressable>
        <Pressable
          onPress={() => onRecorded({ uri: 'file:///cache/r.m4a', durationMs: 7000 }, 'live')}
        >
          <Text>stub-save-recording</Text>
        </Pressable>
        <Pressable onPress={() => onRecorded({ uri: 'file:///cache/e.m4a', durationMs: 7000 }, '')}>
          <Text>stub-save-recording-no-text</Text>
        </Pressable>
        <Pressable onPress={onWrite}>
          <Text>stub-write</Text>
        </Pressable>
        <Pressable onPress={() => onTypeInstead('so far')}>
          <Text>stub-type-instead</Text>
        </Pressable>
        <Pressable onPress={() => onTypeInstead('')}>
          <Text>stub-type-instead-empty</Text>
        </Pressable>
      </View>
    ),
  };
});
jest.mock('./src/screens/ReviewScreen', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    ReviewScreen: (p: any) => (
      <View>
        <Text>review-screen</Text>
        <Text>{`review-journal:${p.journal?.id}`}</Text>
        <Pressable onPress={() => p.onTitleChange('')}>
          <Text>stub-clear-title</Text>
        </Pressable>
        <Text>{`transcript:${p.transcript}`}</Text>
        <Text>{`title:${p.title}`}</Text>
        <Text>{`audio:${p.audio ? p.audio.uri : 'none'}`}</Text>
        <Text>{`date:${p.date}`}</Text>
        <Text>{`saving:${p.saving}`}</Text>
        <Text>{`finishLater:${p.showFinishLater !== false}`}</Text>
        <Pressable onPress={() => p.onTitleChange('My title')}>
          <Text>stub-set-title</Text>
        </Pressable>
        <Pressable onPress={p.onBack}>
          <Text>stub-review-back</Text>
        </Pressable>
        <Pressable onPress={p.onEditTranscript}>
          <Text>stub-edit</Text>
        </Pressable>
        <Pressable onPress={p.onDone}>
          <Text>stub-done</Text>
        </Pressable>
        <Pressable onPress={p.onFinishLater}>
          <Text>stub-finish-later</Text>
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
      onNewDream,
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
        <Pressable onPress={onNewDream}>
          <Text>stub-new-dream</Text>
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
jest.mock('./src/screens/DreamDetailScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    DreamDetailScreen: ({
      dream,
      journal,
      onBack,
      onEdit,
      onDelete,
      deleting,
      deleteBlocked,
    }: any) => (
      <>
        <Text>detail-screen</Text>
        <Text>{`detail-journal:${journal?.id}`}</Text>
        <Text>{`detail-title:${dream.title}`}</Text>
        <Text>{`deleting:${deleting}`}</Text>
        <Text>{`blocked:${deleteBlocked}`}</Text>
        <Pressable
          onPress={() => {
            void onDelete().catch(() => {});
          }}
        >
          <Text>stub-detail-delete</Text>
        </Pressable>
        <Pressable onPress={onBack}>
          <Text>stub-detail-back</Text>
        </Pressable>
        <Pressable onPress={onEdit}>
          <Text>stub-detail-edit</Text>
        </Pressable>
      </>
    ),
  };
});
jest.mock('./src/screens/JournalsScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    JournalsScreen: ({ counts, unreadable, onOpenJournal, onSearch, onBack }: any) => (
      <>
        <Text>journals-screen</Text>
        {onBack && (
          <Pressable onPress={onBack}>
            <Text>stub-journals-back</Text>
          </Pressable>
        )}
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
      </>
    ),
  };
});
jest.mock('./src/screens/SearchScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    SearchScreen: ({ records, view, onBack, onOpenDream }: any) => (
      <>
        <Text>search-screen</Text>
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
const hardwareBack = async (): Promise<boolean> => {
  const calls = addListener.mock.calls;
  const handler = calls[calls.length - 1][1] as () => boolean;
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
/** The Today page is showing (its bottom buttons are unique to it). */
const expectToday = () => {
  expect(screen.getByText('New dream')).toBeTruthy();
  expect(screen.getByText('New Life entry')).toBeTruthy();
};
const pressLabel = (label: string) => fireEvent.press(screen.getByLabelText(label));
/** From Today: Journals home, then the Dream log. */
async function openDreamLog() {
  await pressLabel('Open Journals');
  await press('stub-open-dreams');
}
/** From the launch capture: No dream (lands on Today), then the Dream log. */
async function goToLog() {
  await press('stub-no-dream');
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
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(saveDream).mockResolvedValue({ id: '1', createdAt: 'c' } as any);
  addListener = jest.spyOn(BackHandler, 'addEventListener');
});
afterEach(() => jest.restoreAllMocks());

describe('App flow', () => {
  it('goes from a recording to Read it back with the live text, then to Review', async () => {
    await renderApp();
    await press('stub-save-recording');
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(screen.getByLabelText('Dream text').props.value).toBe('live');
    expect(screen.getByLabelText('Play recording')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Dream text'), 'live, edited');
    await press('Continue');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('transcript:live, edited')).toBeTruthy();
    expect(screen.getByText('audio:file:///cache/r.m4a')).toBeTruthy();
  });

  it('Write instead opens Read it back focused, with no audio', async () => {
    await renderApp();
    await press('stub-write');
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(screen.getByLabelText('Dream text').props.autoFocus).toBe(true);
    expect(screen.queryByLabelText('Play recording')).toBeNull();
  });

  it('Type instead opens Read it back with the text so far, focused, with no player', async () => {
    await renderApp();
    await press('stub-type-instead');
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(screen.getByLabelText('Dream text').props.value).toBe('so far');
    expect(screen.getByLabelText('Dream text').props.autoFocus).toBe(true);
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    await press('Continue');
    expect(screen.getByText('transcript:so far')).toBeTruthy();
    expect(screen.getByText('audio:none')).toBeTruthy();
  });

  it('Type instead with no text opens an empty, focused box', async () => {
    await renderApp();
    await press('stub-type-instead-empty');
    expect(screen.getByLabelText('Dream text').props.value).toBe('');
    expect(screen.getByLabelText('Dream text').props.autoFocus).toBe(true);
  });

  it('back from a Type instead dream asks to discard, and never deletes persisted audio', async () => {
    await renderApp();
    await press('stub-type-instead');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard this dream?',
      'Your recording and text will be deleted.',
      expect.any(Array),
    );
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(discardRecording).not.toHaveBeenCalled();
    expect(screen.getByText('capture-screen')).toBeTruthy();
  });

  it('a recording with no live text does not autofocus and starts empty', async () => {
    await renderApp();
    await press('stub-save-recording-no-text');
    expect(screen.getByLabelText('Dream text').props.value).toBe('');
    expect(screen.getByLabelText('Dream text').props.autoFocus).toBe(false);
  });

  it('keeps title and edited text across Review -> Edit -> Review, and Edit back skips the alert', async () => {
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-edit');
    expect(screen.getByText('Read it back')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Dream text'), 'changed');

    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:My title')).toBeTruthy();
    expect(screen.getByText('transcript:changed')).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('Done saves the session as a finished dream, then clears it and shows Today', async () => {
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingUri: 'file:///cache/r.m4a',
        status: 'saved',
        details: expect.objectContaining({ title: 'My title', transcript: 'live' }),
      }),
    );
    expectToday();
  });

  it('Finish later saves a draft without a title, then shows Today', async () => {
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-finish-later');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    expectToday();
  });

  it('stays on Review with the session kept when saving fails', async () => {
    jest.mocked(saveDream).mockRejectedValue(new Error('disk full'));
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:My title')).toBeTruthy();
    expect(screen.getByText('saving:false')).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('shows today on Review for a new dream', async () => {
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    expect(screen.getByText(`date:${dateLabel(new Date())}`)).toBeTruthy();
  });
});

const dateLabel = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** Saves a written dream as a draft so the log stub is on screen. */
async function reachList() {
  await renderApp();
  await press('stub-write');
  await fireEvent.changeText(screen.getByLabelText('Dream text'), 'x');
  await press('Continue');
  await press('stub-finish-later');
  await openDreamLog();
  jest.mocked(saveDream).mockClear();
}

describe('App draft reopening', () => {
  it('opens a draft on Review with its fields and its created date', async () => {
    await reachList();
    await press('stub-open-draft');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('transcript:it filled up')).toBeTruthy();
    expect(screen.getByText('title:Flooded hall')).toBeTruthy();
    expect(
      screen.getByText(`date:${dateLabel(new Date('2026-10-05T08:00:00.000Z'))}`),
    ).toBeTruthy();
  });

  it('back from a reopened draft saves its edits as a draft and returns to the log', async () => {
    await reachList();
    await press('stub-open-draft');
    await press('stub-set-title');
    await press('stub-review-back');
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

  it('hardware back from a reopened draft does the same', async () => {
    await reachList();
    await press('stub-open-draft');
    expect(await hardwareBack()).toBe(true);
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: '42', status: 'draft' }));
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('stays on the draft when saving it on the way back fails', async () => {
    await reachList();
    await press('stub-open-draft');
    jest.mocked(saveDream).mockRejectedValue(new Error('disk full'));
    await press('stub-review-back');
    expect(Alert.alert).toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
  });
});

describe('App Review back while saving', () => {
  it('blocks the arrow and hardware back until the save finishes', async () => {
    let resolve: (v: unknown) => void = () => {};
    jest.mocked(saveDream).mockReturnValue(new Promise((r) => (resolve = r)) as any);
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(screen.getByText('saving:true')).toBeTruthy();

    await press('stub-review-back');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.queryByText('Read it back')).toBeNull();

    await act(async () => resolve({ id: '1', createdAt: 'c' }));
    expectToday();
  });
});

describe('App back rules', () => {
  it('asks before discarding a recording; Keep leaves everything in place', async () => {
    await renderApp();
    await press('stub-save-recording');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard this dream?',
      'Your recording and text will be deleted.',
      expect.any(Array),
    );
    const keep = lastAlertButtons().find((b) => b.text === 'Keep');
    expect(keep?.style).toBe('cancel');
    expect(keep?.onPress).toBeUndefined();
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('Discard deletes the cache recording, clears the session and returns to capture', async () => {
    await renderApp();
    await press('stub-save-recording');
    await fireEvent.press(screen.getByLabelText('Back'));
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(discardRecording).toHaveBeenCalledWith('file:///cache/r.m4a');
    expect(screen.getByText('capture-screen')).toBeTruthy();
    // A new Write instead starts clean.
    await press('stub-write');
    expect(screen.getByLabelText('Dream text').props.value).toBe('');
  });

  it('asks before discarding written text, and Discard does not delete any file', async () => {
    await renderApp();
    await press('stub-write');
    await fireEvent.changeText(screen.getByLabelText('Dream text'), 'some words');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(discardRecording).not.toHaveBeenCalled();
    expect(screen.getByText('capture-screen')).toBeTruthy();
  });

  it('goes straight back to capture from an empty Write instead, with no alert', async () => {
    await renderApp();
    await press('stub-write');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('capture-screen')).toBeTruthy();
  });

  it('Review back goes to Read it back with everything kept', async () => {
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-review-back');
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(screen.getByLabelText('Dream text').props.value).toBe('live');
    // Back from here is a plain Read it back back: it asks again.
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    // And Continue still carries the title.
    await press('Continue');
    expect(screen.getByText('title:My title')).toBeTruthy();
  });
});

describe('App Android hardware back', () => {
  it('is not handled on capture (default behavior, exits)', async () => {
    await renderApp();
    expect(await hardwareBack()).toBe(false);
  });

  it('after saving goes to Today, then Journals and the log from there; Today exits', async () => {
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expectToday();
    await openDreamLog();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('journals-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expectToday();
    expect(await hardwareBack()).toBe(false);
  });

  it('on Read it back shows the discard alert and is handled', async () => {
    await renderApp();
    await press('stub-save-recording');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard this dream?',
      'Your recording and text will be deleted.',
      expect.any(Array),
    );
  });

  it('on an empty Write instead goes back to capture', async () => {
    await renderApp();
    await press('stub-write');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('capture-screen')).toBeTruthy();
  });

  it('on Review goes to Read it back, and from Edit returns to Review', async () => {
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('Read it back')).toBeTruthy();
    await press('Continue');
    await press('stub-edit');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
  });

  it('removes its listener on unmount', async () => {
    const remove = jest.fn();
    addListener.mockReturnValue({ remove });
    const view = await renderApp();
    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });
});

/** Capture -> No dream -> log, then opens the finished dream on its detail screen. */
async function reachDetail() {
  await renderApp();
  await goToLog();
  await press('stub-open-dream');
}

/** Detail -> Edit: an edit session on Review. */
async function reachEdit() {
  await reachDetail();
  await press('stub-detail-edit');
}

describe('App Dream log and detail', () => {
  it('opens on capture, and No dream goes to the log', async () => {
    await renderApp();
    expect(screen.getByText('capture-screen')).toBeTruthy();
    await goToLog();
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('New dream goes to capture without resetting the log view state', async () => {
    await renderApp();
    await goToLog();
    await press('stub-open-search');
    await press('stub-set-query');
    await press('stub-new-dream');
    expect(screen.getByText('capture-screen')).toBeTruthy();
    // The back arrow of a Dream capture opened from the log returns to the log.
    await press('stub-capture-back');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.getByText('query:hall')).toBeTruthy();
    expect(screen.getByText('searching:true')).toBeTruthy();
  });

  it('a row tap opens that dream on the detail screen', async () => {
    await reachDetail();
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.getByText('detail-title:Old title')).toBeTruthy();
  });

  it('detail back returns to the log with the view state kept', async () => {
    await renderApp();
    await goToLog();
    await press('stub-set-query');
    await press('stub-open-dream');
    await press('stub-detail-back');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.getByText('query:hall')).toBeTruthy();
  });

  it('hardware back on detail goes to the log and is handled', async () => {
    await reachDetail();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('hardware back on the log closes an open search first, then goes to Journals home', async () => {
    await renderApp();
    await goToLog();
    await press('stub-open-search');
    await press('stub-set-query');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('searching:false')).toBeTruthy();
    expect(screen.getByText('query:')).toBeTruthy();
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('journals-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expectToday();
    expect(await hardwareBack()).toBe(false);
  });

  it('hardware back on the log with search closed goes to Journals home and keeps the view state', async () => {
    await renderApp();
    await goToLog();
    await press('stub-set-query');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('journals-screen')).toBeTruthy();
    await press('stub-open-dreams');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.getByText('query:hall')).toBeTruthy();
  });

  it('falls back to the log when the detail dream is missing or a draft', async () => {
    mockLibrary.dreams = [finishedDream, { ...finishedDream, id: '42', status: 'draft' }];
    await renderApp();
    await goToLog();
    await press('stub-open-missing');
    expect(screen.queryByText('detail-screen')).toBeNull();
    expect(screen.getByText('log-screen')).toBeTruthy();
    await press('stub-open-draft-as-dream');
    expect(screen.queryByText('detail-screen')).toBeNull();
    expect(screen.getByText('log-screen')).toBeTruthy();
  });
});

describe('App edit flow', () => {
  it('Edit opens Review as an edit session with Finish later hidden', async () => {
    await reachEdit();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:Old title')).toBeTruthy();
    expect(screen.getByText('transcript:old text')).toBeTruthy();
    expect(screen.getByText('finishLater:false')).toBeTruthy();
  });

  it('a new dream still offers Finish later', async () => {
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    expect(screen.getByText('finishLater:true')).toBeTruthy();
  });

  it('Done with no edits writes nothing and returns to detail', async () => {
    await reachEdit();
    await press('stub-done');
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.getByText('detail-title:Old title')).toBeTruthy();
  });

  it('Done with changes saves as saved with full strings, refreshes and shows the new dream', async () => {
    mockLibrary.onRefresh = () => {
      mockLibrary.dreams = [{ ...finishedDream, title: 'My title' }];
    };
    await reachEdit();
    await press('stub-set-title');
    await press('stub-done');
    expect(saveDream).toHaveBeenCalledTimes(1);
    const arg = jest.mocked(saveDream).mock.calls[0][0] as any;
    expect(arg).toMatchObject({
      id: '7',
      status: 'saved',
      details: { title: 'My title', emotion: '', tags: ['water'], transcript: 'old text' },
    });
    expect(arg).not.toHaveProperty('recordingUri');
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.getByText('detail-title:My title')).toBeTruthy();
  });

  it('never saves a draft for an edit session (Finish later, back, hardware back)', async () => {
    await reachEdit();
    await press('stub-finish-later');
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
    await press('stub-set-title');
    await press('stub-review-back');
    await hardwareBack();
    expect(jest.mocked(saveDream).mock.calls.some(([a]) => a.status === 'draft')).toBe(false);
    expect(saveDream).not.toHaveBeenCalled();
  });

  it('stays on Review with the session kept when saving the edit fails', async () => {
    jest.mocked(saveDream).mockRejectedValue(new Error('disk full'));
    await reachEdit();
    await press('stub-set-title');
    await press('stub-done');
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:My title')).toBeTruthy();
  });

  it('back with edits asks first; Keep editing stays on Review', async () => {
    await reachEdit();
    await press('stub-set-title');
    await press('stub-review-back');
    expect(Alert.alert).toHaveBeenCalledWith(
      DISCARD_CHANGES_TITLE,
      DISCARD_CHANGES_MESSAGE,
      expect.any(Array),
    );
    const keep = lastAlertButtons().find((b) => b.text === DISCARD_CHANGES_KEEP);
    expect(keep?.style).toBe('cancel');
    expect(keep?.onPress).toBeUndefined();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:My title')).toBeTruthy();
  });

  it('Discard clears the edit and returns to detail with the stored dream', async () => {
    await reachEdit();
    await press('stub-set-title');
    await press('stub-review-back');
    const discard = lastAlertButtons().find((b) => b.text === DISCARD_CHANGES_DISCARD);
    expect(discard?.style).toBe('destructive');
    await act(async () => discard?.onPress?.());
    expect(screen.getByText('detail-title:Old title')).toBeTruthy();
    expect(saveDream).not.toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();
    // The session is gone: Edit starts again from the stored values.
    await press('stub-detail-edit');
    expect(screen.getByText('title:Old title')).toBeTruthy();
  });

  it('back and hardware back without edits go straight to detail', async () => {
    await reachEdit();
    await press('stub-review-back');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('detail-screen')).toBeTruthy();
    await press('stub-detail-edit');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('detail-screen')).toBeTruthy();
  });

  it('hardware back with edits shows the same alert', async () => {
    await reachEdit();
    await press('stub-set-title');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      DISCARD_CHANGES_TITLE,
      DISCARD_CHANGES_MESSAGE,
      expect.any(Array),
    );
  });

  it('Edit text then back returns to Review with no confirmation', async () => {
    await reachEdit();
    await press('stub-edit');
    expect(screen.getByText('Read it back')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
  });
});

describe('App refresh before leaving', () => {
  it('awaits the library refresh before leaving Review after Done', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(saveDream).toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.queryByText('log-screen')).toBeNull();
    await act(async () => finishRefresh());
    expectToday();
  });

  it('awaits the refresh for Finish later and for a draft back, and blocks back meanwhile', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-finish-later');
    expect(screen.getByText('review-screen')).toBeTruthy();
    // A second back while the refresh is pending must not save again.
    await press('stub-review-back');
    expect(saveDream).toHaveBeenCalledTimes(1);
    await act(async () => finishRefresh());
    expectToday();

    jest.mocked(saveDream).mockClear();
    await openDreamLog();
    await press('stub-open-draft');
    await press('stub-review-back');
    expect(screen.getByText('review-screen')).toBeTruthy();
    await act(async () => finishRefresh());
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: '42', status: 'draft' }));
  });

  it('awaits the refresh before returning to detail after an edit', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await reachEdit();
    await press('stub-set-title');
    await press('stub-done');
    expect(screen.getByText('review-screen')).toBeTruthy();
    await act(async () => finishRefresh());
    expect(screen.getByText('detail-screen')).toBeTruthy();
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

  it('success goes to the log and keeps the log view state', async () => {
    await renderApp();
    await goToLog();
    await press('stub-set-query');
    await press('stub-open-dream');
    await press('stub-detail-delete');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.queryByText('detail-screen')).toBeNull();
    expect(screen.getByText('query:hall')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'unreadable' }, 'Your saved dreams could not be read. Nothing was deleted.'],
    [
      { kind: 'blocked' },
      'A saved copy of your dreams is damaged, so this dream was not deleted. Nothing was changed.',
    ],
    [new Error('disk'), 'Please try again.'],
  ])('failure %# alerts, stays on the entry and can be retried', async (error, body) => {
    mockLibrary.onRemove = jest.fn().mockRejectedValueOnce(error);
    await reachDetail();
    await press('stub-detail-delete');
    expect(Alert.alert).toHaveBeenCalledWith('Could not delete dream', body);
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.getByText('deleting:false')).toBeTruthy();

    await press('stub-detail-delete');
    expect(mockLibrary.onRemove).toHaveBeenCalledTimes(2);
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('ignores back, hardware back and Edit while deleting, then works again after a failure', async () => {
    const g = gate();
    const remove = jest.fn(() => g.promise);
    mockLibrary.onRemove = remove;
    await reachDetail();
    await press('stub-detail-delete');
    expect(screen.getByText('deleting:true')).toBeTruthy();

    await press('stub-detail-back');
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('detail-screen')).toBeTruthy();
    await press('stub-detail-edit');
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.queryByText('review-screen')).toBeNull();
    await press('stub-detail-delete');
    expect(remove).toHaveBeenCalledTimes(1);

    await act(async () => g.reject(new Error('x')));
    expect(screen.getByText('deleting:false')).toBeTruthy();
    await press('stub-detail-back');
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('keeps the entry shown while the delete is still finishing after the list dropped the dream', async () => {
    const g = gate();
    mockLibrary.afterRemoveFilter = () => g.promise;
    await reachDetail();
    await press('stub-detail-delete');
    expect(mockLibrary.dreams?.some((d) => d.id === finishedDream.id)).toBe(false);
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.queryByText('log-screen')).toBeNull();

    await act(async () => g.resolve());
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.queryByText('detail-screen')).toBeNull();
  });

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
      expect(screen.queryByText('detail-screen')).toBeNull();
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
      expect(screen.getByText('detail-screen')).toBeTruthy();
      expect(screen.getByText('deleting:false')).toBeTruthy();
      expect(await hardwareBack()).toBe(true);
      expect(screen.getByText('log-screen')).toBeTruthy();
      expect(await hardwareBack()).toBe(true);
      expect(screen.getByText('journals-screen')).toBeTruthy();
      await act(async () => g.resolve());
      expect(screen.getByText('journals-screen')).toBeTruthy();
    });

    it('blocks Delete on another open entry while a list delete runs, and unblocks after', async () => {
      const g = gate();
      const remove = jest.fn(() => g.promise);
      mockLibrary.dreams = [finishedDream, otherDream];
      mockLibrary.onRemove = remove;
      await reachLog();
      await press('stub-list-delete-other');
      await press('stub-open-dream');
      expect(screen.getByText('blocked:true')).toBeTruthy();
      await act(async () => g.resolve());
      expect(screen.getByText('detail-screen')).toBeTruthy();
      expect(screen.getByText('blocked:false')).toBeTruthy();
    });

    it('rejects an entry delete invoked during a list delete, without a second remove or navigation', async () => {
      const g = gate();
      const remove = jest.fn(() => g.promise);
      mockLibrary.dreams = [finishedDream, otherDream];
      mockLibrary.onRemove = remove;
      await reachLog();
      await press('stub-list-delete-other');
      await press('stub-open-dream');
      await press('stub-detail-delete');
      expect(remove).toHaveBeenCalledTimes(1);
      expect(screen.getByText('detail-screen')).toBeTruthy();
      expect(screen.getByText('deleting:false')).toBeTruthy();
      await act(async () => g.resolve());
      expect(remove).toHaveBeenCalledTimes(1);
      expect(screen.getByText('detail-screen')).toBeTruthy();
    });

    it('does not pull the user off another open entry when the list delete ends', async () => {
      const g = gate();
      mockLibrary.dreams = [finishedDream, otherDream];
      mockLibrary.onRemove = () => g.promise;
      await reachLog();
      await press('stub-list-delete-other');
      await press('stub-open-dream');
      await act(async () => g.resolve());
      expect(screen.getByText('detail-screen')).toBeTruthy();
      expect(screen.getByText('detail-title:Old title')).toBeTruthy();
      await press('stub-detail-edit');
      expect(screen.getByText('review-screen')).toBeTruthy();
    });
  });

  it('hardware back from the entry still works when not deleting', async () => {
    await reachDetail();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('log-screen')).toBeTruthy();
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
  it('opens on Dream capture with no back arrow and the No dream pill', async () => {
    await renderApp();
    expect(screen.getByText('capture-journal:dreams')).toBeTruthy();
    expect(screen.getByText('stub-no-dream')).toBeTruthy();
    expect(screen.queryByText('stub-capture-back')).toBeNull();
  });

  it('No dream goes to the Dream log (unchanged)', async () => {
    await renderApp();
    await goToLog();
    expect(screen.getByText('log-journal:dreams')).toBeTruthy();
  });

  it('saving a launch dream goes to Today', async () => {
    await renderApp();
    await press('stub-save-recording');
    await press('Continue');
    expect(screen.getByText('review-journal:dreams')).toBeTruthy();
    await press('stub-set-title');
    await press('stub-done');
    expectToday();
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ journalId: 'dreams' }));
  });

  it('the log back arrow goes to Journals home, which has counts and goes back to Today', async () => {
    mockLibrary.dreams = [
      finishedDream,
      lifeEntry,
      { ...finishedDream, id: 'dr', status: 'draft' },
    ];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    expect(screen.getByText('journals-screen')).toBeTruthy();
    expect(screen.getByText('counts:{"dreams":1,"life":1}')).toBeTruthy();
    expect(screen.getByText('unreadable:false')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expectToday();
  });

  it('Journals home shows unreadable from the library status', async () => {
    mockLibrary.indexStatus = 'unreadable';
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    expect(screen.getByText('unreadable:true')).toBeTruthy();
  });

  it('each log shows only its own journal entries', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    expect(screen.getByText('log-ids:7')).toBeTruthy();
    await press('stub-log-back');
    await press('stub-open-life');
    expect(screen.getByText('log-journal:life')).toBeTruthy();
    expect(screen.getByText('log-ids:L1')).toBeTruthy();
  });

  it('opening another journal starts its log with a fresh view', async () => {
    await renderApp();
    await goToLog();
    await press('stub-set-query');
    await press('stub-log-back');
    await press('stub-open-life');
    expect(screen.getByText('query:')).toBeTruthy();
  });

  const reachLifeCapture = async () => {
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-open-life');
    await press('stub-new-dream');
  };

  it('Life capture comes from the Life log, has a back arrow and no No dream pill', async () => {
    await reachLifeCapture();
    expect(screen.getByText('capture-journal:life')).toBeTruthy();
    expect(screen.queryByText('stub-no-dream')).toBeNull();
    await press('stub-capture-back');
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('Android back on Life capture goes to the Life log, except while recording', async () => {
    await reachLifeCapture();
    await press('stub-capture-busy');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('capture-screen')).toBeTruthy();
    // Dreams capture still exits.
  });

  it('Android back on idle Life capture goes to the Life log', async () => {
    await reachLifeCapture();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('saving an untitled Life entry goes to the Life log', async () => {
    await reachLifeCapture();
    await press('stub-type-instead');
    expect(screen.getByLabelText('Entry text')).toBeTruthy();
    await press('Continue');
    expect(screen.getByText('review-journal:life')).toBeTruthy();
    await press('stub-done');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ journalId: 'life' }));
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('Read it back discard alert uses the entry wording for Life', async () => {
    await reachLifeCapture();
    await press('stub-type-instead');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard this entry?',
      'Your recording and text will be deleted.',
      expect.any(Array),
    );
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(screen.getByText('capture-journal:life')).toBeTruthy();
  });

  it('Journals home search opens Search over all records', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-journals-search');
    expect(screen.getByText('search-screen')).toBeTruthy();
    expect(screen.getByText('search-count:2')).toBeTruthy();
  });

  it('Search back (arrow and Android) goes to Journals home and resets the search view', async () => {
    const toSearch = async () => {
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
    expect(screen.getByText('journals-screen')).toBeTruthy();
    await press('stub-journals-search');
    expect(screen.getByText('search-query:')).toBeTruthy();
    expect(screen.getByText('search-tags:')).toBeTruthy();
    await press('stub-search-set-query');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('journals-screen')).toBeTruthy();
    await press('stub-journals-search');
    expect(screen.getByText('search-query:')).toBeTruthy();
  });

  it('a search result opens its entry; Back returns to Search with the view kept', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-journals-search');
    await press('stub-search-set-query');
    await press('stub-search-open-life');
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.getByText('detail-journal:life')).toBeTruthy();
    await press('stub-detail-back');
    expect(screen.getByText('search-screen')).toBeTruthy();
    expect(screen.getByText('search-query:hall')).toBeTruthy();
    await press('stub-search-open');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('search-query:hall')).toBeTruthy();
  });

  it('detail Back from the Life log returns to the Life log', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-open-life');
    await press('stub-open-life-entry');
    await press('stub-detail-back');
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('an edit round trip from Search returns to Search', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-journals-search');
    await press('stub-search-open');
    await press('stub-detail-edit');
    expect(screen.getByText('review-journal:dreams')).toBeTruthy();
    await press('stub-review-back');
    expect(screen.getByText('detail-screen')).toBeTruthy();
    await press('stub-detail-back');
    expect(screen.getByText('search-screen')).toBeTruthy();
  });

  it('edit-save of an untitled Life entry is allowed and returns to the entry', async () => {
    mockLibrary.dreams = [lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-journals-search');
    await press('stub-search-open-life');
    await press('stub-detail-edit');
    await press('stub-edit');
    await fireEvent.changeText(screen.getByLabelText('Entry text'), 'went for a long walk');
    await press('Continue');
    await press('stub-done');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: 'L1' }));
    expect(screen.getByText('detail-screen')).toBeTruthy();
  });

  it('edit-save of a Dreams entry with its title cleared is still blocked', async () => {
    await reachEdit();
    await press('stub-clear-title');
    await press('stub-done');
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
  });

  it('Edit back with changes uses the entry wording for Life', async () => {
    mockLibrary.dreams = [lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-open-life');
    await press('stub-open-life-entry');
    await press('stub-detail-edit');
    await press('stub-set-title');
    await press('stub-review-back');
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

  it('a delete from an entry opened from Search returns to Search', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-journals-search');
    await press('stub-search-open');
    await press('stub-detail-delete');
    await act(async () => {});
    expect(screen.getByText('search-screen')).toBeTruthy();
  });

  it('a delete from a Life entry returns to the Life log', async () => {
    mockLibrary.dreams = [finishedDream, lifeEntry];
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-open-life');
    await press('stub-open-life-entry');
    await press('stub-detail-delete');
    await act(async () => {});
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('an entry-started delete still blocks Back (arrow and Android) on Search-origin entries', async () => {
    let resolve!: () => void;
    const g = { promise: new Promise<void>((r) => (resolve = r)), resolve: () => resolve() };
    mockLibrary.dreams = [finishedDream];
    mockLibrary.onRemove = () => g.promise;
    await renderApp();
    await goToLog();
    await press('stub-log-back');
    await press('stub-journals-search');
    await press('stub-search-open');
    await press('stub-detail-delete');
    await press('stub-detail-back');
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('detail-screen')).toBeTruthy();
    await act(async () => g.resolve());
    expect(screen.getByText('search-screen')).toBeTruthy();
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
    expect(screen.queryByText('capture-screen')).toBeNull();
    expect(screen.queryByText('New dream')).toBeNull();
    await act(async () => {
      mockLibrary.push?.([]);
    });
    expect(screen.getByText('capture-screen')).toBeTruthy();
  });

  it.each([
    ['nothing today', [oldDream], true, null, 'capture'],
    ['a finished dream today', [todayDream], true, null, 'today'],
    ['No dream chosen today', [oldDream], true, 'today', 'today'],
    ['a stale No dream date', [oldDream], true, '2020-01-01', 'capture'],
    ['only a Life entry today', [todayLife], true, null, 'capture'],
    ['only a Dream draft today', [todayDraft], true, null, 'capture'],
    ['nothing today with auto-open off', [oldDream], false, null, 'today'],
  ] as const)('%s', async (_name, dreams, autoOpen, marker, expected) => {
    mockLibrary.dreams = [...dreams];
    putSettings(autoOpen);
    if (marker) putMarker(marker === 'today' ? todayKeyNow() : marker);
    await renderApp();
    if (expected === 'capture') {
      expect(screen.getByText('capture-screen')).toBeTruthy();
      // The launch capture has no back arrow and offers "No dream".
      expect(screen.queryByText('stub-capture-back')).toBeNull();
      expect(screen.getByText('stub-no-dream')).toBeTruthy();
    } else {
      expectToday();
      expect(screen.queryByText('capture-screen')).toBeNull();
    }
  });

  it('opens Dream capture when the data is not ready within the cap, and does not move later', async () => {
    jest.useFakeTimers();
    try {
      mockLibrary.dreams = null;
      await render(<App />);
      expect(screen.queryByText('capture-screen')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(999);
      });
      expect(screen.queryByText('capture-screen')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.getByText('capture-screen')).toBeTruthy();
      expect(screen.getByText('stub-no-dream')).toBeTruthy();
      expect(screen.queryByText('stub-capture-back')).toBeNull();

      // The data arrives late and says a dream exists today: the user is not moved.
      await act(async () => {
        mockLibrary.push?.([todayDream]);
      });
      expect(screen.getByText('capture-screen')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not open capture by the cap once the data resolved the launch', async () => {
    jest.useFakeTimers();
    try {
      mockLibrary.dreams = [todayDream];
      await render(<App />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expectToday();
      expect(screen.queryByText('capture-screen')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('No dream saves the marker, lands on Today with "No dream today", and the next launch opens Today', async () => {
    mockLibrary.dreams = [oldDream];
    const view = await renderApp();
    await press('stub-no-dream');
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

    // Nothing today now: with the toggle on this would open Dream capture.
    mockLibrary.dreams = [oldDream];
    await renderApp();
    expectToday();
    expect(screen.queryByText('capture-screen')).toBeNull();
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

  it('an entry opens its detail and Back (arrow and Android) returns to Today', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    await press('Flying over the sea');
    expect(screen.getByText('detail-screen')).toBeTruthy();
    await press('stub-detail-back');
    expectToday();
    await press('Flying over the sea');
    expect(await hardwareBack()).toBe(true);
    expectToday();
  });

  it('an edit round trip from Today returns to the entry, then Today', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    await press('Flying over the sea');
    await press('stub-detail-edit');
    await press('stub-done');
    expect(screen.getByText('detail-screen')).toBeTruthy();
    await press('stub-detail-back');
    expectToday();
  });

  it('deleting an entry from its detail returns to Today', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    await press('Flying over the sea');
    await press('stub-detail-delete');
    expect(Alert.alert).not.toHaveBeenCalled();
    expectToday();
    expect(screen.queryByText('Flying over the sea')).toBeNull();
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

  it('Journals opens from the book icon; its arrow and Android back return to Today', async () => {
    mockLibrary.dreams = [todayDream];
    await renderApp();
    await pressLabel('Open Journals');
    expect(screen.getByText('journals-screen')).toBeTruthy();
    await press('stub-journals-back');
    expectToday();
    await pressLabel('Open Journals');
    expect(await hardwareBack()).toBe(true);
    expectToday();
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

  it('Android back on the launch capture exits the app', async () => {
    mockLibrary.dreams = [oldDream];
    await renderApp();
    expect(await hardwareBack()).toBe(false);
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

describe('App captures opened from Today and the log', () => {
  beforeEach(() => {
    mockLibrary.dreams = [todayDream];
  });

  it('Dream capture from Today has a back arrow, no "No dream", and returns to Today', async () => {
    await renderApp();
    await press('New dream');
    expect(screen.getByText('capture-journal:dreams')).toBeTruthy();
    expect(screen.queryByText('stub-no-dream')).toBeNull();
    await press('stub-capture-back');
    expectToday();
    await press('New dream');
    expect(await hardwareBack()).toBe(true);
    expectToday();
  });

  it('saving a Dream from Today returns to Today', async () => {
    await renderApp();
    await press('New dream');
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expectToday();
  });

  it('Dream capture from the Dream log has a back arrow, no "No dream", and returns to the log', async () => {
    await renderApp();
    await openDreamLog();
    await press('stub-new-dream');
    expect(screen.getByText('capture-journal:dreams')).toBeTruthy();
    expect(screen.queryByText('stub-no-dream')).toBeNull();
    await press('stub-capture-back');
    expect(screen.getByText('log-screen')).toBeTruthy();

    await press('stub-new-dream');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('saving a Dream from the Dream log returns to the log', async () => {
    await renderApp();
    await openDreamLog();
    await press('stub-new-dream');
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(screen.getByText('log-journal:dreams')).toBeTruthy();
  });

  it('the launch capture saved lands on Today; "New dream" there has a back arrow and no "No dream"', async () => {
    mockLibrary.dreams = [oldDream];
    await renderApp();
    expect(screen.getByText('stub-no-dream')).toBeTruthy();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expectToday();
    await press('New dream');
    expect(screen.getByText('stub-capture-back')).toBeTruthy();
    expect(screen.queryByText('stub-no-dream')).toBeNull();
  });

  it('Life capture from Today returns to Today by arrow, Android back and save', async () => {
    await renderApp();
    await press('New Life entry');
    expect(screen.getByText('capture-journal:life')).toBeTruthy();
    expect(screen.queryByText('stub-no-dream')).toBeNull();
    await press('stub-capture-back');
    expectToday();

    await press('New Life entry');
    expect(await hardwareBack()).toBe(true);
    expectToday();

    await press('New Life entry');
    await press('stub-type-instead');
    await press('Continue');
    await press('stub-done');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ journalId: 'life' }));
    expectToday();
  });

  it('Life capture from the Life log still returns to the Life log', async () => {
    await renderApp();
    await pressLabel('Open Journals');
    await press('stub-open-life');
    await press('stub-new-dream');
    expect(screen.getByText('capture-journal:life')).toBeTruthy();
    await press('stub-capture-back');
    expect(screen.getByText('log-journal:life')).toBeTruthy();
  });

  it('a draft opened from Today goes Review -> Done -> Today', async () => {
    mockLibrary.dreams = [todayDraft];
    await renderApp();
    expect(screen.getByText('capture-screen')).toBeTruthy();
    await press('stub-no-dream');
    await press('Half a dream');
    expect(screen.getByText('review-screen')).toBeTruthy();
    await press('stub-done');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ status: 'saved' }));
    expectToday();
  });

  it('a draft opened from Today returns to Today from Review back and Finish later', async () => {
    mockLibrary.dreams = [todayDraft];
    putSettings(false);
    await renderApp();
    await press('Half a dream');
    await press('stub-review-back');
    expectToday();
    await press('Half a dream');
    await press('stub-finish-later');
    expectToday();
  });

  it('a draft opened from Today then Read it back (Edit) and back returns to Review', async () => {
    mockLibrary.dreams = [todayDraft];
    putSettings(false);
    await renderApp();
    await press('Half a dream');
    await press('stub-edit');
    expect(screen.getByText('Read it back')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText('review-screen')).toBeTruthy();
  });
});

describe('App launch cap timer', () => {
  it('is cleared on unmount', async () => {
    jest.useFakeTimers();
    try {
      const capIds: unknown[] = [];
      const realSet = globalThis.setTimeout;
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
        const id = realSet(fn, ms);
        if (ms === 1000) capIds.push(id);
        return id;
      }) as never);
      const clear = jest.spyOn(globalThis, 'clearTimeout');
      mockLibrary.dreams = null;
      const view = await render(<App />);
      expect(capIds).toHaveLength(1);
      await view.unmount();
      expect(clear).toHaveBeenCalledWith(capIds[0]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a late fire after the launch decided sets no capture state', async () => {
    jest.useFakeTimers();
    try {
      mockLibrary.dreams = [todayDream];
      await render(<App />);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expectToday();
      await press('New dream');
      // Not a launch capture: it has a back arrow and no "No dream".
      expect(screen.getByText('stub-capture-back')).toBeTruthy();
      expect(screen.queryByText('stub-no-dream')).toBeNull();
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
    expect(screen.getByText('capture-screen')).toBeTruthy();
    expect(screen.getByText('capture-journal:dreams')).toBeTruthy();
    expect(screen.getByText('stub-no-dream')).toBeTruthy();
    expect(screen.queryByText('stub-capture-back')).toBeNull();
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

  it('from Today with nothing done on the new day: launch capture, then No dream lands on Today', async () => {
    await launch();
    expectToday();
    await awayUntil(DAY2);
    expectLaunchCapture();
    await press('stub-no-dream');
    expectToday();
    expect(screen.getByText('No dream today')).toBeTruthy();
  });

  it('the jump is a launch capture: saving returns to Today', async () => {
    await launch();
    await awayUntil(DAY2);
    expectLaunchCapture();
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expectToday();
  });

  it.each([
    ['Journals', async () => pressLabel('Open Journals'), 'journals-screen'],
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
    ['an entry', async () => press('Day one dream'), 'detail-screen'],
    ['Settings', async () => pressLabel('Open Settings'), 'Settings'],
    [
      'Search',
      async () => {
        await pressLabel('Open Journals');
        await press('stub-journals-search');
      },
      'search-screen',
    ],
  ] as const)('from %s: launch capture', async (_n, open, marker) => {
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
    expect(screen.queryByText('capture-screen')).toBeNull();
  });

  it('stays when No dream was chosen for the new day', async () => {
    putMarker('2026-10-11');
    await launch();
    await awayUntil(DAY2);
    expectToday();
    expect(screen.queryByText('capture-screen')).toBeNull();
  });

  it('with auto-open off it does nothing at all, even from another screen', async () => {
    putSettings(false);
    await launch();
    await pressLabel('Open Journals');
    await awayUntil(DAY2);
    expect(screen.getByText('journals-screen')).toBeTruthy();
    expect(screen.queryByText('capture-screen')).toBeNull();
  });

  it('uses the setting as changed in Settings, not the one read at launch', async () => {
    await launch();
    await pressLabel('Open Settings');
    await fireEvent(screen.getByLabelText('Open dream capture on launch'), 'valueChange', false);
    await awayUntil(DAY2);
    expect(screen.queryByText('capture-screen')).toBeNull();
  });

  it('stays mid-capture (a Life capture from Today)', async () => {
    await launch();
    await press('New Life entry');
    await awayUntil(DAY2);
    expect(screen.getByText('capture-journal:life')).toBeTruthy();
    expect(screen.getByText('stub-capture-back')).toBeTruthy();
  });

  it('stays on Read it back', async () => {
    await launch();
    await press('New dream');
    await press('stub-type-instead');
    expect(screen.getByText('Read it back')).toBeTruthy();
    await awayUntil(DAY2);
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(screen.queryByText('capture-screen')).toBeNull();
  });

  it('stays on Review', async () => {
    await launch();
    await press('New dream');
    await press('stub-type-instead');
    await press('Continue');
    expect(screen.getByText('review-screen')).toBeTruthy();
    await awayUntil(DAY2);
    expect(screen.getByText('review-screen')).toBeTruthy();
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
    expect(screen.queryByText('capture-screen')).toBeNull();
    await act(async () => resolve());
    expect(screen.queryByText('capture-screen')).toBeNull();
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
    expect(screen.queryByText('capture-screen')).toBeNull();
    expect(screen.queryByText('Day one dream')).toBeNull();
  });

  it('a foreground rollover after an earlier resume jump does not redirect either', async () => {
    await launch();
    await awayUntil(DAY2);
    expectLaunchCapture();
    await press('stub-no-dream');
    expectToday();
    expect(screen.getByText('No dream today')).toBeTruthy();
    // The next midnight happens in the foreground (the pending timer fires ~15 h later).
    await act(async () => {
      await jest.advanceTimersByTimeAsync(16 * 3600_000);
    });
    // The day really rolled (the skip belonged to the earlier day) and nothing redirected.
    expectToday();
    expect(screen.queryByText('No dream today')).toBeNull();
    expect(screen.queryByText('capture-screen')).toBeNull();
  });

  it('an edit session opened from an entry blocks the resume jump', async () => {
    await launch();
    await press('Day one dream');
    await press('stub-detail-edit');
    expect(screen.getByText('review-screen')).toBeTruthy();
    await awayUntil(DAY2);
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.queryByText('capture-screen')).toBeNull();
  });

  it('inactive then active on the same day does not jump', async () => {
    mockLibrary.dreams = [day0Dream];
    putMarker('2026-10-10');
    await launch();
    await emit('inactive');
    await emit('active');
    expectToday();
    expect(screen.queryByText('capture-screen')).toBeNull();
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
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-finish-later');
    expectToday();
    await emit('background');
    await emit('active');
    expectToday();
  });

  it('jumps once per new day, and again only when the day changes again', async () => {
    await launch();
    await awayUntil(DAY2);
    expectLaunchCapture();
    // Finish later leaves nothing done, so only the once-per-day rule keeps capture away.
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-finish-later');
    expectToday();
    await awayUntil(new Date(2026, 9, 11, 21, 0, 0));
    expectToday();
    expect(screen.queryByText('capture-screen')).toBeNull();
    await awayUntil(new Date(2026, 9, 12, 8, 0, 0));
    expectLaunchCapture();
  });
});
