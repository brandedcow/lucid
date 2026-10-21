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
import { AppFlowProvider, useAppFlow, type AppFlow } from './AppFlowProvider';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: {} },
}));

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

describe('followNoteLink', () => {
  it('opens an existing note in place, saving the previous note first', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta\n\nbeta body')], 'a');
    await press('editor-edit');
    const before = flow().session?.id;
    await follow('Beta');
    expect(route()).toBe('Editor');
    expect(flow().session?.id).toBe('b');
    expect(flow().session?.id).not.toBe(before);
    expect(screen.getByText('editor-body:Beta\n\nbeta body')).toBeTruthy();
    expect(screen.getByText('editor-locked:false')).toBeTruthy();
    expect(stored().find((n) => n.id === 'a')?.body).toBe('Alpha edited');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Opened "Beta"');
  });

  it('creates a missing note with the cleaned title, unsaved, and finds it the next time', async () => {
    await openFromList([note('a', 'Alpha')], 'a');
    await follow('**Foo**');
    expect(route()).toBe('Editor');
    expect(screen.getByText('editor-body:Foo')).toBeTruthy();
    expect(screen.getByText('editor-stored:false')).toBeTruthy();
    expect(stored().map((n) => n.body)).toEqual(['Alpha']);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Created "Foo"');

    await press('editor-back');
    await waitFor(() => expect(route()).toBe('Notes'));
    expect(stored().map((n) => n.body)).toContain('Foo');
    const fooId = stored().find((n) => n.body === 'Foo')!.id;

    await act(async () => flow().openNote('a'));
    await waitFor(() => expect(screen.getByText('editor-body:Alpha')).toBeTruthy());
    await follow('Foo');
    expect(flow().session?.id).toBe(fooId);
    expect(screen.getByText('editor-stored:true')).toBeTruthy();
    expect(stored().filter((n) => n.body === 'Foo')).toHaveLength(1);
  });

  it('with duplicate titles the newest edit wins', async () => {
    await openFromList(
      [
        note('a', 'Alpha'),
        note('d1', 'Twin\n\nolder', { updatedAt: '2026-02-01T09:00:00.000Z' }),
        note('d2', 'Twin\n\nnewer', { updatedAt: '2026-03-01T09:00:00.000Z' }),
      ],
      'a',
    );
    await follow('Twin');
    expect(flow().session?.id).toBe('d2');
  });

  it('a link to the open note and an untitled link are no-ops that stay unlocked', async () => {
    await openFromList([note('a', 'Alpha')], 'a');
    await press('editor-edit');
    const save = jest.spyOn(storage, 'saveNote');
    await follow('Alpha edited');
    await follow('#x');
    await follow('   ');
    expect(save).not.toHaveBeenCalled();
    expect(stored()[0].body).toBe('Alpha');
    expect(flow().session?.id).toBe('a');
    expect(screen.getByText('editor-body:Alpha edited')).toBeTruthy();
    expect(screen.getByText('editor-locked:false')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    // Still usable afterwards.
    await follow('Nowhere');
    expect(screen.getByText('editor-body:Nowhere')).toBeTruthy();
  });

  it('a double tap creates exactly one note', async () => {
    await openFromList([note('a', 'Alpha')], 'a');
    await act(async () => {
      await Promise.all([flow().followNoteLink('Foo'), flow().followNoteLink('Foo')]);
    });
    await press('editor-back');
    await waitFor(() => expect(route()).toBe('Notes'));
    expect(stored().filter((n) => n.body === 'Foo')).toHaveLength(1);
    expect(stored()).toHaveLength(2);
  });

  it('a failed save stays on the note, unlocked, with the alert; Leave anyway uses the existing path', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    await press('editor-edit');
    __fs.failWhen('write', (uri) => uri.includes('notes.json'));
    await follow('Beta');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe("Couldn't save your note");
    expect(flow().session?.id).toBe('a');
    expect(screen.getByText('editor-body:Alpha edited')).toBeTruthy();
    expect(screen.getByText('editor-locked:false')).toBeTruthy();
    expect(route()).toBe('Editor');
    await act(async () => alertButton('Leave anyway').onPress?.());
    await waitFor(() => expect(route()).toBe('Notes'));
    expect(flow().session).toBeNull();
  });

  it('when the list cannot be read twice it shows the alert and unlocks', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    const save = jest.spyOn(storage, 'saveNote');
    jest.spyOn(storage, 'listNotes').mockRejectedValue(new Error('boom'));
    await follow('Beta');
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't open that note", undefined, [
      expect.objectContaining({ text: 'OK' }),
    ]);
    expect(save).not.toHaveBeenCalled();
    expect(flow().session?.id).toBe('a');
    expect(screen.getByText('editor-locked:false')).toBeTruthy();
  });

  it('one failed read is retried once', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    jest.spyOn(storage, 'listNotes').mockRejectedValueOnce(new Error('boom'));
    await follow('Beta');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(flow().session?.id).toBe('b');
  });

  it('does nothing while a recording is open, the index is unreadable, or no note is open', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta')], 'a');
    const save = jest.spyOn(storage, 'saveNote');
    await press('editor-record');
    await follow('Beta');
    expect(flow().session?.id).toBe('a');
    expect(screen.getByText('editor-locked:false')).toBeTruthy();
    flow().entryRecordingRef.current = false;

    __fs.put(INDEX, '{ not json');
    await act(async () => {
      await flow().notes.refresh();
    });
    expect(flow().notes.indexStatus).toBe('unreadable');
    await follow('Beta');
    expect(flow().session?.id).toBe('a');
    expect(save).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('does nothing without an open note', async () => {
    putIndex([note('a', 'Alpha')]);
    __fs.put(SETTINGS, JSON.stringify({ autoOpenDreamCapture: false }));
    await render(app());
    await waitFor(() => expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy());
    const save = jest.spyOn(storage, 'saveNote');
    await follow('Alpha');
    expect(flow().session).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(route()).toBe('Notes');
  });

  it('reads the list fresh: a note edited in storage after the last refresh opens with its new body', async () => {
    await openFromList([note('a', 'Alpha'), note('b', 'Beta\n\nold')], 'a');
    putIndex([note('a', 'Alpha'), note('b', 'Beta\n\nfresh')]);
    expect(flow().notes.all.find((n) => n.id === 'b')?.body).toBe('Beta\n\nold');
    await follow('Beta');
    expect(screen.getByText('editor-body:Beta\n\nfresh')).toBeTruthy();
  });

  it('marks the day done when the launch note was left empty by a link', async () => {
    putIndex([note('b', 'Beta')]);
    await render(app());
    await waitFor(() => expect(screen.getByText('editor-body:')).toBeTruthy());
    await follow('Beta');
    expect(flow().session?.id).toBe('b');
    await waitFor(() =>
      expect(JSON.parse(__fs.read(DAY_MARKER) as string).noDreamDate).toBeTruthy(),
    );
  });

  it('Editor keeps preventing removal while locked with no session', async () => {
    await openFromList([note('a', 'Alpha')], 'a');
    await press('editor-edit');
    let release!: () => void;
    const hold = new Promise<void>((res) => {
      release = res;
    });
    const real = storage.listNotes;
    let holding = false;
    jest.spyOn(storage, 'listNotes').mockImplementation(async (...args) => {
      if (holding) await hold;
      return real(...args);
    });
    holding = true;
    await press('editor-back');
    await waitFor(() => expect(flow().session).toBeNull());
    expect(flow().locked).toBe(true);
    await act(async () => flow().navigationRef.goBack());
    expect(route()).toBe('Editor');
    await act(async () => release());
    await waitFor(() => expect(route()).toBe('Notes'));
  });
});
