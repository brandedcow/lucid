import {
  createNavigationContainerRef,
  NavigationContainer,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BackHandler, PanResponder, Platform } from 'react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { State } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Note } from '../services/notesStorage';
import {
  EditorRoute,
  NotesRoute,
  NotesSettingsRoute,
  RecentlyDeletedRoute,
  SearchRoute,
} from './notesRoutes';

// A stand-in Swipeable that records its instances, so a test can open and close a row by hand
// (the real one needs a device). It renders content and actions like the real one.
type FakeRow = { open: () => void; close: () => void };
const mockRows: FakeRow[] = [];
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { Component } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: class FakeSwipeable extends Component<{
      children?: React.ReactNode;
      renderRightActions?: () => React.ReactNode;
      onSwipeableWillOpen?: () => void;
      onSwipeableClose?: () => void;
    }> {
      constructor(props: never) {
        super(props);
        mockRows.push(this as unknown as FakeRow);
      }
      open = () => this.props.onSwipeableWillOpen?.();
      close = () => this.props.onSwipeableClose?.();
      render() {
        return (
          <>
            {this.props.children}
            {this.props.renderRightActions?.()}
          </>
        );
      }
    },
  };
});

// The routes in isolation, with the flow faked: what each route reads from the provider and what
// it hands back is exercised directly. The provider itself is tested in AppFlowProvider.test.tsx.
const mockFlow: { current: Record<string, unknown> } = { current: {} };
const mockListeners = new Set<(f: (n: number) => number) => void>();
jest.mock('../app/AppFlowProvider', () => {
  const { useEffect: useEff, useState: useSt } = jest.requireActual('react');
  return {
    useAppFlow: () => {
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
  Search: undefined;
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
  pinNote: jest.fn(),
  trashNote: jest.fn(),
  restoreNote: jest.fn(),
  requestDeleteForever: jest.fn(),
  requestEmptyTrash: jest.fn(),
  clearTrashNotice: jest.fn(),
};
const entryRecordingRef = { current: false };
function setFlow(patch: Record<string, unknown> = {}) {
  mockFlow.current = {
    notes: {
      loaded: true,
      visible: [note('a', 'First note'), note('b', 'Second note')],
      all: [note('a', 'First note #night'), note('b', 'Second note')],
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
    pinNote: fn.pinNote,
    trashNote: fn.trashNote,
    restoreNote: fn.restoreNote,
    requestDeleteForever: fn.requestDeleteForever,
    requestEmptyTrash: fn.requestEmptyTrash,
    clearTrashNotice: fn.clearTrashNotice,
    trashBusy: false,
    trashNotice: null,
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
          <Stack.Screen name="Search" component={SearchRoute} />
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

describe('NotesRoute drawer behind the page', () => {
  const HIDDEN = { includeHiddenElements: true };
  const drawerRoot = () => screen.getByTestId('notes-drawer', HIDDEN);
  const page = () => screen.getByTestId('notes-page', HIDDEN);
  const pageContentHidden = () => page().children[0] as never as { props: Record<string, unknown> };
  const drag = (translationX: number, velocityX = 0) =>
    act(async () => {
      fireGestureHandler(getByGestureTestId('drawer-pan'), [
        { state: State.BEGAN, x: 5 },
        { state: State.ACTIVE, translationX: translationX / 2 },
        { state: State.ACTIVE, translationX },
        { state: State.END, translationX, velocityX },
      ]);
    });
  let backHandlers: (() => boolean | null | undefined)[];
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    backHandlers = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      backHandlers.push(h as () => boolean);
      return { remove: () => void backHandlers.splice(backHandlers.indexOf(h as never), 1) };
    });
  });

  it('keeps the drawer mounted but hidden and untouchable while closed, with no close layer', async () => {
    await render(<Tree initial={['Notes']} />);
    expect(drawerRoot().props.pointerEvents).toBe('none');
    expect(drawerRoot().props.importantForAccessibility).toBe('no-hide-descendants');
    expect(drawerRoot().props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByLabelText('Close menu')).toBeNull();
    expect(pageContentHidden().props.importantForAccessibility).toBe('auto');
  });

  it('open: the page is hidden from screen readers, the drawer is reachable, and the strip closes it', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    expect(drawerRoot().props.pointerEvents).toBe('auto');
    expect(pageContentHidden().props.importantForAccessibility).toBe('no-hide-descendants');
    expect(pageContentHidden().props.accessibilityElementsHidden).toBe(true);
    await fireEvent.press(screen.getByLabelText('Close menu'));
    expect(drawerRoot().props.pointerEvents).toBe('none');
    expect(screen.queryByLabelText('Close menu')).toBeNull();
    expect(pageContentHidden().props.importantForAccessibility).toBe('auto');
  });

  it('Android Back closes the open drawer and leaves the route in place', async () => {
    await render(<Tree initial={['Notes']} />);
    const before = backHandlers.length;
    await fireEvent.press(screen.getByLabelText('Open menu'));
    expect(backHandlers).toHaveLength(before + 1);
    // The newest handler runs first, and the drawer's says it handled the press.
    let handled: boolean | null | undefined;
    await act(async () => {
      handled = backHandlers[backHandlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(drawerRoot().props.pointerEvents).toBe('none');
    expect(backHandlers).toHaveLength(before);
    expect(names()).toEqual(['Notes']);
  });

  it('a drag from the left edge opens the drawer when it goes far enough', async () => {
    await render(<Tree initial={['Notes']} />);
    await drag(60);
    expect(drawerRoot().props.pointerEvents).toBe('none');
    await drag(200);
    expect(drawerRoot().props.pointerEvents).toBe('auto');
    expect(screen.getByLabelText('Close menu')).toBeTruthy();
  });

  it('a quick flick opens it even when short', async () => {
    await render(<Tree initial={['Notes']} />);
    await drag(30, 900);
    expect(drawerRoot().props.pointerEvents).toBe('auto');
  });

  it('the edge drag is off while the rows are locked (a delete in flight)', async () => {
    setFlow({ trashBusy: true });
    await render(<Tree initial={['Notes']} />);
    await drag(200, 900);
    expect(drawerRoot().props.pointerEvents).toBe('none');
  });

  it('a row being open keeps the edge drag off; closing the row turns it back on', async () => {
    mockRows.length = 0;
    await render(<Tree initial={['Notes']} />);
    await act(async () => mockRows[0].open());
    await drag(200, 900);
    expect(drawerRoot().props.pointerEvents).toBe('none');
    await act(async () => mockRows[0].close());
    await drag(200, 900);
    expect(drawerRoot().props.pointerEvents).toBe('auto');
  });

  it('an open drawer can be dragged closed even while a row is open', async () => {
    mockRows.length = 0;
    await render(<Tree initial={['Notes']} />);
    await act(async () => mockRows[0].open());
    await fireEvent.press(screen.getByLabelText('Open menu'));
    expect(drawerRoot().props.pointerEvents).toBe('auto');
    await drag(-200);
    expect(drawerRoot().props.pointerEvents).toBe('none');
  });

  it('the screen-reader escape gesture on the drawer closes it', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    await act(async () => drawerRoot().props.onAccessibilityEscape());
    expect(drawerRoot().props.pointerEvents).toBe('none');
    expect(screen.queryByLabelText('Close menu')).toBeNull();
  });

  it('dragging left closes an open drawer', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    await drag(-200);
    expect(drawerRoot().props.pointerEvents).toBe('none');
  });

  it('a short drag leftward leaves it open', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    await drag(-30);
    expect(drawerRoot().props.pointerEvents).toBe('auto');
  });

  it('choosing a view closes the drawer', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    await fireEvent.press(screen.getByLabelText('View, All Notes'));
    await fireEvent.press(screen.getByLabelText('Todo'));
    expect(fn.setView).toHaveBeenCalledWith({ kind: 'todo' });
    expect(drawerRoot().props.pointerEvents).toBe('none');
  });

  it('closes when the route loses focus', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    await act(async () => ref.navigate('Search'));
    await act(async () => ref.goBack());
    expect(drawerRoot().props.pointerEvents).toBe('none');
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

describe('NotesRoute row swipe', () => {
  const hidden = { includeHiddenElements: true };

  it('Pin and Delete on a row go to the provider wrappers', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getAllByLabelText('Pin note', hidden)[0]);
    expect(fn.pinNote).toHaveBeenCalledWith('a', true);
    await fireEvent.press(screen.getAllByLabelText('Delete note', hidden)[1]);
    expect(fn.trashNote).toHaveBeenCalledWith('b');
  });

  it('rows are inert while a trash action is busy', async () => {
    setFlow({ trashBusy: true });
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getAllByLabelText('Delete note', hidden)[0]);
    await fireEvent.press(screen.getAllByLabelText('Pin note', hidden)[0]);
    expect(fn.trashNote).not.toHaveBeenCalled();
    expect(fn.pinNote).not.toHaveBeenCalled();
  });
});

