import {
  createNavigationContainerRef,
  NavigationContainer,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PanResponder, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Note } from '../services/notesStorage';
import { EditorRoute, NotesRoute, NotesSettingsRoute, RecentlyDeletedRoute } from './notesRoutes';

// The routes in isolation, with the flow faked: what each route reads from the provider and what
// it hands back is exercised directly. The provider itself is tested in NotesFlowProvider.test.tsx.
const mockFlow: { current: Record<string, unknown> } = { current: {} };
const mockListeners = new Set<(f: (n: number) => number) => void>();
jest.mock('../app/NotesFlowProvider', () => {
  const { useEffect: useEff, useState: useSt } = jest.requireActual('react');
  return {
    useNotesFlow: () => {
      const [, set] = useSt(0);
      useEff(() => {
        mockListeners.add(set);
        return () => void mockListeners.delete(set);
      }, []);
      return mockFlow.current;
    },
  };
});

const mockMounts = jest.fn();
jest.mock('../screens/NoteEditorWithVoice', () => {
  const { useEffect: useEff } = jest.requireActual('react');
  const { Pressable, Text: T } = jest.requireActual('react-native');
  return {
    NoteEditorWithVoice: (p: {
      session: { id: string; body: string };
      date: string;
      locked: boolean;
      autoFocus: boolean;
      menuDisabled: boolean;
      knownTags: string[];
      banner?: { kind: string };
      leaveRef: { current: unknown };
      onBack: () => void;
      onTogglePin: () => void;
      onDelete: () => void;
      onRecordingChange: (r: boolean) => void;
      onRecordingDiscarded: () => void;
    }) => {
      useEff(() => {
        mockMounts(p.session.id);
      }, []);
      return (
        <>
          <T>{`page:${p.session.id}:${p.session.body}`}</T>
          <T>{`date:${p.date}`}</T>
          <T>{`locked:${p.locked}:${p.menuDisabled}`}</T>
          <T>{`autofocus:${p.autoFocus}`}</T>
          <T>{`tags:${p.knownTags.join(',')}`}</T>
          <T>{`banner:${p.banner?.kind ?? 'none'}`}</T>
          <T>{`leaveRef:${p.leaveRef === mockLeaveRef}`}</T>
          <Pressable onPress={p.onBack}>
            <T>page-back</T>
          </Pressable>
          <Pressable onPress={p.onTogglePin}>
            <T>page-pin</T>
          </Pressable>
          <Pressable onPress={p.onDelete}>
            <T>page-delete</T>
          </Pressable>
          <Pressable onPress={() => p.onRecordingChange(true)}>
            <T>page-record</T>
          </Pressable>
          <Pressable onPress={p.onRecordingDiscarded}>
            <T>page-discard</T>
          </Pressable>
        </>
      );
    },
  };
});

// Captures the responder config the edge swipe hook creates.
type PanConfig = Parameters<typeof PanResponder.create>[0];
let panConfig: PanConfig | null = null;
const setOS = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};
const originalOS = Platform.OS;

type Params = {
  Notes: undefined;
  Editor: undefined;
  Settings: undefined;
  RecentlyDeleted: undefined;
};
const Stack = createNativeStackNavigator<Params>();
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 34 },
};
const note = (id: string, body: string): Note => ({
  id,
  createdAt: '2026-10-18T09:00:00.000Z',
  updatedAt: '2026-10-18T09:00:00.000Z',
  body,
});
const sess = (patch: Record<string, unknown> = {}) => ({
  id: 's1',
  stored: true,
  createdAt: '2026-03-05T12:00:00',
  pinned: false,
  body: 'words',
  recordings: [],
  saveState: 'idle',
  ...patch,
});

