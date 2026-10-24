import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, Alert, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotesNavigator } from '../navigation/NotesNavigator';
import { EditorRoute, NotesRoute, RecentlyDeletedRoute } from '../navigation/notesRoutes';
import { resetLegacyImportForTests } from '../services/legacyImport';
import * as storage from '../services/notesStorage';
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

// `useToday` is a controllable stand-in: `bump(key)` is returning to the app on a new day.
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

// The real editor page is tested on its own; here it is a stub that shows the session.
jest.mock('../screens/NoteEditorWithVoice', () => {
  const { Pressable, Text: T } = jest.requireActual('react-native');
  const press = (label: string, onPress?: () => void) => (
    <Pressable onPress={onPress}>
      <T>{label}</T>
    </Pressable>
  );
  return {
    NoteEditorWithVoice: (p: {
      session: { id: string; body: string; stored: boolean };
      actions: { setBody: (t: string) => void };
      locked: boolean;
      onBack: () => void;
      onRecordingChange: (r: boolean) => void;
      leaveRef: { current: (() => void) | null };
    }) => (
      <>
        <T>{`editor-body:${p.session.body}`}</T>
        <T>{`editor-stored:${p.session.stored}`}</T>
        <T>{`editor-locked:${p.locked}`}</T>
        {press('editor-back', p.onBack)}
        {press('editor-edit', () => p.actions.setBody('Alpha edited'))}
        {press('editor-record', () => {
          p.leaveRef.current = jest.fn();
          p.onRecordingChange(true);
        })}
      </>
    ),
  };
});

const INDEX = 'file:///document/notes.json';
const DAY_MARKER = 'file:///document/no-dream.json';
const SETTINGS = 'file:///document/settings.json';
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

const note = (id: string, body: string, extra: Partial<Note> = {}): Note => ({
  id,
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
  body,
  ...extra,
});
const putIndex = (notes: Note[]) => __fs.put(INDEX, JSON.stringify({ version: 1, notes }));
const stored = (): Note[] => JSON.parse(__fs.read(INDEX) as string).notes;
const press = (label: string) => fireEvent.press(screen.getByText(label));
const follow = (target: string) => act(async () => flow().followNoteLink(target));
const alertButton = (text: string) => {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  return (call?.[2] as { text: string; onPress?: () => void }[]).find((b) => b.text === text)!;
};
const back = () => act(async () => flow().leaveEditor());
const route = () => flow().navigationRef.getCurrentRoute()?.name;

/** Starts on the list with the given notes, opens `id` from it. */
const openFromList = async (notes: Note[], id: string) => {
  putIndex(notes);
  __fs.put(SETTINGS, JSON.stringify({ autoOpenDreamCapture: false }));
  await render(app());
  await waitFor(() => expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy());
  await act(async () => flow().setView({ kind: 'all' }));
  await act(async () => flow().openNote(id));
  await waitFor(() => expect(screen.getByText(/^editor-body:/)).toBeTruthy());
};

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

const sessionId = () => flow().session?.id;