describe('RecentlyDeletedRoute', () => {
  const trashedNotes = [
    { ...note('t1', 'Old thought'), deletedAt: '2026-10-17T09:00:00.000Z' },
    { ...note('t2', 'Older thought'), deletedAt: '2026-10-16T09:00:00.000Z' },
  ];
  const withTrash = (patch: Record<string, unknown> = {}) =>
    setFlow({
      notes: {
        loaded: true,
        visible: [],
        tags: [],
        trashed: trashedNotes,
        indexStatus: 'ok',
      },
      ...patch,
    });

  it('lists the trashed notes and hands the actions to the provider', async () => {
    withTrash({ trashNotice: 'Restored "Earlier".' });
    await render(<Tree initial={['Notes', 'RecentlyDeleted']} />);
    expect(screen.getByText('Restored "Earlier".')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Restore Old thought'));
    expect(fn.restoreNote).toHaveBeenCalledWith('t1');
    await fireEvent.press(screen.getByLabelText('Delete Older thought forever'));
    expect(fn.requestDeleteForever).toHaveBeenCalledWith('t2');
    await fireEvent.press(screen.getByLabelText('Empty Recently Deleted'));
    expect(fn.requestEmptyTrash).toHaveBeenCalledTimes(1);
  });

  it('every action is off while busy', async () => {
    withTrash({ trashBusy: true });
    await render(<Tree initial={['Notes', 'RecentlyDeleted']} />);
    await fireEvent.press(screen.getByLabelText('Restore Old thought'));
    await fireEvent.press(screen.getByLabelText('Empty Recently Deleted'));
    expect(fn.restoreNote).not.toHaveBeenCalled();
    expect(fn.requestEmptyTrash).not.toHaveBeenCalled();
  });

  it('shows nothing while loading and the empty text when there is nothing', async () => {
    setFlow({
      notes: { loaded: false, visible: [], tags: [], trashed: [], indexStatus: 'ok' },
    });
    await render(<Tree initial={['Notes', 'RecentlyDeleted']} />);
    expect(screen.queryByText('Deleted notes will appear here.')).toBeNull();
    await update({
      notes: { loaded: true, visible: [], tags: [], trashed: [], indexStatus: 'ok' },
    });
    expect(screen.getByText('Deleted notes will appear here.')).toBeTruthy();
  });

  it('clears the notice when the screen loses focus or goes away', async () => {
    withTrash();
    await render(<Tree initial={['Notes', 'RecentlyDeleted']} />);
    fn.clearTrashNotice.mockClear();
    await fireEvent.press(screen.getByLabelText('Back to notes'));
    expect(names()).toEqual(['Notes']);
    expect(fn.clearTrashNotice).toHaveBeenCalled();
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
      screen.getByRole('switch', { name: /Open a new note on launch/ }),
      'valueChange',
      false,
    );
    expect(fn.setAutoOpenNewNote).toHaveBeenCalledWith(false);
    await fireEvent.press(screen.getByLabelText('Back to notes'));
    expect(names()).toEqual(['Notes']);
  });
});

