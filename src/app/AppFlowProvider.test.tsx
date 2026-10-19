import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, Alert, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotesNavigator } from '../navigation/NotesNavigator';
import {
  EditorRoute,
  NotesRoute,
  RecentlyDeletedRoute,
  SearchRoute,
} from '../navigation/notesRoutes';
import * as legacy from '../services/legacyImport';
import { resetLegacyImportForTests } from '../services/legacyImport';
import * as storage from '../services/notesStorage';
import {
  Note,
  listNotes,
  resetCorruptCopyGuard,
  saveNote,
  softDeleteNote,
} from '../services/notesStorage';
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

// The real editor page is tested on its own; here it is a stub that exposes what the provider and
// the route hand it, and calls back like the page would.
const mockConfirmLeave = jest.fn();
jest.mock('../screens/NoteEditorWithVoice', () => {
  const { Pressable, Text: T } = jest.requireActual('react-native');
  const press = (label: string, onPress?: () => void) => (
    <Pressable onPress={onPress}>
      <T>{label}</T>
    </Pressable>
  );
  return {
    NoteEditorWithVoice: (p: {
      session: { body: string; stored: boolean; pinned: boolean };
      actions: { setBody: (t: string) => void };
      locked: boolean;
      autoFocus: boolean;
      banner?: { kind: string; onRetry?: () => void; onLeave?: () => void };
      onBack: () => void;
      onTogglePin: () => void;
      onDelete: () => void;
      onRecordingChange: (r: boolean) => void;
      onRecordingDiscarded: () => void;
      leaveRef: { current: (() => void) | null };
    }) => (
      <>
        <T>{`editor-body:${p.session.body}`}</T>
        <T>{`editor-stored:${p.session.stored}`}</T>
        <T>{`editor-pinned:${p.session.pinned}`}</T>
        <T>{`editor-locked:${p.locked}`}</T>
        <T>{`editor-autofocus:${p.autoFocus}`}</T>
        <T>{`editor-banner:${p.banner?.kind ?? 'none'}`}</T>
        <T>{`editor-banner-actions:${!!p.banner?.onRetry && !!p.banner?.onLeave}`}</T>
        {press('editor-back', p.onBack)}
        {press('editor-pin', p.onTogglePin)}
        {press('editor-delete', p.onDelete)}
        {press('editor-type', () => p.actions.setBody('hello #night'))}
        {press('editor-banner-retry', p.banner?.onRetry)}
        {press('editor-banner-leave', p.banner?.onLeave)}
        {press('editor-record', () => {
          p.leaveRef.current = mockConfirmLeave;
          p.onRecordingChange(true);
        })}
        {press('editor-discard', () => {
          p.onRecordingChange(false);
          p.onRecordingDiscarded();
        })}
      </>
    ),
  };
});

const DOC = 'file:///document/';
const INDEX = DOC + 'notes.json';
const SETTINGS = DOC + 'settings.json';
const DAY_MARKER = DOC + 'no-dream.json';
const SOURCE = DOC + 'dreams.json';
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};

const SettingsStub = () => <Text>settings-page</Text>;
const probe: { current: AppFlow | null } = { current: null };
/** The latest flow value, as the routes see it. */
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
      search={SearchRoute}
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
const putIndex = (notes: Note[]) => __fs.put(INDEX, JSON.stringify({ version: 1, notes }));
const stored = (): Note[] => JSON.parse(__fs.read(INDEX) as string).notes;
const oldNote = (id: string, body: string, extra: Partial<Note> = {}): Note => ({
  id,
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
  body,
  ...extra,
});
const autoOpen = (value: boolean) =>
  __fs.put(SETTINGS, JSON.stringify({ autoOpenDreamCapture: value }));
const dream = (extra: Record<string, unknown> = {}) => ({
  id: '1760000000000',
  createdAt: '2026-10-01T08:00:00.000Z',
  status: 'finished',
  journalId: 'dreams',
  ...extra,
});