describe('Back returns to the previous note', () => {
  it('A to B, Back: A opens in the same route, B saved, A fresh', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    await follow('Beta');
    expect(flow().backLabel).toBe('Back to previous note');
    // A changes in storage meanwhile (stale list in state).
    putIndex([note('a', 'Alpha fresh'), note('b', 'Beta')]);
    await press('editor-edit'); // B body becomes 'Alpha edited'
    await back();
    expect(route()).toBe('Editor');
    expect(sessionId()).toBe('a');
    expect(screen.getByText('editor-body:Alpha fresh')).toBeTruthy();
    expect(stored().find((n) => n.id === 'b')?.body).toBe('Alpha edited');
    expect(flow().backLabel).toBeUndefined();
    expect(screen.getByText('editor-locked:false')).toBeTruthy();
    await back();
    await waitFor(() => expect(route()).toBe('Notes'));
  });

  it('A to B to C: Back goes C, B, A, list', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta'), note('c', 'Gamma')], 'a');
    await follow('Beta');
    await follow('Gamma');
    expect(sessionId()).toBe('c');
    await back();
    expect(sessionId()).toBe('b');
    await back();
    expect(sessionId()).toBe('a');
    expect(flow().backLabel).toBeUndefined();
    await back();
    await waitFor(() => expect(route()).toBe('Notes'));
  });

  it('A to B to A keeps trail [A, B]: Back goes B, A, list', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    await follow('Beta');
    await follow('Alpha');
    expect(sessionId()).toBe('a');
    await back();
    expect(sessionId()).toBe('b');
    await back();
    expect(sessionId()).toBe('a');
    await back();
    await waitFor(() => expect(route()).toBe('Notes'));
  });

  // A trail left over with the editor closed and the route moved away (not reachable through the
  // app's own leave, which clears it): each way of opening a note starts with an empty trail.
  const withTrailOnSettings = async (autoOpen = false) => {
    putIndex([note('a', 'Alpha'), note('b', 'Beta')]);
    __fs.put(SETTINGS, JSON.stringify({ autoOpenDreamCapture: autoOpen }));
    __fs.put(DAY_MARKER, JSON.stringify({ noDreamDate: localDateKey(new Date()) }));
    await render(app());
    await waitFor(() => expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy());
    await act(async () => flow().setView({ kind: 'all' }));
    await act(async () => flow().openNote('a'));
    await waitFor(() => expect(screen.getByText(/^editor-body:/)).toBeTruthy());
    await follow('Beta');
    expect(flow().backLabel).toBe('Back to previous note');
    await act(async () => {
      await flow().sessionActions.leave();
    });
    await act(async () => {
      flow().navigationRef.navigate('Settings');
    });
    await waitFor(() => expect(route()).toBe('Settings'));
  };

  it('opening a note from the list clears the trail', async () => {
    await withTrailOnSettings();
    await act(async () => flow().openNote('a'));
    expect(sessionId()).toBe('a');
    expect(flow().backLabel).toBeUndefined();
  });

  it('the + button clears the trail', async () => {
    await withTrailOnSettings();
    await act(async () => flow().openNewNote());
    expect(flow().session).not.toBeNull();
    expect(flow().backLabel).toBeUndefined();
  });

  it('a launch resume on a new day clears the trail', async () => {
    await withTrailOnSettings(true);
    await act(async () => {
      mockBump('2999-01-02');
    });
    await waitFor(() => expect(route()).toBe('Editor'));
    expect(flow().session).not.toBeNull();
    expect(flow().backLabel).toBeUndefined();
  });

  it('leaving to the list clears the trail; the next note opened from the list has none', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    await follow('Beta');
    await back();
    await back();
    await waitFor(() => expect(route()).toBe('Notes'));
    await act(async () => flow().openNote('b'));
    expect(flow().backLabel).toBeUndefined();
    await back();
    await waitFor(() => expect(route()).toBe('Notes'));
  });

  it('skips a trail entry in Recently Deleted or missing; none valid goes to the list', async () => {
    await openFromList(
      [note('a', 'Alpha'), note('b', 'Beta'), note('c', 'Gamma'), note('d', 'Delta')],
      'a',
    );
    await follow('Beta');
    await follow('Gamma');
    await follow('Delta');
    // C is trashed, B is gone.
    putIndex([
      note('a', 'Alpha'),
      note('c', 'Gamma', { deletedAt: '2026-02-01T09:00:00.000Z' }),
      note('d', 'Delta'),
    ]);
    await back();
    expect(route()).toBe('Editor');
    expect(sessionId()).toBe('a');
    await back();
    await waitFor(() => expect(route()).toBe('Notes'));

    await act(async () => flow().openNote('a'));
    await follow('Delta');
    putIndex([note('a', 'Alpha', { deletedAt: '2026-02-01T09:00:00.000Z' }), note('d', 'Delta')]);
    await back();
    await waitFor(() => expect(route()).toBe('Notes'));
    expect(flow().session).toBeNull();
    expect(flow().backLabel).toBeUndefined();
  });

  it('a note created from a missing link and left is saved, then A opens', async () => {
    await openFromList([note('a', 'Alpha')], 'a');
    await follow('Foo');
    expect(screen.getByText('editor-stored:false')).toBeTruthy();
    await back();
    expect(sessionId()).toBe('a');
    expect(stored().map((n) => n.body)).toEqual(['Alpha', 'Foo']);
    expect(route()).toBe('Editor');
  });

  it('B left empty (body cleared) is trashed, then A opens', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    await follow('Beta');
    await act(async () => flow().sessionActions.setBody(''));
    await back();
    expect(sessionId()).toBe('a');
    expect(stored().find((n) => n.id === 'b')?.deletedAt).toBeTruthy();
  });

  it('Delete note on B trashes it and goes to A', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    await follow('Beta');
    await act(async () => flow().deleteOpenNote());
    expect(sessionId()).toBe('a');
    expect(route()).toBe('Editor');
    expect(stored().find((n) => n.id === 'b')?.deletedAt).toBeTruthy();
    expect(flow().backLabel).toBeUndefined();
  });

  it('Leave anyway after a failed save goes to A; the failed Back itself stays on B with the trail', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    await follow('Beta');
    await press('editor-edit');
    __fs.failWhen('write', (uri) => uri.includes('notes.json'));
    await back();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(sessionId()).toBe('b');
    expect(route()).toBe('Editor');
    expect(flow().backLabel).toBe('Back to previous note');
    expect(screen.getByText('editor-locked:false')).toBeTruthy();
    await act(async () => alertButton('Leave anyway').onPress?.());
    await waitFor(() => expect(sessionId()).toBe('a'));
    expect(route()).toBe('Editor');
    expect(flow().backLabel).toBeUndefined();
  });

  it('a double Back is ignored', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta'), note('c', 'Gamma')], 'a');
    await follow('Beta');
    await follow('Gamma');
    await act(async () => {
      await Promise.all([flow().leaveEditor(), flow().leaveEditor()]);
    });
    expect(sessionId()).toBe('b');
    expect(flow().backLabel).toBe('Back to previous note');
  });

  it('retries a failed refresh once, and falls back to the list when both fail', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    await follow('Beta');
    const real = storage.listNotes;
    jest.spyOn(storage, 'listNotes').mockRejectedValueOnce(new Error('boom'));
    await back();
    expect(sessionId()).toBe('a');
    jest.spyOn(storage, 'listNotes').mockImplementation(real);

    await follow('Beta');
    jest.spyOn(storage, 'listNotes').mockRejectedValue(new Error('boom'));
    await back();
    await waitFor(() => expect(route()).toBe('Notes'));
    expect(flow().backLabel).toBeUndefined();
  });

  it('keeps at most 50 notes in the trail', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    // Bounce A -> B -> A ... 60 links: trail alternates and is capped at 50.
    for (let i = 0; i < 60; i++) await follow(i % 2 === 0 ? 'Beta' : 'Alpha');
    let backs = 0;
    while (flow().backLabel) {
      await back();
      backs++;
      expect(backs).toBeLessThanOrEqual(50);
    }
    expect(backs).toBe(50);
    expect(route()).toBe('Editor');
  });
});
