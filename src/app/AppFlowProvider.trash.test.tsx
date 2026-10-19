import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, Alert, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotesNavigator } from '../navigation/NotesNavigator';
import { EditorRoute, NotesRoute, RecentlyDeletedRoute } from '../navigation/notesRoutes';
import { resetLegacyImportForTests } from '../services/legacyImport';
import * as storage from '../services/notesStorage';
import { Note, resetCorruptCopyGuard, saveNote } from '../services/notesStorage';
import { __fs } from '../test/fakeFileSystem';
import { AppFlowProvider, TRASH_COPY, useAppFlow, type AppFlow } from './AppFlowProvider';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: {} },
}));

// The real editor page is tested on its own; here it only shows that a note is open.
jest.mock('../screens/NoteEditorWithVoice', () => {
  const { Pressable, Text: T } = jest.requireActual('react-native');
  return {
    NoteEditorWithVoice: (p: {
      session: { body: string };
      onDelete: () => void;
      onBack: () => void;
    }) => (
      <>
        <T>{`editor-body:${p.session.body}`}</T>
        <Pressable onPress={p.onDelete}>
          <T>editor-delete</T>
        </Pressable>
        <Pressable onPress={p.onBack}>
          <T>editor-back</T>
        </Pressable>
      </>
    ),
  };
});

const DOC = 'file:///document/';
const INDEX = DOC + 'notes.json';
const SETTINGS = DOC + 'settings.json';
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

const putIndex = (notes: Note[]) => __fs.put(INDEX, JSON.stringify({ version: 1, notes }));
const stored = (): Note[] => JSON.parse(__fs.read(INDEX) as string).notes;
const audio = (name: string) => DOC + 'notes/' + name;
const note = (id: string, body: string, extra: Partial<Note> = {}): Note => ({
  id,
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
  body,
  ...extra,
});
const trashed = (id: string, body: string, extra: Partial<Note> = {}): Note =>
  note(id, body, { deletedAt: '2026-02-01T09:00:00.000Z', ...extra });
const rec = (fileName: string, extra: Record<string, unknown> = {}) => ({
  fileName,
  durationMs: 1000,
  ...extra,
});
const hidden = { includeHiddenElements: true };

const lastAlert = () =>
  (Alert.alert as jest.Mock).mock.calls.at(-1) as [
    string,
    string,
    { text: string; onPress?: () => void }[],
    { onDismiss?: () => void }?,
  ];
const alertButton = (text: string) => lastAlert()[2].find((b) => b.text === text)!;
const announced = () => (AccessibilityInfo.announceForAccessibility as jest.Mock).mock.calls;