const press = (label: string) => fireEvent.press(screen.getByText(label));
const alertButton = (text: string) => {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  const button = (call?.[2] as { text: string; onPress?: () => void }[]).find(
    (b) => b.text === text,
  );
  return button!;
};

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  resetLegacyImportForTests();
  mockConfirmLeave.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  (AccessibilityInfo.announceForAccessibility as jest.Mock).mockClear();
  (Alert.alert as jest.Mock).mockClear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const onList = () => screen.getByRole('header', { name: 'All Notes' });
const waitForList = () => waitFor(() => expect(onList()).toBeTruthy());
const waitForEditor = () => waitFor(() => expect(screen.getByText(/^editor-body:/)).toBeTruthy());

describe('launch', () => {
  it('a cold start with nothing written today opens a new launch note over the list', async () => {
    await render(app());
    await waitForEditor();
    expect(screen.getByText('editor-body:')).toBeTruthy();
    expect(screen.getByText('editor-autofocus:true')).toBeTruthy();
    expect(
      screen.getByRole('header', { name: 'All Notes', includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('does not open a note when one was written today', async () => {
    await saveNote({ id: 'a', body: 'earlier today' });
    await render(app());
    await waitForList();
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
    expect(screen.getByText('earlier today')).toBeTruthy();
  });

  it('does not open a note when today only has a note in Recently Deleted', async () => {
    await saveNote({ id: 'a', body: 'gone' });
    await softDeleteNote('a');
    await render(app());
    await waitForList();
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
  });

  it('does not open a note when the day marker says today is done', async () => {
    __fs.put(DAY_MARKER, JSON.stringify({ noDreamDate: today() }));
    await render(app());
    await waitForList();
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
  });

  it('does not open a note when the setting is off', async () => {
    autoOpen(false);
    await render(app());
    await waitForList();
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
  });

  it('does not open a note when the index is unreadable, and says so on the list', async () => {
    __fs.put(INDEX, '{ not json');
    await render(app());
    await waitForList();
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
    expect(screen.getByText('Your notes could not be read. Nothing was changed.')).toBeTruthy();
    expect(screen.getByLabelText('New note').props.accessibilityState?.disabled).toBe(true);
  });

  it('the cap opens a note when the stores are slow, and late data does not move the user', async () => {
    jest.useFakeTimers();
    await saveNote({ id: 'a', body: 'earlier today' });
    let release!: (notes: Note[]) => void;
    const real = storage.listNotes;
    jest.spyOn(storage, 'listNotes').mockImplementation(
      () =>
        new Promise<Note[]>((resolve) => {
          release = (notes) => resolve(notes);
        }) as ReturnType<typeof real>,
    );
    await render(app());
    expect(screen.getByText('gate')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(999);
    });
    expect(screen.getByText('gate')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('editor-body:')).toBeTruthy();
    // The data arrives: a note exists today, but the user stays on the note they were given.
    await act(async () => {
      release(await real());
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText('editor-body:')).toBeTruthy();
    expect(flow().notes.all.map((n) => n.id)).toEqual(['a']);
  });

  it('the launch waits for the earlier-notes import to settle', async () => {
    jest.useFakeTimers();
    let finish!: (r: legacy.MigrationResult) => void;
    jest.spyOn(legacy, 'migrateLegacyDreams').mockImplementation(
      () =>
        new Promise<legacy.MigrationResult>((resolve) => {
          finish = resolve;
        }),
    );
    await render(app());
    // Everything else has loaded, but the import is still running: nothing is decided yet.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByText('gate')).toBeTruthy();
    await act(async () => {
      finish({ status: 'already-done' });
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText('editor-body:')).toBeTruthy();
  });

  it('the cap timer is cleared when the provider unmounts before it fires', async () => {
    jest.useFakeTimers();
    const real = storage.listNotes;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(storage, 'listNotes').mockImplementation(async () => {
      await gate;
      return real();
    });
    // Watch the 1 s cap timer by wrapping the (fake) timer functions by hand.
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    const capIds: unknown[] = [];
    const cleared: unknown[] = [];
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      const id = realSet(fn, ms);
      if (ms === 1000) capIds.push(id);
      return id;
    }) as typeof globalThis.setTimeout;
    globalThis.clearTimeout = ((id: never) => {
      cleared.push(id);
      realClear(id);
    }) as typeof globalThis.clearTimeout;
    try {
      const view = await render(app());
      expect(capIds).toHaveLength(1);
      expect(cleared).not.toContain(capIds[0]);
      await act(async () => view.unmount());
      expect(cleared).toContain(capIds[0]);
    } finally {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    }
    release();
  });

  it('the cap does not fire after the launch was decided by the rule', async () => {
    jest.useFakeTimers();
    autoOpen(false);
    await render(app());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByRole('header', { name: 'All Notes' })).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
  });
});

describe('leaving the editor', () => {
  it('backing out of an empty launch note writes the day marker and lands on the list', async () => {
    await render(app());
    await waitForEditor();
    await press('editor-back');
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(onList()).toBeTruthy();
    await waitFor(() =>
      expect(JSON.parse(__fs.read(DAY_MARKER) as string)).toEqual({ noDreamDate: today() }),
    );
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('leaving a launch note that has content marks the day through onCreated and saves it', async () => {
    await render(app());
    await waitForEditor();
    await press('editor-type');
    await press('editor-back');
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(stored().map((n) => n.body)).toEqual(['hello #night']);
    await waitFor(() =>
      expect(JSON.parse(__fs.read(DAY_MARKER) as string)).toEqual({ noDreamDate: today() }),
    );
    expect(screen.getByText('hello #night')).toBeTruthy();
  });

  it('a note started with the + button and left empty marks nothing', async () => {
    autoOpen(false);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText('New note'));
    await waitForEditor();
    await press('editor-back');
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(__fs.has(DAY_MARKER)).toBe(false);
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('a failed save shows the alert and stays; "Keep editing" keeps the text, "Leave anyway" leaves', async () => {
    autoOpen(false);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText('New note'));
    await waitForEditor();
    await press('editor-type');
    __fs.failWhen('write', (uri) => uri.includes('notes.json'));
    await press('editor-back');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Couldn't save your note",
      'Your text is still on screen. You can try again, or leave and lose what you wrote since the last save.',
      [
        expect.objectContaining({ text: 'Keep editing' }),
        expect.objectContaining({ text: 'Leave anyway', style: 'destructive' }),
      ],
    );
    // Still on the note, unlocked, text intact, error banner up.
    expect(screen.getByText('editor-body:hello #night')).toBeTruthy();
    expect(screen.getByText('editor-locked:false')).toBeTruthy();
    expect(screen.getByText('editor-banner:saveError')).toBeTruthy();
    await act(async () => alertButton('Keep editing').onPress?.());
    expect(screen.getByText('editor-body:hello #night')).toBeTruthy();

    await press('editor-back');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    await act(async () => alertButton('Leave anyway').onPress?.());
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(__fs.has(INDEX)).toBe(false);
  });

  it('a second leave while one runs is ignored', async () => {
    autoOpen(false);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText('New note'));
    await waitForEditor();
    await press('editor-type');
    await act(async () => {
      void flow().leaveEditor();
      void flow().leaveEditor();
    });
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(stored()).toHaveLength(1);
  });

  it('with a recording open, back runs the recording confirm instead of leaving; Discard then leaves', async () => {
    autoOpen(false);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText('New note'));
    await waitForEditor();
    await press('editor-record');
    await press('editor-back');
    expect(mockConfirmLeave).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/^editor-body:/)).toBeTruthy();
    await press('editor-discard');
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
  });

  it('announces "Moved to Recently Deleted" when a stored note is left blank', async () => {
    autoOpen(false);
    putIndex([oldNote('b', 'to be blanked')]);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText(/to be blanked/));
    await waitForEditor();
    await act(async () => flow().sessionActions.setBody(''));
    await press('editor-back');
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Moved to Recently Deleted',
    );
    expect(stored()[0].deletedAt).toEqual(expect.any(String));
  });

  it('a note with content does not announce', async () => {
    autoOpen(false);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText('New note'));
    await waitForEditor();
    await press('editor-type');
    await press('editor-back');
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });
});

