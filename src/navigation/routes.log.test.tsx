import {
  createNavigationContainerRef,
  NavigationContainer,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, Text } from 'react-native';
import { runBackChain } from '../test/hardwareBackChain';
import { LogRoute } from './routes';

// The Log route in isolation: Main, the real LogRoute (with the log screen stubbed) and a bare Add,
// with the app flow faked, so the swipe option, the prevention, the Android handler, the arrow and
// the deleted-journal fallback are exercised directly.
const mockFlow: { current: Record<string, unknown> } = { current: {} };
const mockListeners = new Set<(f: (n: number) => number) => void>();
jest.mock('../app/AppFlowProvider', () => {
  const { useEffect, useState } = jest.requireActual('react');
  return {
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
jest.mock('../screens/DreamLogScreen', () => {
  const { Pressable, Text: T } = jest.requireActual('react-native');
  return {
    DreamLogScreen: (p: {
      journal: { id: string };
      dreams: { id: string }[] | null;
      onBack: () => void;
    }) => (
      <>
        <T>{`log-journal:${p.journal.id}`}</T>
        <T>{`log-ids:${(p.dreams ?? []).map((d) => d.id).join(',')}`}</T>
        <Pressable onPress={p.onBack}>
          <T>log-arrow</T>
        </Pressable>
      </>
    ),
  };
});

type Params = { Main: undefined; Log: { journalId: string }; Add: undefined };
const Stack = createNativeStackNavigator<Params>();
const Main = () => <Text>the-main</Text>;
const Add = () => <Text>the-add</Text>;

let ref: NavigationContainerRefWithCurrent<Params>;
const closeSearch = jest.fn();
const setDrawerAfterLeave = jest.fn();

const journals = [{ id: 'dreams' }, { id: 'life' }, { id: 'j_x' }];
const records = [
  { id: 'd1' },
  { id: 'l1', journalId: 'life' },
  { id: 'x1', journalId: 'j_x' },
  { id: 'x2', journalId: 'j_x' },
];

function setFlow(patch: Record<string, unknown> = {}) {
  mockFlow.current = {
    journalFor: (id: string) => ({ id }),
    visibleRecords: records,
    visibleJournals: journals,
    deletingJournalId: null,
    deletingDream: null,
    library: { indexStatus: 'ok' },
    view: { searching: false, closeSearch },
    openEntryById: jest.fn(),
    openDraft: jest.fn(),
    deleteDreamFor: jest.fn(),
    setDrawerAfterLeave,
    ...patch,
  };
}
const update = (patch: Record<string, unknown> = {}) =>
  act(async () => {
    setFlow(patch);
    mockListeners.forEach((set) => set((n) => n + 1));
  });
const searching = (on: boolean) => update({ view: { searching: on, closeSearch } });

function Tree({ stack = ['Main', 'Log'] }: { stack?: ('Main' | 'Log' | 'Log:life' | 'Add')[] }) {
  return (
    <NavigationContainer
      ref={ref}
      initialState={{
        routes: stack.map((name) =>
          name === 'Log'
            ? { name, params: { journalId: 'j_x' } }
            : name === 'Log:life'
              ? { name: 'Log' as const, params: { journalId: 'life' } }
              : { name },
        ),
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Main} />
        <Stack.Screen name="Log" component={LogRoute} options={{ gestureEnabled: true }} />
        <Stack.Screen name="Add" component={Add} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const names = () => ref.getRootState()?.routes.map((r) => r.name);
const swipe = () => (ref.getCurrentOptions() as { gestureEnabled?: boolean }).gestureEnabled;

let listeners: (() => boolean)[] = [];
const pressBack = async () => {
  let handled = false;
  await act(async () => {
    handled = runBackChain(listeners);
  });
  return handled;
};

beforeEach(() => {
  ref = createNavigationContainerRef<Params>();
  closeSearch.mockReset();
  setDrawerAfterLeave.mockReset();
  listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
    listeners.push(h as () => boolean);
    return { remove: () => void (listeners = listeners.filter((x) => x !== h)) };
  });
  setFlow();
});
afterEach(() => jest.restoreAllMocks());

describe('LogRoute', () => {
  it('shows the journal from the route param with only its entries', async () => {
    await render(<Tree />);
    expect(screen.getByText('log-journal:j_x')).toBeTruthy();
    expect(screen.getByText('log-ids:x1,x2')).toBeTruthy();
  });

  it('keeps the iOS swipe on exactly while the search is closed', async () => {
    await render(<Tree />);
    expect(swipe()).toBe(true);
    await searching(true);
    expect(swipe()).toBe(false);
    await searching(false);
    expect(swipe()).toBe(true);
  });

  it('prevents a removal while searching: the search closes, and the next one pops', async () => {
    await render(<Tree />);
    await searching(true);
    await act(async () => ref.goBack());
    expect(closeSearch).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main', 'Log']);
    await searching(false);
    await act(async () => ref.goBack());
    expect(names()).toEqual(['Main']);
  });

  it('the arrow closes the search while searching, otherwise pops to Today', async () => {
    await render(<Tree />);
    await searching(true);
    await fireEvent.press(screen.getByText('log-arrow'));
    expect(closeSearch).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main', 'Log']);
    await searching(false);
    await fireEvent.press(screen.getByText('log-arrow'));
    expect(closeSearch).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main']);
  });

  it('registers an Android back handler only while focused and searching; it closes the search', async () => {
    await render(<Tree />);
    const base = listeners.length;
    await searching(true);
    expect(listeners.length).toBe(base + 1);
    expect(await pressBack()).toBe(true);
    expect(closeSearch).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Main', 'Log']);
    await searching(false);
    expect(listeners.length).toBe(base);
  });

  it('without a search, Android back is the container pop to Today', async () => {
    await render(<Tree />);
    expect(await pressBack()).toBe(true);
    expect(closeSearch).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main']);
  });

  it('does not grab Android back under an Add push, even while searching', async () => {
    await render(<Tree stack={['Main', 'Log', 'Add']} />);
    await searching(true);
    expect(await pressBack()).toBe(true);
    expect(closeSearch).not.toHaveBeenCalled();
    expect(names()).toEqual(['Main', 'Log']);
    // Back on the log (focused again) with the search still open: it is the handler's turn now.
    expect(await pressBack()).toBe(true);
    expect(closeSearch).toHaveBeenCalledTimes(1);
  });

  it('a journal that is gone pops the whole stack to Today (popToTop), without opening the drawer', async () => {
    await render(<Tree />);
    await update({ visibleJournals: journals.filter((j) => j.id !== 'j_x') });
    expect(names()).toEqual(['Main']);
    expect(setDrawerAfterLeave).not.toHaveBeenCalled();
  });

  it('a journal being deleted pops to Today and asks for the drawer', async () => {
    await render(<Tree />);
    await update({ deletingJournalId: 'j_x' });
    expect(names()).toEqual(['Main']);
    expect(setDrawerAfterLeave).toHaveBeenCalledWith(true);
  });

  it('pops everything above Today, not just one step (an older Log under it goes too)', async () => {
    await render(<Tree stack={['Main', 'Log:life', 'Log']} />);
    await update({ deletingJournalId: 'j_x' });
    expect(names()).toEqual(['Main']);
  });

  it('waits under an Add push, and pops once the log is back in focus', async () => {
    await render(<Tree stack={['Main', 'Log', 'Add']} />);
    await update({ deletingJournalId: 'j_x' });
    expect(names()).toEqual(['Main', 'Log', 'Add']);
    await act(async () => ref.goBack());
    expect(names()).toEqual(['Main']);
  });

  it('pops to Today even if the search was open when the journal went (the prevention yields)', async () => {
    await render(<Tree />);
    await searching(true);
    await update({ deletingJournalId: 'j_x' });
    // The first attempt was prevented (closeSearch); the log pops once the search is closed.
    await searching(false);
    expect(names()).toEqual(['Main']);
  });

  it('leaves another journal alone', async () => {
    await render(<Tree />);
    await update({ deletingJournalId: 'life' });
    expect(names()).toEqual(['Main', 'Log']);
    expect(setDrawerAfterLeave).not.toHaveBeenCalled();
  });
});