beforeEach(() => {
  __fs.reset();
  resetCorruptCopyGuard();
  resetLegacyImportForTests();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  (AccessibilityInfo.announceForAccessibility as jest.Mock).mockClear();
  (Alert.alert as jest.Mock).mockClear();
  __fs.put(SETTINGS, JSON.stringify({ autoOpenDreamCapture: false }));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const waitForList = () =>
  waitFor(() => expect(screen.getByRole('header', { name: 'All Notes' })).toBeTruthy());
/** Renders the app and opens Recently Deleted. */
async function openTrash() {
  const view = await render(app());
  await waitForList();
  await act(async () => {
    flow().navigationRef.navigate('RecentlyDeleted');
  });
  await waitFor(() =>
    expect(screen.getByRole('header', { name: 'Recently Deleted' })).toBeTruthy(),
  );
  return view;
}
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('Restore', () => {
  it('returns the note to the lists (pinned, same edit time), stays on Recently Deleted, tells the user', async () => {
    putIndex([trashed('a', 'Pinned thing #night', { pinned: true }), note('b', 'Other')]);
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Restore Pinned thing #night'));
    await waitFor(() => expect(screen.getByText('Restored "Pinned thing #night".')).toBeTruthy());
    expect(announced()).toContainEqual(['Restored']);
    // Stays on Recently Deleted; the editor was not opened; the row left the list.
    expect(screen.getByRole('header', { name: 'Recently Deleted' })).toBeTruthy();
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
    expect(screen.queryByLabelText('Restore Pinned thing #night')).toBeNull();
    // Stored: no deletedAt, still pinned, edit time unchanged.
    const a = stored().find((n) => n.id === 'a')!;
    expect(a.deletedAt).toBeUndefined();
    expect(a.pinned).toBe(true);
    expect(a.updatedAt).toBe('2026-01-02T09:00:00.000Z');
    // Views and the drawer count follow.
    expect(flow().notes.trashed).toHaveLength(0);
    expect(flow().notes.visible.map((n) => n.id)).toContain('a');
    await act(async () => flow().setView({ kind: 'pinned' }));
    expect(flow().notes.visible.map((n) => n.id)).toEqual(['a']);
    await act(async () => flow().setView({ kind: 'tag', tag: 'night' }));
    expect(flow().notes.visible.map((n) => n.id)).toEqual(['a']);
  });

  it('the notice is cleared when Recently Deleted loses focus', async () => {
    putIndex([trashed('a', 'Gone')]);
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Restore Gone'));
    await waitFor(() => expect(flow().trashNotice).toBe('Restored "Gone".'));
    await act(async () => flow().navigationRef.goBack());
    await waitFor(() => expect(flow().trashNotice).toBeNull());
  });

  it('a second tap while the first restore runs is ignored', async () => {
    putIndex([trashed('a', 'One'), trashed('b', 'Two')]);
    const real = storage.restoreNote;
    const gate = deferred<void>();
    const spy = jest.spyOn(storage, 'restoreNote').mockImplementation(async (id) => {
      await gate.promise;
      return real(id);
    });
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Restore One'));
    await fireEvent.press(screen.getByLabelText('Restore Two'));
    await act(async () => {
      await flow().restoreNote('b');
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(flow().trashBusy).toBe(true);
    await act(async () => gate.resolve());
    await waitFor(() => expect(flow().trashBusy).toBe(false));
    expect(stored().find((n) => n.id === 'b')!.deletedAt).toEqual(expect.any(String));
  });

  it('a failed restore alerts and the note stays in Recently Deleted', async () => {
    putIndex([trashed('a', 'Stuck')]);
    jest.spyOn(storage, 'restoreNote').mockRejectedValueOnce(new Error('disk'));
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Restore Stuck'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(lastAlert().slice(0, 2)).toEqual([
      TRASH_COPY.restoreFailedTitle,
      TRASH_COPY.restoreFailedMessage,
    ]);
    expect(screen.getByLabelText('Restore Stuck')).toBeTruthy();
    expect(flow().trashNotice).toBeNull();
    expect(flow().trashBusy).toBe(false);
  });
});

describe('Delete forever', () => {
  const withAudio = () => {
    __fs.put(audio('a.m4a'), 'x');
    putIndex([trashed('a', 'Dream', { recordings: [rec('a.m4a')] })]);
  };

  it('Keep and dismissing the dialog delete nothing and free the screen', async () => {
    withAudio();
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Delete Dream forever'));
    expect(lastAlert()[0]).toBe('Delete this note forever?');
    expect(lastAlert()[1]).toContain('voice notes');
    expect(flow().trashBusy).toBe(true);
    await act(async () => alertButton('Keep').onPress!());
    expect(flow().trashBusy).toBe(false);
    // Android: tapping outside the dialog.
    await fireEvent.press(screen.getByLabelText('Delete Dream forever'));
    await act(async () => lastAlert()[3]!.onDismiss!());
    expect(flow().trashBusy).toBe(false);
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(stored()).toHaveLength(1);
    expect(announced()).toHaveLength(0);
  });

  it('Delete forever removes the note and its audio and announces it', async () => {
    withAudio();
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Delete Dream forever'));
    await act(async () => alertButton('Delete forever').onPress!());
    await waitFor(() => expect(stored()).toHaveLength(0));
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    expect(announced()).toContainEqual([TRASH_COPY.deletedForeverAnnouncement]);
    await waitFor(() => expect(flow().trashBusy).toBe(false));
    expect(flow().notes.trashed).toHaveLength(0);
  });

  it('a file shared with another note survives', async () => {
    __fs.put(audio('shared.m4a'), 'x');
    putIndex([
      trashed('a', 'Dream', { recordings: [rec('shared.m4a')] }),
      note('b', 'Keeper', { recordings: [rec('shared.m4a')] }),
    ]);
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Delete Dream forever'));
    await act(async () => alertButton('Delete forever').onPress!());
    await waitFor(() => expect(stored().map((n) => n.id)).toEqual(['b']));
    expect(__fs.has(audio('shared.m4a'))).toBe(true);
  });

  it('a legacy-origin recording survives and the dialog does not promise its deletion', async () => {
    __fs.put(DOC + 'dreams/old.m4a', 'x');
    putIndex([trashed('a', 'Dream', { recordings: [rec('old.m4a', { origin: 'legacy' })] })]);
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Delete Dream forever'));
    expect(lastAlert()[1]).not.toContain('voice notes');
    await act(async () => alertButton('Delete forever').onPress!());
    await waitFor(() => expect(stored()).toHaveLength(0));
    expect(__fs.has(DOC + 'dreams/old.m4a')).toBe(true);
  });

  it('a failed delete alerts and the note and its audio stay listed', async () => {
    withAudio();
    __fs.failWhen('delete', (uri) => uri.endsWith('a.m4a'));
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Delete Dream forever'));
    await act(async () => alertButton('Delete forever').onPress!());
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    expect(lastAlert().slice(0, 2)).toEqual([
      TRASH_COPY.deleteForeverFailedTitle,
      TRASH_COPY.deleteForeverFailedMessage,
    ]);
    expect(stored()).toHaveLength(1);
    expect(__fs.has(audio('a.m4a'))).toBe(true);
    expect(screen.getByLabelText('Delete Dream forever')).toBeTruthy();
    expect(flow().trashBusy).toBe(false);
  });

  it('a second request while the dialog is open is ignored', async () => {
    putIndex([trashed('a', 'One'), trashed('b', 'Two')]);
    await openTrash();
    await act(async () => flow().requestDeleteForever('a'));
    await act(async () => flow().requestDeleteForever('b'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
});

describe('Empty Recently Deleted', () => {
  it('Keep deletes nothing; Empty deletes every trashed note and audio, not live notes', async () => {
    __fs.put(audio('a.m4a'), 'x');
    __fs.put(audio('c.m4a'), 'x');
    putIndex([
      trashed('a', 'One', { recordings: [rec('a.m4a')] }),
      trashed('b', 'Two'),
      note('c', 'Live', { recordings: [rec('c.m4a')] }),
    ]);
    await openTrash();
    await fireEvent.press(screen.getByLabelText('Empty Recently Deleted'));
    expect(lastAlert()[0]).toBe('Empty Recently Deleted?');
    expect(lastAlert()[1]).toBe(
      "2 notes will be permanently deleted, along with their voice notes. This can't be undone.",
    );
    await act(async () => alertButton('Keep').onPress!());
    expect(stored()).toHaveLength(3);
    expect(__fs.has(audio('a.m4a'))).toBe(true);

    await fireEvent.press(screen.getByLabelText('Empty Recently Deleted'));
    await act(async () => alertButton('Empty').onPress!());
    await waitFor(() => expect(stored().map((n) => n.id)).toEqual(['c']));
    expect(__fs.has(audio('a.m4a'))).toBe(false);
    expect(__fs.has(audio('c.m4a'))).toBe(true);
    expect(announced()).toContainEqual([TRASH_COPY.emptiedAnnouncement]);
  });

  it('the voice-note clause follows "any trashed note has deletable audio" (mixed trash)', async () => {
    __fs.put(DOC + 'dreams/old.m4a', 'x');
    __fs.put(audio('a.m4a'), 'x');
    putIndex([
      trashed('legacy', 'Legacy only', { recordings: [rec('old.m4a', { origin: 'legacy' })] }),
      trashed('with', 'With audio', { recordings: [rec('a.m4a')] }),
    ]);
    await openTrash();
    await act(async () => flow().requestEmptyTrash());
    expect(lastAlert()[1]).toContain('along with their voice notes');
    await act(async () => alertButton('Keep').onPress!());
    // Only the legacy-only note is left: no clause.
    putIndex([
      trashed('legacy', 'Legacy only', { recordings: [rec('old.m4a', { origin: 'legacy' })] }),
    ]);
    await act(async () => flow().notes.refresh());
    await act(async () => flow().requestEmptyTrash());
    expect(lastAlert()[1]).toBe("1 note will be permanently deleted. This can't be undone.");
    await act(async () => alertButton('Empty').onPress!());
    await waitFor(() => expect(stored()).toHaveLength(0));
    expect(__fs.has(DOC + 'dreams/old.m4a')).toBe(true);
  });

  it('a failure part-way leaves the remaining notes and alerts', async () => {
    __fs.put(audio('a.m4a'), 'x');
    __fs.put(audio('b.m4a'), 'x');
    putIndex([
      trashed('a', 'One', { deletedAt: '2026-03-01T09:00:00.000Z', recordings: [rec('a.m4a')] }),
      trashed('b', 'Two', { deletedAt: '2026-02-01T09:00:00.000Z', recordings: [rec('b.m4a')] }),
    ]);
    __fs.failWhen('delete', (uri) => uri.endsWith('b.m4a'));
    await openTrash();
    await act(async () => flow().requestEmptyTrash());
    await act(async () => alertButton('Empty').onPress!());
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    expect(lastAlert().slice(0, 2)).toEqual([
      TRASH_COPY.emptyFailedTitle,
      TRASH_COPY.emptyFailedMessage,
    ]);
    expect(stored().map((n) => n.id)).toEqual(['b']);
    expect(__fs.has(audio('b.m4a'))).toBe(true);
    await waitFor(() => expect(flow().notes.trashed.map((n) => n.id)).toEqual(['b']));
    expect(flow().trashBusy).toBe(false);
  });

  it('an empty Recently Deleted ignores the request', async () => {
    putIndex([note('a', 'Live')]);
    await openTrash();
    await act(async () => flow().requestEmptyTrash());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(flow().trashBusy).toBe(false);
  });
});

describe('row swipe actions', () => {
  it('Pin and Unpin go through the provider; order does not change; the Pinned view follows', async () => {
    putIndex([note('a', 'Newest', { updatedAt: '2026-01-03T09:00:00.000Z' }), note('b', 'Older')]);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getAllByLabelText('Pin note', hidden)[1]);
    await waitFor(() => expect(stored().find((n) => n.id === 'b')!.pinned).toBe(true));
    expect(announced()).toContainEqual([TRASH_COPY.pinned]);
    expect(flow().notes.visible.map((n) => n.id)).toEqual(['a', 'b']);
    await act(async () => flow().setView({ kind: 'pinned' }));
    expect(flow().notes.visible.map((n) => n.id)).toEqual(['b']);
    await waitFor(() => expect(flow().trashBusy).toBe(false));
    await fireEvent.press(screen.getByLabelText('Unpin note', hidden));
    await waitFor(() => expect(stored().find((n) => n.id === 'b')!.pinned).toBeFalsy());
    expect(announced()).toContainEqual([TRASH_COPY.unpinned]);
  });

  it('a failed pin alerts and changes nothing', async () => {
    putIndex([note('a', 'Newest')]);
    jest.spyOn(storage, 'setPinned').mockRejectedValueOnce(new Error('disk'));
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText('Pin note', hidden));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(lastAlert().slice(0, 2)).toEqual([
      TRASH_COPY.pinFailedTitle,
      TRASH_COPY.pinFailedMessage,
    ]);
    expect(stored()[0].pinned).toBeFalsy();
  });

  it('Delete moves the note to Recently Deleted with no confirm, announces it, and the count rises', async () => {
    putIndex([note('a', 'One'), note('b', 'Two')]);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getAllByLabelText('Delete note', hidden)[0]);
    await waitFor(() => expect(flow().notes.trashed).toHaveLength(1));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(announced()).toContainEqual(['Moved to Recently Deleted']);
    expect(stored().filter((n) => n.deletedAt)).toHaveLength(1);
    await waitFor(() => expect(flow().trashBusy).toBe(false));
  });

  it('a failed Delete alerts and the note stays', async () => {
    putIndex([note('a', 'One')]);
    jest.spyOn(storage, 'softDeleteNote').mockRejectedValueOnce(new Error('disk'));
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText('Delete note', hidden));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(lastAlert().slice(0, 2)).toEqual(["Couldn't delete this note.", 'Nothing was changed.']);
    expect(stored()[0].deletedAt).toBeUndefined();
  });

  it('deleting the only note written today does not reopen a launch note on the next cold start', async () => {
    __fs.put(SETTINGS, JSON.stringify({ autoOpenDreamCapture: true }));
    await saveNote({ id: 'a', body: 'today only' });
    const first = await render(app());
    await waitForList();
    await act(async () => {
      await flow().trashNote('a');
    });
    expect(flow().notes.trashed).toHaveLength(1);
    await first.unmount();
    await render(app());
    await waitForList();
    expect(screen.queryByText(/^editor-body:/)).toBeNull();
  });

  it('deleting the last note of the selected tag falls back to All Notes', async () => {
    putIndex([note('a', 'Only #night'), note('b', 'Plain')]);
    await render(app());
    await waitForList();
    await act(async () => flow().setView({ kind: 'tag', tag: 'night' }));
    await act(async () => {
      await flow().trashNote('a');
    });
    await waitFor(() => expect(flow().view).toEqual({ kind: 'all' }));
  });

  it('ignores pin and delete while a note is open', async () => {
    putIndex([note('a', 'One'), note('b', 'Two')]);
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText(/One/));
    await waitFor(() => expect(screen.getByText('editor-body:One')).toBeTruthy());
    await act(async () => {
      await flow().pinNote('b', true);
      await flow().trashNote('b');
    });
    expect(stored().find((n) => n.id === 'b')).toEqual(note('b', 'Two'));
  });

  it('ignores them while a leave or delete is running', async () => {
    putIndex([note('a', 'One'), note('b', 'Two')]);
    const gate = deferred<void>();
    const real = storage.softDeleteNote;
    const spy = jest.spyOn(storage, 'softDeleteNote').mockImplementation(async (id) => {
      await gate.promise;
      return real(id);
    });
    await render(app());
    await waitForList();
    await fireEvent.press(screen.getByLabelText(/One/));
    await waitFor(() => expect(screen.getByText('editor-body:One')).toBeTruthy());
    await fireEvent.press(screen.getByText('editor-delete'));
    await act(async () => {
      await flow().trashNote('b');
      await flow().pinNote('b', true);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(stored().find((n) => n.id === 'b')).toEqual(note('b', 'Two'));
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.queryByText(/^editor-body:/)).toBeNull());
  });

  it('ignores them while the index is unreadable', async () => {
    __fs.put(INDEX, 'not json {');
    const before = __fs.read(INDEX);
    await render(app());
    await waitFor(() => expect(flow().notes.indexStatus).toBe('unreadable'));
    await act(async () => {
      await flow().pinNote('a', true);
      await flow().trashNote('a');
      await flow().restoreNote('a');
    });
    expect(__fs.read(INDEX)).toBe(before);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('the list rows are inert while a trash action runs', async () => {
    putIndex([trashed('a', 'Gone'), note('b', 'Live')]);
    await render(app());
    await waitForList();
    await act(async () => flow().requestDeleteForever('a'));
    expect(flow().trashBusy).toBe(true);
    const spy = jest.spyOn(storage, 'softDeleteNote');
    await fireEvent.press(screen.getByLabelText('Delete note', hidden));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('lifecycle', () => {
  it('no state update or Alert after unmount, and no timers of its own', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    putIndex([trashed('a', 'Gone')]);
    const gate = deferred<void>();
    jest.spyOn(storage, 'restoreNote').mockImplementation(async () => {
      await gate.promise;
      throw new Error('late');
    });
    const view = await openTrash();
    await fireEvent.press(screen.getByLabelText('Restore Gone'));
    await view.unmount();
    await act(async () => gate.resolve());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(errors).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(announced()).toHaveLength(0);
  });

  it('a confirm followed by unmount does not announce or alert', async () => {
    putIndex([trashed('a', 'Gone')]);
    const view = await openTrash();
    await act(async () => flow().requestDeleteForever('a'));
    const confirm = alertButton('Delete forever').onPress!;
    await view.unmount();
    await act(async () => confirm());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(announced()).toHaveLength(0);
  });

  it('the actions arm no timers of their own', async () => {
    jest.useFakeTimers();
    putIndex([trashed('a', 'Gone'), note('b', 'Live')]);
    await render(app());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
    // Any timer armed while the actions run, with the call stack that armed it.
    const armed: string[] = [];
    const wrap = <K extends 'setTimeout' | 'setInterval'>(name: K) => {
      const original = globalThis[name];
      jest.spyOn(globalThis, name).mockImplementation(((...args: unknown[]) => {
        armed.push(new Error().stack ?? '');
        return (original as (...a: unknown[]) => unknown)(...args);
      }) as never);
    };
    wrap('setTimeout');
    wrap('setInterval');
    await act(async () => {
      await flow().restoreNote('a');
      await flow().pinNote('a', true);
      await flow().trashNote('a');
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(stored().find((n) => n.id === 'a')!.deletedAt).toEqual(expect.any(String));
    const mine = armed.filter((stack) =>
      /AppFlowProvider\.tsx|useNotes\.ts|confirmForever/.test(stack),
    );
    expect(mine).toEqual([]);
  });
});
