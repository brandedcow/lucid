import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, Alert, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotesNavigator } from '../navigation/NotesNavigator';
import { EditorRoute, NotesRoute, RecentlyDeletedRoute } from '../navigation/notesRoutes';
import { resetLegacyImportForTests } from '../services/legacyImport';
import { Note, resetCorruptCopyGuard } from '../services/notesStorage';
import { __fs } from '../test/fakeFileSystem';
import { localDateKey } from '../utils/today';
import { AppFlowProvider, useAppFlow, type AppFlow } from './AppFlowProvider';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: {} },
}));

// `useToday` is replaced by a controllable stand-in (the hook itself is tested in useToday.test.ts):
// `bump(key)` is what returning on a new day does, a new day key and a higher token in one update.
let mockBump: (key?: string) => void = () => {};
jest.mock('../hooks/useToday', () => {
  const { useState: useS } = jest.requireActual('react');
  const { localDateKey: keyOf } = jest.requireActual('../utils/today');
  return {
    useToday: () => {
      const [state, setState] = useS(() => ({
        todayKey: keyOf(new Date()),
        resumeNewDayToken: 0,
      }));
      mockBump = (key?: string) =>
        setState((p: { todayKey: string; resumeNewDayToken: number }) => ({
          todayKey: key ?? p.todayKey,
          resumeNewDayToken: p.resumeNewDayToken + 1,
        }));
      return state;
    },
  };
});

jest.mock('../screens/NoteEditorWithVoice', () => {
  const { Pressable, Text: T } = jest.requireActual('react-native');
  return {
    NoteEditorWithVoice: (p: {
      session: { body: string };
      actions: { setBody: (t: string) => void };
      onBack: () => void;
    }) => (
      <>
        <T>{`editor-body:${p.session.body}`}</T>
        <Pressable onPress={p.onBack}>
          <T>editor-back</T>
        </Pressable>
        <Pressable onPress={() => p.actions.setBody('hello')}>
          <T>editor-type</T>
        </Pressable>
      </>
    ),
  };
});

const DOC = 'file:///document/';
const INDEX = DOC + 'notes.json';
const SETTINGS = DOC + 'settings.json';
const DAY_MARKER = DOC + 'no-dream.json';
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

const SettingsStub = () => <Text>settings-page</Text>;
const probe: { current: AppFlow | null } = { current: null };
const flow = () => probe.current as AppFlow;
function Probe() {
  const value = useAppFlow();
  useEffect(() => {
    probe.current = value;
  });
  return null;
}
function Gate() {
  const f = useAppFlow();
  if (!f.launchDecided) return <Text>gate</Text>;
  return (
    <NotesNavigator
      notes={NotesRoute}
      editor={EditorRoute}
      settings={SettingsStub}
      recentlyDeleted={RecentlyDeletedRoute}
      navigationRef={f.navigationRef}
      startInEditor={f.startInEditor}
    />
  );
}
const app = () => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <AppFlowProvider>
      <Probe />
      <Gate />
    </AppFlowProvider>
  </SafeAreaProvider>
);

const today = () => localDateKey(new Date());
const TOMORROW = '2999-01-02';
const DAY_AFTER = '2999-01-03';
const putIndex = (notes: Note[]) => __fs.put(INDEX, JSON.stringify({ version: 1, notes }));
const stored = (): Note[] => JSON.parse(__fs.read(INDEX) as string).notes;
const marker = () => JSON.parse(__fs.read(DAY_MARKER) as string);
const old = (id: string, body: string, extra: Partial<Note> = {}): Note => ({
  id,
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
  body,
  ...extra,
});
const markDone = () => __fs.put(DAY_MARKER, JSON.stringify({ noDreamDate: today() }));
const route = () => flow().navigationRef.getCurrentRoute()?.name;
const editorOpen = () => screen.queryByText(/^editor-body:/) !== null;
const waitForList = () =>
  waitFor(() => expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy());
const waitForEditor = () => waitFor(() => expect(route()).toBe('Editor'));
const bump = (key?: string) =>
  act(async () => {
    mockBump(key);
  });