describe('opening notes', () => {
  it('opens a stored note without focusing the keyboard', async () => {
    autoOpen(false);
    putIndex([oldNote('a', 'first note')]);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText(/first note/));
    await waitForEditor();
    expect(screen.getByText('editor-body:first note')).toBeTruthy();
    expect(screen.getByText('editor-autofocus:false')).toBeTruthy();
  });

  it('open returning false (the note is in Recently Deleted) stays on the list, refreshes and alerts', async () => {
    autoOpen(false);
    putIndex([
      oldNote('a', 'first note'),
      oldNote('t', 'trashed note', { deletedAt: '2026-01-03T09:00:00.000Z' }),
    ]);
    await render(app());
    await waitForList();
    await act(async () => flow().openNote('t'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('This note is in Recently Deleted.');
    expect(alertButton('OK')).toBeTruthy();
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
    expect(flow().session).toBeNull();
    expect(onList()).toBeTruthy();
  });

  it('the + button is ignored while the editor is open', async () => {
    await render(app());
    await waitForEditor();
    const id = flow().session?.id;
    await act(async () => flow().openNewNote());
    expect(flow().session?.id).toBe(id);
  });
});

describe('view', () => {
  it('keeps the view across opening and closing a note', async () => {
    autoOpen(false);
    putIndex([oldNote('a', 'one #alpha'), oldNote('b', 'two')]);
    await render(app());
    await waitForList();
    await act(async () => flow().setView({ kind: 'tag', tag: 'alpha' }));
    await waitFor(() => expect(screen.getByRole('header', { name: '#alpha' })).toBeTruthy());
    await fireEvent.press(screen.getByLabelText(/one/));
    await waitForEditor();
    await press('editor-back');
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(screen.getByRole('header', { name: '#alpha' })).toBeTruthy();
    expect(flow().view).toEqual({ kind: 'tag', tag: 'alpha' });
  });

  it('a selected tag that no longer exists falls back to All Notes once the editor is closed', async () => {
    autoOpen(false);
    putIndex([oldNote('a', 'one #alpha')]);
    await render(app());
    await waitForList();
    await act(async () => flow().setView({ kind: 'tag', tag: 'alpha' }));
    await fireEvent.press(screen.getByLabelText(/one/));
    await waitForEditor();
    await act(async () => flow().sessionActions.setBody('one'));
    // Still on the tag view while the editor is open.
    expect(flow().view).toEqual({ kind: 'tag', tag: 'alpha' });
    await press('editor-back');
    await waitFor(() => expect(flow().view).toEqual({ kind: 'all' }));
    expect(screen.getByRole('header', { name: 'All Notes' })).toBeTruthy();
  });

  it('never takes the Recently Deleted view', async () => {
    autoOpen(false);
    await render(app());
    await waitForList();
    await act(async () => flow().setView({ kind: 'trash' }));
    expect(flow().view).toEqual({ kind: 'all' });
  });
});

describe('banners', () => {
  it('a note trashed elsewhere shows the in-trash banner with both actions; Leave leaves', async () => {
    autoOpen(false);
    putIndex([oldNote('a', 'first note')]);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText(/first note/));
    await waitForEditor();
    await softDeleteNote('a');
    await act(async () => {
      flow().sessionActions.setBody('first note edited');
      await flow().sessionActions.flush();
    });
    await waitFor(() => expect(screen.getByText('editor-banner:inTrash')).toBeTruthy());
    expect(screen.getByText('editor-banner-actions:true')).toBeTruthy();
    await press('editor-banner-leave');
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('a save error shows the save-error banner and Try again flushes', async () => {
    autoOpen(false);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText('New note'));
    await waitForEditor();
    await press('editor-type');
    __fs.failNext('write');
    await act(async () => {
      await flow().sessionActions.flush();
    });
    await waitFor(() => expect(screen.getByText('editor-banner:saveError')).toBeTruthy());
    await press('editor-banner-retry');
    await waitFor(() => expect(screen.getByText('editor-banner:none')).toBeTruthy());
    expect(stored()[0].body).toBe('hello #night');
  });

  it('an unreadable index under an open note shows the unreadable banner', async () => {
    autoOpen(false);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText('New note'));
    await waitForEditor();
    await press('editor-type');
    __fs.put(INDEX, '{ not json');
    await act(async () => {
      await flow().sessionActions.flush();
    });
    await waitFor(() => expect(screen.getByText('editor-banner:unreadable')).toBeTruthy());
  });
});