let ref: NavigationContainerRefWithCurrent<Params>;
const mockLeaveRef = { current: null };
const fn = {
  openNote: jest.fn(),
  openNewNote: jest.fn(),
  setView: jest.fn(),
  leaveEditor: jest.fn(),
  deleteOpenNote: jest.fn(),
  togglePin: jest.fn(),
  resetAllowLeave: jest.fn(),
  setAutoOpenNewNote: jest.fn(),
  setOnlineTranscription: jest.fn(),
};
const entryRecordingRef = { current: false };
function setFlow(patch: Record<string, unknown> = {}) {
  mockFlow.current = {
    notes: {
      loaded: true,
      visible: [note('a', 'First note'), note('b', 'Second note')],
      tags: [{ tag: 'night', count: 2 }],
      trashed: [],
      indexStatus: 'ok',
    },
    view: { kind: 'all' },
    setView: fn.setView,
    migrationNotice: null,
    openNote: fn.openNote,
    openNewNote: fn.openNewNote,
    session: sess(),
    sessionActions: { setBody: jest.fn() },
    knownTags: ['night'],
    transcription: {},
    entryRecordingRef,
    entryLeaveRef: mockLeaveRef,
    locked: false,
    banner: undefined,
    leaveEditor: fn.leaveEditor,
    deleteOpenNote: fn.deleteOpenNote,
    togglePin: fn.togglePin,
    allowLeave: false,
    resetAllowLeave: fn.resetAllowLeave,
    settings: {
      autoOpenNewNote: true,
      setAutoOpenNewNote: fn.setAutoOpenNewNote,
      onlineTranscription: false,
      setOnlineTranscription: fn.setOnlineTranscription,
    },
    ...patch,
  };
}
const update = (patch: Record<string, unknown> = {}) =>
  act(async () => {
    setFlow({ ...mockFlow.current, ...patch });
    mockListeners.forEach((set) => set((n) => n + 1));
  });

function Tree({ initial }: { initial: (keyof Params)[] }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <NavigationContainer ref={ref} initialState={{ routes: initial.map((name) => ({ name })) }}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Notes" component={NotesRoute} />
          <Stack.Screen name="Editor" component={EditorRoute} options={{ gestureEnabled: false }} />
          <Stack.Screen name="Settings" component={NotesSettingsRoute} />
          <Stack.Screen name="RecentlyDeleted" component={RecentlyDeletedRoute} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
const drawerGone = () => waitFor(() => expect(screen.queryByLabelText('Settings')).toBeNull());
const names = () => ref.getRootState()?.routes.map((r) => r.name);

beforeEach(() => {
  ref = createNavigationContainerRef<Params>();
  Object.values(fn).forEach((f) => f.mockReset());
  mockMounts.mockReset();
  entryRecordingRef.current = false;
  panConfig = null;
  setOS('ios');
  const create = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, 'create').mockImplementation((c) => {
    panConfig = c;
    return create(c);
  });
  setFlow();
});
afterEach(() => {
  jest.restoreAllMocks();
  setOS(originalOS as 'ios');
});

