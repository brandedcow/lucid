import {
  createNavigationContainerRef,
  NavigationContainer,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { PanResponder, Platform, Text } from 'react-native';
import type { EntrySession } from '../hooks/useEntrySession';
import { AddRoute } from './AddRoute';

// Captures the responder config the edge swipe hook creates, to drive it like the OS would.
type PanConfig = Parameters<typeof PanResponder.create>[0];
let panConfig: PanConfig | null = null;
let panHandlers: object | null = null;
const setOS = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};
const originalOS = Platform.OS;

// The route in isolation: a stack of a bare Main and the real AddRoute, with the app flow faked, so
// the prevention, the allow flag, the clean-leave listener, the swipe option and the last-session snapshot are exercised directly.
const mockFlow: { current: Record<string, unknown> } = { current: {} };
const mockListeners = new Set<(f: (n: number) => number) => void>();
jest.mock('../app/AppFlowProvider', () => {
  const { useEffect, useState } = jest.requireActual('react');
  return {
    // Re-renders the route when a test swaps the flow, like a state change in the provider would.
    useAppFlow: () => {
      const [, set] = useState(0);
      useEffect(() => {
        mockListeners.add(set);
        return () => void mockListeners.delete(set);
      }, []);
      return mockFlow.current;
    },
  };
});
jest.mock('../screens/AddEntryWithVoice', () => {
  const { Pressable, Text: T } = jest.requireActual('react-native');
  return {
    AddEntryWithVoice: (p: {
      title: string;
      onBack: () => void;
      onRecordingChange: (r: boolean) => void;
    }) => (
      <>
        <T>{`page-title:${p.title}`}</T>
        <Pressable onPress={() => p.onRecordingChange(true)}>
          <T>page-record</T>
        </Pressable>
        <Pressable onPress={p.onBack}>
          <T>page-back</T>
        </Pressable>
      </>
    ),
  };
});

type Params = { Main: undefined; Add: undefined };
const Stack = createNativeStackNavigator<Params>();
const Main = () => <Text>the-main</Text>;

const session = (patch: Partial<EntrySession> = {}): EntrySession =>
  ({
    journalId: 'dreams',
    origin: 'new',
    title: '',
    body: '',
    emotion: '',
    tags: [],
    tagDraft: '',
    recordings: [],
    ...patch,
  }) as unknown as EntrySession;

let ref: NavigationContainerRefWithCurrent<Params>;
const backFromAdd = jest.fn();
const finishSystemLeave = jest.fn();
const resetAllowLeave = jest.fn();
const allowLeaveRef = { current: false };

function setFlow(patch: Record<string, unknown> = {}) {
  mockFlow.current = {
    entry: { session: session(), saving: false, setJournal: jest.fn() },
    journalFor: () => ({ id: 'dreams' }),
    visibleJournals: [],
    knownTags: [],
    entryDate: 'today',
    transcription: {},
    entryRecordingRef: { current: false },
    entryLeaveRef: { current: null },
    deletingDream: null,
    deletingJournalId: null,
    saveEntryAndLeave: jest.fn(),
    backFromAdd,
    requestDeleteOpenEntry: jest.fn(),
    allowLeaveRef,
    allowLeave: false,
    resetAllowLeave,
    finishSystemLeave,
    ...patch,
  };
}

const update = (patch: Record<string, unknown> = {}) =>
  act(async () => {
    setFlow(patch);
    mockListeners.forEach((set) => set((n) => n + 1));
  });

function Tree({ children }: { children?: ReactNode }) {
  return (
    <NavigationContainer ref={ref} initialState={{ routes: [{ name: 'Main' }, { name: 'Add' }] }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Main} />
        <Stack.Screen name="Add" component={AddRoute} options={{ gestureEnabled: false }} />
      </Stack.Navigator>
      {children}
    </NavigationContainer>
  );
}

const names = () => ref.getRootState()?.routes.map((r) => r.name);
const options = () => (ref.getCurrentOptions() ?? {}) as { gestureEnabled?: boolean };

afterEach(() => {
  jest.restoreAllMocks();
  setOS(originalOS as 'ios');
});

beforeEach(() => {
  ref = createNavigationContainerRef<Params>();
  backFromAdd.mockReset();
  finishSystemLeave.mockReset();
  resetAllowLeave.mockReset();
  panConfig = null;
  panHandlers = null;
  setOS('ios');
  const create = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, 'create').mockImplementation((c) => {
    panConfig = c;
    const instance = create(c);
    panHandlers = instance.panHandlers;
    return instance;
  });
  allowLeaveRef.current = false;
  setFlow();
});