describe('menu actions', () => {
  it('Delete moves the open note to Recently Deleted, announces it and returns to the list without a prompt', async () => {
    autoOpen(false);
    putIndex([oldNote('a', 'first note')]);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText(/first note/));
    await waitForEditor();
    await press('editor-delete');
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Moved to Recently Deleted',
    );
    expect(stored()[0].deletedAt).toEqual(expect.any(String));
    await waitFor(() => expect(screen.queryByLabelText(/first note/)).toBeNull());
  });

  it('a failed Delete stays on the note, unlocks it and says nothing was changed', async () => {
    autoOpen(false);
    putIndex([oldNote('a', 'first note')]);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText(/first note/));
    await waitForEditor();
    jest.spyOn(storage, 'softDeleteNote').mockRejectedValueOnce(new Error('disk'));
    await press('editor-delete');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't delete this note.", 'Nothing was changed.', [
      expect.objectContaining({ text: 'OK' }),
    ]);
    expect(screen.getByText('editor-body:first note')).toBeTruthy();
    expect(screen.getByText('editor-locked:false')).toBeTruthy();
    expect(stored()[0].deletedAt).toBeUndefined();
  });

  it('Pin pins the stored note; a failed pin shows the save-error banner', async () => {
    autoOpen(false);
    putIndex([oldNote('a', 'first note')]);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText(/first note/));
    await waitForEditor();
    await press('editor-pin');
    await waitFor(() => expect(screen.getByText('editor-pinned:true')).toBeTruthy());
    expect(stored()[0].pinned).toBe(true);

    // Unpinning fails: the note stays pinned and the save-error banner shows.
    __fs.failNext('write');
    await press('editor-pin');
    await waitFor(() => expect(screen.getByText('editor-banner:saveError')).toBeTruthy());
    expect(screen.getByText('editor-pinned:true')).toBeTruthy();
    expect(stored()[0].pinned).toBe(true);
    // Try again repeats the unpin that failed (the session has nothing else to save).
    await press('editor-banner-retry');
    await waitFor(() => expect(screen.getByText('editor-pinned:false')).toBeTruthy());
    expect(stored()[0].pinned).toBeFalsy();
    // The retry worked, so the save-error banner is gone.
    await waitFor(() => expect(screen.getByText('editor-banner:none')).toBeTruthy());
  });
});