describe('NotesRoute', () => {
  it('lists the visible notes under the view title, and opens one by id', async () => {
    await render(<Tree initial={['Notes']} />);
    expect(screen.getByRole('header', { name: 'All Notes' })).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/Second note/));
    expect(fn.openNote).toHaveBeenCalledWith('b');
  });

  it('shows a tag view under its title', async () => {
    setFlow({ view: { kind: 'tag', tag: 'night' } });
    await render(<Tree initial={['Notes']} />);
    expect(screen.getByRole('header', { name: '#night' })).toBeTruthy();
  });

  it('shows nothing while loading and disables + when the index is unreadable', async () => {
    setFlow({
      notes: { loaded: false, visible: [], tags: [], trashed: [], indexStatus: 'ok' },
    });
    await render(<Tree initial={['Notes']} />);
    expect(screen.queryByLabelText(/First note/)).toBeNull();
    await update({
      notes: { loaded: true, visible: [], tags: [], trashed: [], indexStatus: 'unreadable' },
    });
    expect(screen.getByLabelText('New note').props.accessibilityState?.disabled).toBe(true);
  });

  it('passes the migration notice to the list', async () => {
    setFlow({ migrationNotice: { kind: 'working' } });
    await render(<Tree initial={['Notes']} />);
    expect(screen.getByText('Bringing in your earlier notes...')).toBeTruthy();
  });

  it('the drawer starts closed, the menu button opens it and the list is hidden from screen readers behind it', async () => {
    await render(<Tree initial={['Notes']} />);
    // The list's page container carries the flag the route passes as drawerOpen.
    const listFlag = () => {
      let el = screen.getByRole('header', {
        name: 'All Notes',
        includeHiddenElements: true,
      }).parent;
      while (el && el.props.importantForAccessibility === undefined) el = el.parent;
      return el?.props.importantForAccessibility;
    };
    expect(screen.queryByLabelText('Settings')).toBeNull();
    expect(listFlag()).toBe('auto');
    await fireEvent.press(screen.getByLabelText('Open menu'));
    expect(await screen.findByLabelText('Settings')).toBeTruthy();
    expect(listFlag()).toBe('no-hide-descendants');
  });

  it('always shows the Recently Deleted row, with a count only above zero', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    expect(await screen.findByLabelText('Recently Deleted')).toBeTruthy();
    await update({
      notes: {
        loaded: true,
        visible: [],
        tags: [],
        trashed: [note('x', 'a'), note('y', 'b')],
        indexStatus: 'ok',
      },
    });
    expect(screen.getByLabelText('Recently Deleted, 2')).toBeTruthy();
  });

  it('choosing a tag sets the view and closes the drawer', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    await fireEvent.press(await screen.findByLabelText('#night, 2'));
    expect(fn.setView).toHaveBeenCalledWith({ kind: 'tag', tag: 'night' });
    await drawerGone();
  });

  it('opening Settings closes the drawer and pushes Settings', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    await fireEvent.press(await screen.findByLabelText('Settings'));
    expect(names()).toEqual(['Notes', 'Settings']);
    await act(async () => ref.goBack());
    expect(names()).toEqual(['Notes']);
    // The drawer was closed on the way out: it is not open when the user comes back.
    await drawerGone();
  });

  it('opening Recently Deleted closes the drawer and pushes it', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    await fireEvent.press(await screen.findByLabelText('Recently Deleted'));
    expect(names()).toEqual(['Notes', 'RecentlyDeleted']);
    expect(screen.getByText('Deleted notes will appear here.')).toBeTruthy();
  });

  it.each([
    ['a note', () => screen.getByLabelText(/First note/, { includeHiddenElements: true })],
    ['a new note', () => screen.getByLabelText('New note', { includeHiddenElements: true })],
  ])('opening %s closes the drawer', async (_name, target) => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    expect(await screen.findByLabelText('Settings')).toBeTruthy();
    await fireEvent.press(target());
    expect(fn.openNote.mock.calls.length + fn.openNewNote.mock.calls.length).toBe(1);
    await drawerGone();
  });
});