const typed = { entry: { session: session({ body: 'words' }), saving: false } };
// Counts the pops the container performs (state changes that shrink the stack).
const popCount = () => {
  let pops = 0;
  let last = ref.getRootState()?.routes.length ?? 0;
  ref.addListener('state', () => {
    const n = ref.getRootState()?.routes.length ?? 0;
    if (n < last) pops += 1;
    last = n;
  });
  return () => pops;
};

describe('AddRoute: a page that would ask', () => {
  it('prevents a system removal (swipe, Android back) and sends it to backFromAdd, once', async () => {
    setFlow(typed);
    await render(<Tree />);
    await act(async () => ref.goBack());
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    expect(finishSystemLeave).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main', 'Add']);
  });

  it('the page arrow goes through goBack, hence through the prevention', async () => {
    setFlow(typed);
    await render(<Tree />);
    await fireEvent.press(screen.getByText('page-back'));
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main', 'Add']);
  });

  it('keeps preventing after a prompt that was answered with keep editing', async () => {
    setFlow(typed);
    await render(<Tree />);
    await act(async () => ref.goBack());
    await act(async () => ref.goBack());
    expect(backFromAdd).toHaveBeenCalledTimes(2);
    expect(names()).toEqual(['Main', 'Add']);
  });

  it('prevents while a recording runs', async () => {
    await render(<Tree />);
    await fireEvent.press(screen.getByText('page-record'));
    await act(async () => ref.goBack());
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main', 'Add']);
  });

  it.each([
    ['a save in flight', { entry: { session: session(), saving: true } }],
    ['a delete in flight', { deletingDream: { id: 'x' } }],
  ])('prevents while there is %s', async (_n, patch) => {
    setFlow(patch);
    await render(<Tree />);
    await act(async () => ref.goBack());
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main', 'Add']);
  });

  it('pops exactly once, after the render where allowLeave is raised, without asking backFromAdd', async () => {
    setFlow(typed);
    await render(<Tree />);
    const pops = popCount();
    allowLeaveRef.current = true;
    await update({ ...typed, allowLeave: true });
    expect(pops()).toBe(1);
    expect(backFromAdd).not.toHaveBeenCalled();
    expect(finishSystemLeave).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main']);
  });

  it('does not pop on its own while allowLeave is down', async () => {
    setFlow(typed);
    await render(<Tree />);
    await update(typed);
    expect(names()).toEqual(['Main', 'Add']);
    expect(backFromAdd).not.toHaveBeenCalled();
  });

  it('pops once even when the session was cleared in the same step (the last content stays painted)', async () => {
    setFlow({ entry: { session: session({ title: 'Flooded hall' }), saving: false } });
    await render(<Tree />);
    allowLeaveRef.current = true;
    await update({ entry: { session: null, saving: false }, allowLeave: true });
    expect(backFromAdd).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main']);
  });
});

describe('AddRoute: a page that leaves at once', () => {
  it('a system removal pops once, runs the leave side effects once, and never asks', async () => {
    await render(<Tree />);
    const pops = popCount();
    await act(async () => ref.goBack());
    expect(pops()).toBe(1);
    expect(finishSystemLeave).toHaveBeenCalledTimes(1);
    expect(backFromAdd).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main']);
  });

  it('the page arrow pops once with the side effects', async () => {
    await render(<Tree />);
    const pops = popCount();
    await fireEvent.press(screen.getByText('page-back'));
    expect(pops()).toBe(1);
    expect(finishSystemLeave).toHaveBeenCalledTimes(1);
    expect(backFromAdd).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main']);
  });

  it('an app-initiated pop (allow flag up) skips the side effects, which the app already ran', async () => {
    await render(<Tree />);
    allowLeaveRef.current = true;
    await update({ allowLeave: true });
    expect(finishSystemLeave).not.toHaveBeenCalled();
    expect(backFromAdd).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main']);
  });

  it('with no session at all the removal is not prevented', async () => {
    setFlow({ entry: { session: null, saving: false } });
    await render(<Tree />);
    await act(async () => ref.goBack());
    expect(backFromAdd).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main']);
  });

  it('an edit leaves at once while unchanged and asks once changed', async () => {
    const edit = (title: string) => ({
      entry: {
        session: session({
          origin: 'edit',
          id: 'e1',
          title,
          baseline: { title: 'a', body: '' },
        } as never),
        saving: false,
      },
    });
    setFlow(edit('b'));
    await render(<Tree />);
    await act(async () => ref.goBack());
    expect(names()).toEqual(['Main', 'Add']);
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    await update(edit('a'));
    await act(async () => ref.goBack());
    expect(names()).toEqual(['Main']);
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    expect(finishSystemLeave).toHaveBeenCalledTimes(1);
  });
});

