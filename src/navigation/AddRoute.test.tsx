import {
  createNavigationContainerRef,
  NavigationContainer,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import type { EntrySession } from '../hooks/useEntrySession';
import { AddRoute } from './AddRoute';

// The route in isolation: a stack of a bare Main and the real AddRoute, with the app flow faked, so
// the guard, the allow flag, the swipe option and the last-session snapshot are exercised directly.
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
    AddEntryWithVoice: (p: { title: string; onBack: () => void }) => (
      <>
        <T>{`page-title:${p.title}`}</T>
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

beforeEach(() => {
  ref = createNavigationContainerRef<Params>();
  backFromAdd.mockReset();
  allowLeaveRef.current = false;
  setFlow();
});

describe('AddRoute', () => {
  it('sends a removal that the app did not ask for to backFromAdd and keeps the route', async () => {
    await render(<Tree />);
    await act(async () => ref.goBack());
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main', 'Add']);
  });

  it('the page arrow goes through goBack, hence through the guard', async () => {
    await render(<Tree />);
    await fireEvent.press(screen.getByText('page-back'));
    expect(backFromAdd).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main', 'Add']);
  });

  it('the page arrow is a plain goBack: with the allow flag up it pops without asking backFromAdd', async () => {
    await render(<Tree />);
    allowLeaveRef.current = true;
    await fireEvent.press(screen.getByText('page-back'));
    expect(backFromAdd).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main']);
  });

  it('lets one removal through when the app set the allow flag, without calling backFromAdd', async () => {
    await render(<Tree />);
    allowLeaveRef.current = true;
    await act(async () => ref.goBack());
    expect(backFromAdd).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main']);
  });

  it('starts every mount with the allow flag down', async () => {
    allowLeaveRef.current = true;
    await render(<Tree />);
    expect(allowLeaveRef.current).toBe(false);
    await act(async () => ref.goBack());
    expect(backFromAdd).toHaveBeenCalledTimes(1);
  });

  it('turns the swipe on while leaving needs no prompt, off otherwise', async () => {
    await render(<Tree />);
    expect(options().gestureEnabled).toBe(true);
    await update({ entry: { session: session({ body: 'words' }), saving: false } });
    expect(options().gestureEnabled).toBe(false);
    await update({ entry: { session: session(), saving: true } });
    expect(options().gestureEnabled).toBe(false);
    await update({ deletingDream: { id: 'x' } });
    expect(options().gestureEnabled).toBe(false);
    await update();
    expect(options().gestureEnabled).toBe(true);
  });

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
    expect(options().gestureEnabled).toBe(false);
  });
});