describe('EditorRoute', () => {
  it('hands the page its props: session, date, tags, flags and the shared leave ref', async () => {
    setFlow({ banner: { kind: 'saveError' }, locked: true });
    await render(<Tree initial={['Notes', 'Editor']} />);
    expect(screen.getByText('page:s1:words')).toBeTruthy();
    expect(screen.getByText('date:Thursday, March 5')).toBeTruthy();
    expect(screen.getByText('locked:true:true')).toBeTruthy();
    expect(screen.getByText('autofocus:false')).toBeTruthy();
    expect(screen.getByText('tags:night')).toBeTruthy();
    expect(screen.getByText('banner:saveError')).toBeTruthy();
    expect(screen.getByText('leaveRef:true')).toBeTruthy();
  });

  it('a new note (not stored) focuses the body', async () => {
    setFlow({ session: sess({ stored: false, createdAt: undefined }) });
    await render(<Tree initial={['Notes', 'Editor']} />);
    expect(screen.getByText('autofocus:true')).toBeTruthy();
  });

  it('mounts the page with key=session.id: another note is a fresh page, the same note is not', async () => {
    await render(<Tree initial={['Notes', 'Editor']} />);
    expect(mockMounts).toHaveBeenCalledTimes(1);
    await update({ session: sess({ body: 'more words' }) });
    expect(screen.getByText('page:s1:more words')).toBeTruthy();
    expect(mockMounts).toHaveBeenCalledTimes(1);
    await update({ session: sess({ id: 's2', body: 'other' }) });
    expect(screen.getByText('page:s2:other')).toBeTruthy();
    expect(mockMounts).toHaveBeenCalledTimes(2);
    expect(mockMounts).toHaveBeenLastCalledWith('s2');
  });

  it('the arrow, pin and delete call the provider', async () => {
    await render(<Tree initial={['Notes', 'Editor']} />);
    await fireEvent.press(screen.getByText('page-back'));
    await fireEvent.press(screen.getByText('page-pin'));
    await fireEvent.press(screen.getByText('page-delete'));
    expect(fn.leaveEditor).toHaveBeenCalledTimes(1);
    expect(fn.togglePin).toHaveBeenCalledTimes(1);
    expect(fn.deleteOpenNote).toHaveBeenCalledTimes(1);
  });

  it('prevents a system removal (Android back, swipe) and sends it to leaveEditor', async () => {
    await render(<Tree initial={['Notes', 'Editor']} />);
    await act(async () => ref.goBack());
    expect(fn.leaveEditor).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Notes', 'Editor']);
    await act(async () => ref.goBack());
    expect(fn.leaveEditor).toHaveBeenCalledTimes(2);
    expect(names()).toEqual(['Notes', 'Editor']);
  });

  it('allowLeave lowers the prevention and pops once', async () => {
    await render(<Tree initial={['Notes', 'Editor']} />);
    await update({ allowLeave: true });
    expect(names()).toEqual(['Notes']);
    expect(fn.leaveEditor).not.toHaveBeenCalled();
  });

  it('resets the allow flag on mount and on focus', async () => {
    await render(<Tree initial={['Notes', 'Editor']} />);
    expect(fn.resetAllowLeave).toHaveBeenCalled();
  });

  it('keeps painting the last session while the pop animation runs, and prevents nothing then', async () => {
    await render(<Tree initial={['Notes', 'Editor']} />);
    await update({ session: null });
    expect(screen.getByText('page:s1:words')).toBeTruthy();
    // With no open note a removal is not held back.
    await act(async () => ref.goBack());
    expect(fn.leaveEditor).not.toHaveBeenCalled();
    expect(names()).toEqual(['Notes']);
  });

  it('a recording opening is reported to the provider through the shared ref; Discard leaves', async () => {
    await render(<Tree initial={['Notes', 'Editor']} />);
    await fireEvent.press(screen.getByText('page-record'));
    expect(entryRecordingRef.current).toBe(true);
    await fireEvent.press(screen.getByText('page-discard'));
    expect(fn.leaveEditor).toHaveBeenCalledTimes(1);
  });

  it('on iOS the left-edge swipe asks to leave; on Android there is no swipe', async () => {
    await render(<Tree initial={['Notes', 'Editor']} />);
    expect(panConfig).not.toBeNull();
    const cfg = panConfig as NonNullable<PanConfig>;
    const touch = (x: number) => ({ nativeEvent: { pageX: x } }) as never;
    cfg.onStartShouldSetPanResponderCapture?.(touch(2), {} as never);
    expect(cfg.onMoveShouldSetPanResponderCapture?.(touch(60), { dx: 80, dy: 2 } as never)).toBe(
      true,
    );
    await act(async () => {
      cfg.onPanResponderRelease?.(touch(90), { dx: 90, dy: 2, vx: 1 } as never);
    });
    expect(fn.leaveEditor).toHaveBeenCalledTimes(1);
  });

  it('shows a blank page when there has never been a session', async () => {
    setFlow({ session: null });
    await render(<Tree initial={['Notes', 'Editor']} />);
    expect(screen.queryByText(/^page:/)).toBeNull();
  });
});

describe('RecentlyDeletedRoute and NotesSettingsRoute', () => {
  it('Recently Deleted: the arrow pops', async () => {
    await render(<Tree initial={['Notes', 'RecentlyDeleted']} />);
    await fireEvent.press(screen.getByLabelText('Back to notes'));
    expect(names()).toEqual(['Notes']);
  });

  it('Settings: shows the existing screen over the new settings and the arrow pops', async () => {
    await render(<Tree initial={['Notes', 'Settings']} />);
    expect(screen.getByRole('header', { name: 'Settings' })).toBeTruthy();
    await fireEvent(
      screen.getByRole('switch', { name: /Open dream capture on launch/ }),
      'valueChange',
      false,
    );
    expect(fn.setAutoOpenNewNote).toHaveBeenCalledWith(false);
    await fireEvent.press(screen.getByLabelText('Back to Today'));
    expect(names()).toEqual(['Notes']);
  });
});