/** Lets effects and any (wrongly) started navigation settle. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

// The cold start lands on the list: today is already done, the setting is on.
async function startOnList(notes: Note[] = [old('a', 'first note')]) {
  putIndex(notes);
  markDone();
  const view = await render(app());
  await waitForList();
  // Test notes are old, so list them under All Notes (Today is the default view).
  await act(async () => flow().setView({ kind: 'all' }));
  return view;
}

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  resetLegacyImportForTests();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('resume on a new day: opens a launch note over the current screen', () => {
  it('over the note list; backing out of the empty note returns to the list and marks the day', async () => {
    await startOnList();
    await bump(TOMORROW);
    await waitForEditor();
    expect(screen.getByText('editor-body:')).toBeTruthy();
    await fireEvent.press(screen.getByText('editor-back'));
    await waitFor(() => expect(route()).toBe('Notes'));
    await waitFor(() => expect(marker()).toEqual({ noDreamDate: TOMORROW }));
    expect(stored()).toHaveLength(1);
  });

  it('over Settings, and leaving returns to Settings', async () => {
    await startOnList();
    await act(async () => {
      flow().navigationRef.navigate('Settings');
    });
    await waitFor(() => expect(route()).toBe('Settings'));
    await bump(TOMORROW);
    await waitForEditor();
    await fireEvent.press(screen.getByText('editor-back'));
    await waitFor(() => expect(route()).toBe('Settings'));
  });

  it('over Recently Deleted, and leaving returns there', async () => {
    await startOnList([
      old('a', 'first note'),
      old('b', 'gone', { deletedAt: '2026-02-01T09:00:00.000Z' }),
    ]);
    await act(async () => {
      flow().navigationRef.navigate('RecentlyDeleted');
    });
    await waitFor(() => expect(route()).toBe('RecentlyDeleted'));
    await bump(TOMORROW);
    await waitForEditor();
    await fireEvent.press(screen.getByText('editor-back'));
    await waitFor(() => expect(route()).toBe('RecentlyDeleted'));
  });

  it('does not reopen after backing out that day, and a second resume the next day works', async () => {
    await startOnList();
    await bump(TOMORROW);
    await waitForEditor();
    await fireEvent.press(screen.getByText('editor-back'));
    await waitFor(() => expect(marker()).toEqual({ noDreamDate: TOMORROW }));
    await waitFor(() => expect(route()).toBe('Notes'));
    await bump(TOMORROW);
    await settle();
    expect(route()).toBe('Notes');
    await bump(DAY_AFTER);
    await waitForEditor();
  });

  it('a resumed note with content keeps its onCreated marking and is saved', async () => {
    await startOnList();
    await bump(TOMORROW);
    await waitForEditor();
    await fireEvent.press(screen.getByText('editor-type'));
    await fireEvent.press(screen.getByText('editor-back'));
    await waitFor(() => expect(route()).toBe('Notes'));
    await waitFor(() => expect(stored()).toHaveLength(2));
    // The note is created now, so the marker holds its creation day.
    await waitFor(() => expect(marker()).toEqual({ noDreamDate: today() }));
  });
});

describe('resume on a new day: guards', () => {
  it('does nothing when the setting is off', async () => {
    __fs.put(SETTINGS, JSON.stringify({ autoOpenDreamCapture: false }));
    await startOnList();
    await bump(TOMORROW);
    await settle();
    expect(route()).toBe('Notes');
    expect(editorOpen()).toBe(false);
  });

  it('does nothing when a note was written today', async () => {
    await startOnList([old('a', 'x', { createdAt: new Date().toISOString() })]);
    await bump();
    await settle();
    expect(route()).toBe('Notes');
  });

  it('does nothing when today only has a note in Recently Deleted', async () => {
    const now = new Date().toISOString();
    await startOnList([old('a', 'x', { createdAt: now, deletedAt: now })]);
    await bump();
    await settle();
    expect(route()).toBe('Notes');
  });

  it('does nothing when the day marker is today', async () => {
    await startOnList();
    await bump();
    await settle();
    expect(route()).toBe('Notes');
  });

  it('does nothing when the index is unreadable', async () => {
    __fs.put(INDEX, '{ not json');
    markDone();
    await render(app());
    await waitForList();
    await bump(TOMORROW);
    await settle();
    expect(route()).toBe('Notes');
  });

  it('does nothing while an editor is open, and the token is not retried after leaving', async () => {
    await startOnList();
    await fireEvent.press(screen.getByLabelText(/first note/));
    await waitForEditor();
    await bump(TOMORROW);
    await settle();
    expect(screen.getByText('editor-body:first note')).toBeTruthy();
    await fireEvent.press(screen.getByText('editor-back'));
    await waitFor(() => expect(route()).toBe('Notes'));
    await settle();
    expect(route()).toBe('Notes');
    expect(editorOpen()).toBe(false);
  });

  it('does nothing while a trash operation or its confirm is open, and does not retry', async () => {
    await startOnList([
      old('a', 'first note'),
      old('b', 'gone', { deletedAt: '2026-02-01T09:00:00.000Z' }),
    ]);
    await act(async () => {
      flow().navigationRef.navigate('RecentlyDeleted');
    });
    await waitFor(() => expect(route()).toBe('RecentlyDeleted'));
    // The confirm is mocked and never answered, so the guard stays held.
    await act(async () => {
      flow().requestEmptyTrash();
    });
    expect(Alert.alert).toHaveBeenCalled();
    expect(flow().trashBusy).toBe(true);
    await bump(TOMORROW);
    await settle();
    expect(route()).toBe('RecentlyDeleted');
    // Answering Keep releases the guard; the consumed token does not open a note afterwards.
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2] as {
      text: string;
      onPress?: () => void;
    }[];
    await act(async () => {
      buttons.find((b) => b.text === 'Keep')?.onPress?.();
    });
    await settle();
    expect(route()).toBe('RecentlyDeleted');
  });

  it('never runs before the launch is decided', async () => {
    putIndex([old('a', 'first note')]);
    markDone();
    await render(app());
    // The gate is still showing or just resolved; a bump now is consumed, not queued.
    await bump();
    await waitForList();
    await settle();
    expect(editorOpen()).toBe(false);
  });
});

describe('todayKey on the flow', () => {
  it('equals the local date key of the clock and follows useToday', async () => {
    await startOnList();
    expect(flow().todayKey).toBe(today());
    await bump(TOMORROW);
    expect(flow().todayKey).toBe(TOMORROW);
  });
});

describe('resume on a new day: lifecycle', () => {
  it('adds no timers of its own', async () => {
    jest.useFakeTimers();
    await startOnList();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    // The same trip through the editor with the + button is the baseline for what is left armed.
    await fireEvent.press(screen.getByLabelText('New note'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    await fireEvent.press(screen.getByText('editor-back'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(route()).toBe('Notes');
    const before = jest.getTimerCount();
    await bump(TOMORROW);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(route()).toBe('Editor');
    await fireEvent.press(screen.getByText('editor-back'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(route()).toBe('Notes');
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
  });

  it('does not update state after unmount', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const view = await startOnList();
    await bump(TOMORROW);
    await waitForEditor();
    await fireEvent.press(screen.getByText('editor-type'));
    // Leave the resumed note and unmount before the leave finishes.
    await act(async () => {
      void flow().leaveEditor();
      await view.unmount();
    });
    await settle();
    expect(errors).not.toHaveBeenCalled();
  });
});