describe('Search wiring', () => {
  // No open session, so the editor over Search does not prevent its own removal.
  beforeEach(() => setFlow({ session: null }));
  const openSearch = () => fireEvent.press(screen.getByLabelText('Search notes'));
  const field = () => screen.getByLabelText('Search notes', { includeHiddenElements: false });

  it('the header search icon pushes Search, once', async () => {
    await render(<Tree initial={['Notes']} />);
    await openSearch();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Search notes', includeHiddenElements: true }),
    );
    expect(names()).toEqual(['Notes', 'Search']);
    expect(screen.getByText('Search your notes by words or #tags.')).toBeTruthy();
  });

  it('hides the icon when the index is unreadable', async () => {
    setFlow({
      notes: {
        loaded: true,
        visible: [],
        all: [],
        tags: [],
        trashed: [],
        indexStatus: 'unreadable',
      },
    });
    await render(<Tree initial={['Notes']} />);
    expect(screen.queryByLabelText('Search notes')).toBeNull();
  });

  it('typing filters, a chip narrows, and a trashed note never appears', async () => {
    const trashed = { ...note('t', 'Second trashed'), deletedAt: '2026-10-18T10:00:00.000Z' };
    setFlow({
      notes: {
        loaded: true,
        visible: [],
        all: [note('a', 'First note #night'), note('b', 'Second note'), trashed],
        tags: [{ tag: 'night', count: 1 }],
        trashed: [trashed],
        indexStatus: 'ok',
      },
    });
    await render(<Tree initial={['Notes', 'Search']} />);
    await fireEvent.changeText(field(), 'note');
    expect(screen.getByLabelText(/First note/)).toBeTruthy();
    expect(screen.getByLabelText(/Second note/)).toBeTruthy();
    await fireEvent.changeText(field(), 'second');
    expect(screen.queryByLabelText(/Second trashed/)).toBeNull();
    expect(screen.getByLabelText(/Second note/)).toBeTruthy();
    await fireEvent.changeText(field(), '');
    await fireEvent.press(screen.getByLabelText('#night'));
    expect(screen.getByLabelText(/First note/)).toBeTruthy();
    expect(screen.queryByLabelText(/Second note/)).toBeNull();
  });

  it('shows the count and the sections from the same results', async () => {
    await render(<Tree initial={['Notes', 'Search']} />);
    await fireEvent.changeText(field(), 'zzz');
    expect(screen.getByText('No notes found.')).toBeTruthy();
    await fireEvent.changeText(field(), 'note');
    expect(screen.getByText('OCTOBER')).toBeTruthy();
  });

  it('opening a result hands the id to the provider; the query is kept while the editor is over Search', async () => {
    await render(<Tree initial={['Notes', 'Search']} />);
    await fireEvent.changeText(field(), 'second');
    await fireEvent.press(screen.getByLabelText(/Second note/));
    expect(fn.openNote).toHaveBeenCalledWith('b');
    // The provider pushes Editor; leaving pops back to the same Search route instance.
    await act(async () => ref.navigate('Editor'));
    expect(names()).toEqual(['Notes', 'Search', 'Editor']);
    await act(async () => ref.goBack());
    expect(names()).toEqual(['Notes', 'Search']);
    expect(field().props.value).toBe('second');
  });

  it('a note edited meanwhile shows its new text in the result row', async () => {
    await render(<Tree initial={['Notes', 'Search']} />);
    await fireEvent.changeText(field(), 'note');
    await act(async () => ref.navigate('Editor'));
    await update({
      notes: {
        ...(mockFlow.current.notes as object),
        all: [note('a', 'First note edited'), note('b', 'Second note')],
      },
    });
    await act(async () => ref.goBack());
    expect(screen.getByLabelText(/First note edited/)).toBeTruthy();
  });

  it('the query is gone once Search is popped and opened again', async () => {
    await render(<Tree initial={['Notes']} />);
    await openSearch();
    await fireEvent.changeText(field(), 'note');
    await act(async () => ref.goBack());
    await openSearch();
    expect(field().props.value).toBe('');
  });

  it('the back arrow and Android back return to the list', async () => {
    await render(<Tree initial={['Notes', 'Search']} />);
    await fireEvent.press(screen.getByLabelText('Back to notes'));
    expect(names()).toEqual(['Notes']);
    await act(async () => ref.navigate('Search'));
    await act(async () => ref.goBack());
    expect(names()).toEqual(['Notes']);
  });

  it('the drawer is closed when the list loses focus by any route', async () => {
    await render(<Tree initial={['Notes']} />);
    await fireEvent.press(screen.getByLabelText('Open menu'));
    expect(await screen.findByLabelText('Settings')).toBeTruthy();
    await act(async () => ref.navigate('Search'));
    await act(async () => ref.goBack());
    await drawerGone();
  });
});