describe('AddRoute: the allow flag and the swipe', () => {
  it('lowers the allow flag on every mount', async () => {
    await render(<Tree />);
    expect(resetAllowLeave).toHaveBeenCalled();
  });

  it('the native swipe follows the page: on while clean, off while a prompt would show, on again when clean', async () => {
    await render(<Tree />);
    expect(options().gestureEnabled).toBe(true);
    await update(typed);
    expect(options().gestureEnabled).toBe(false);
    await update({ entry: { session: session(), saving: true } });
    expect(options().gestureEnabled).toBe(false);
    await update({ deletingDream: { id: 'x' } });
    expect(options().gestureEnabled).toBe(false);
    await update();
    expect(options().gestureEnabled).toBe(true);
  });

  it('a recording turns the native swipe off', async () => {
    await render(<Tree />);
    await fireEvent.press(screen.getByText('page-record'));
    expect(options().gestureEnabled).toBe(false);
  });
});

// Drives the real responder handlers the hook attached (as the responder system would).
const touch = (startX: number, x: number, y: number, t: number) => ({
  nativeEvent: { touches: [{}], pageX: x },
  touchHistory: {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: t,
    touchBank: [
      {
        touchActive: true,
        startPageX: startX,
        startPageY: 100,
        startTimeStamp: 0,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: t,
        previousPageX: startX,
        previousPageY: 100,
        previousTimeStamp: 0,
      },
    ],
  },
});
// A drag from startX by dx (and dy) over `ms`, released; returns whether it was captured.
const edgeSwipe = (startX: number, dx: number, dy = 0, ms = 100) => {
  const h = panHandlers as unknown as Record<string, (e: unknown) => boolean | void>;
  h.onStartShouldSetResponderCapture(touch(startX, startX, 100, 0));
  const captured = h.onMoveShouldSetResponderCapture(touch(startX, startX + dx, 100 + dy, ms));
  if (captured) {
    h.onResponderGrant(touch(startX, startX + dx, 100 + dy, ms));
    h.onResponderRelease(touch(startX, startX + dx, 100 + dy, ms));
  }
  return captured;
};

describe('AddRoute: the iOS edge swipe on a page that asks', () => {
  it('a swipe from the left edge opens the prompt (backFromAdd) and the route stays, no pop', async () => {
    setFlow(typed);
    await render(<Tree />);
    const pops = popCount();
    expect(edgeSwipe(5, 60)).toBe(true);
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    expect(pops()).toBe(0);
    expect(names()).toEqual(['Main', 'Add']);
  });

  it('a fast short flick also opens it', async () => {
    setFlow(typed);
    await render(<Tree />);
    edgeSwipe(5, 15, 0, 10);
    expect(backFromAdd).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an early lift (short and slow)', () => edgeSwipe(5, 25, 0, 2000)],
    ['a start outside the edge zone', () => edgeSwipe(40, 80)],
    ['a vertical drag', () => edgeSwipe(5, 20, 60)],
  ])('%s does nothing', async (_n, swipe) => {
    setFlow(typed);
    await render(<Tree />);
    swipe();
    expect(backFromAdd).not.toHaveBeenCalled();
  });

  it('works while a recording runs (backFromAdd then opens the discard confirm)', async () => {
    await render(<Tree />);
    await fireEvent.press(screen.getByText('page-record'));
    edgeSwipe(5, 60);
    expect(backFromAdd).toHaveBeenCalledTimes(1);
  });

  it('is inert on a clean page: no capture, no prompt', async () => {
    await render(<Tree />);
    expect(edgeSwipe(5, 80)).toBe(false);
    expect(backFromAdd).not.toHaveBeenCalled();
  });

  it("the app's own leave still pops once with the edge swipe attached", async () => {
    setFlow(typed);
    await render(<Tree />);
    allowLeaveRef.current = true;
    await update({ ...typed, allowLeave: true });
    expect(names()).toEqual(['Main']);
  });

  it('on Android no responder is attached; the arrow still reaches the prompt', async () => {
    setOS('android');
    setFlow(typed);
    await render(<Tree />);
    expect(panConfig).toBeNull();
    await fireEvent.press(screen.getByText('page-back'));
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main', 'Add']);
  });
});

describe('AddRoute: last session', () => {
  it('keeps painting the last session while the pop runs (the session is cleared first)', async () => {
    setFlow({ entry: { session: session({ title: 'Flooded hall' }), saving: false } });
    await render(<Tree />);
    expect(screen.getByText('page-title:Flooded hall')).toBeTruthy();
    await update({ entry: { session: null, saving: false } });
    expect(screen.getByText('page-title:Flooded hall')).toBeTruthy();
  });

  it('shows a plain blank view, not a crash, if it ever mounts without a session', async () => {
    setFlow({ entry: { session: null, saving: false } });
    await render(<Tree />);
    expect(screen.queryByText(/page-title/)).toBeNull();
  });
});