describe('importing earlier notes', () => {
  it('brings legacy dreams into the list, tells the user, and a second launch imports nothing', async () => {
    autoOpen(false);
    __fs.put(SOURCE, JSON.stringify([dream({ transcript: 'Flying over the sea' })]));
    const first = await render(app());
    await waitForList();
    await waitFor(() =>
      expect(screen.getByText('Flying over the sea', { exact: false })).toBeTruthy(),
    );
    expect(screen.getByText('1 earlier note was brought in.')).toBeTruthy();
    // Dismiss hides it for the session.
    await fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('1 earlier note was brought in.')).toBeNull();

    await first.unmount();
    resetLegacyImportForTests();
    const before = __fs.read(INDEX);
    await render(app());
    await waitForList();
    await waitFor(() =>
      expect(screen.getByText('Flying over the sea', { exact: false })).toBeTruthy(),
    );
    expect(screen.queryByText(/earlier note/)).toBeNull();
    expect(__fs.read(INDEX)).toBe(before);
  });

  it('an unreadable earlier file gives the info line on every launch and changes nothing', async () => {
    autoOpen(false);
    __fs.put(SOURCE, '{{{ not json');
    await render(app());
    await waitForList();
    await waitFor(() =>
      expect(
        screen.getByText(
          'Your earlier notes could not be read, so they were not brought in. Nothing was changed.',
        ),
      ).toBeTruthy(),
    );
    expect(__fs.has(INDEX)).toBe(false);
    expect(__fs.read(SOURCE)).toBe('{{{ not json');
  });

  it('a failed import offers Try again, which retries once and shows the working line meanwhile', async () => {
    autoOpen(false);
    let finish!: (r: legacy.MigrationResult) => void;
    const spy = jest
      .spyOn(legacy, 'migrateLegacyDreams')
      .mockResolvedValueOnce({ status: 'failed' })
      .mockImplementationOnce(
        () =>
          new Promise<legacy.MigrationResult>((resolve) => {
            finish = resolve;
          }),
      );
    await render(app());
    await waitForList();
    await waitFor(() =>
      expect(
        screen.getByText("Couldn't bring in your earlier notes. They are still on your phone."),
      ).toBeTruthy(),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Bringing in your earlier notes...')).toBeTruthy();
    expect(screen.queryByLabelText('Try again')).toBeNull();
    await act(async () => finish({ status: 'already-done' }));
    await waitFor(() => expect(screen.queryByText('Bringing in your earlier notes...')).toBeNull());
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('the import running while the launch note autosaves: both end up in the index', async () => {
    jest.useFakeTimers();
    __fs.put(SOURCE, JSON.stringify([dream({ transcript: 'Flying over the sea' })]));
    const realMigrate = jest.requireActual('../services/legacyImport').migrateLegacyDreams;
    let start!: () => void;
    const gate = new Promise<void>((resolve) => {
      start = resolve;
    });
    jest.spyOn(legacy, 'migrateLegacyDreams').mockImplementation(async () => {
      await gate;
      return realMigrate();
    });
    await render(app());
    // The import is still pending: the cap opens a note.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('editor-body:')).toBeTruthy();
    await fireEvent.press(screen.getByText('editor-type'));
    await act(async () => {
      start();
      await flow().sessionActions.flush();
      await jest.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    const bodies = stored().map((n) => n.body);
    expect(bodies).toHaveLength(2);
    expect(bodies).toContain('hello #night');
    expect(bodies.some((b) => b.includes('Flying over the sea'))).toBe(true);
    await waitFor(() => expect(flow().notes.all).toHaveLength(2));
  });
});

describe('lifecycle', () => {
  it('leaves no timers of its own once the note is left', async () => {
    jest.useFakeTimers();
    autoOpen(false);
    await render(app());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    // The list's own clock is the only timer on the list.
    const onTheList = jest.getTimerCount();
    await fireEvent.press(screen.getByLabelText('New note'));
    await fireEvent.press(screen.getByText('editor-type'));
    await fireEvent.press(screen.getByText('editor-back'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
    // Nothing of the autosave (1 s debounce, 10 s max wait) or the launch cap is left armed.
    expect(jest.getTimerCount()).toBe(onTheList);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(11_000);
    });
    expect(stored()).toHaveLength(1);
    expect(jest.getTimerCount()).toBeLessThanOrEqual(onTheList);
  });

  it('does not update state after unmount', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    autoOpen(false);
    putIndex([oldNote('a', 'first note')]);
    const view = await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText(/first note/));
    await waitForEditor();
    await act(async () => {
      void flow().leaveEditor();
      view.unmount();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(errors).not.toHaveBeenCalled();
    expect((await listNotes()).map((n) => n.id)).toEqual(['a']);
  });
});
