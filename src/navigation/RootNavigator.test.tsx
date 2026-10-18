import { useNavigation, useTheme } from '@react-navigation/native';
import { act, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { BackHandler, Text } from 'react-native';
import { colors } from '../theme';
import { runBackChain } from '../test/hardwareBackChain';
import { RootNavigator } from './RootNavigator';

// Wraps the real native-stack navigator so a test can read the props the scaffold gives it.
const mockNavigatorProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('@react-navigation/native-stack', () => {
  const actual = jest.requireActual('@react-navigation/native-stack');
  return {
    ...actual,
    createNativeStackNavigator: () => {
      const stack = actual.createNativeStackNavigator();
      return {
        ...stack,
        Navigator: (props: Record<string, unknown>) => {
          mockNavigatorProps.current = props;
          return <stack.Navigator {...props} />;
        },
      };
    },
  };
});

// Records the hardwareBackPress listeners; `runBackChain` presses back the way Android does
// (newest first, stop at the first that returns true).
let listeners: (() => boolean)[] = [];
beforeEach(() => {
  listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
    listeners.push(h as () => boolean);
    return { remove: () => void (listeners = listeners.filter((x) => x !== h)) };
  });
});
afterEach(() => jest.restoreAllMocks());

const pressBack = async () => {
  let handled = false;
  await act(async () => {
    handled = runBackChain(listeners);
  });
  return handled;
};

function Plain() {
  return <Text>the-app</Text>;
}

function mainWith(onBack: () => boolean) {
  return function Main() {
    useEffect(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, []);
    return <Text>the-app</Text>;
  };
}

function AddPage() {
  return <Text>the-add-page</Text>;
}

describe('RootNavigator', () => {
  it('mounts and renders the main component', async () => {
    await render(
      <RootNavigator main={Plain} log={Plain} settings={Plain} search={Plain} add={AddPage} />,
    );
    expect(screen.getByText('the-app')).toBeTruthy();
  });

  it('lets hardware back reach the app handler, which is not consumed or doubled', async () => {
    const onBack = jest.fn(() => true);
    await render(
      <RootNavigator
        main={mainWith(onBack)}
        log={Plain}
        settings={Plain}
        search={Plain}
        add={AddPage}
      />,
    );
    // The container registers a listener of its own, so the app's is not the only one ...
    expect(listeners.length).toBeGreaterThan(1);
    // ... but with one route it declines, and the app's handler runs once per press.
    expect(await pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(await pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('with Add on top, hardware back is taken by the container (pops Add) before the app handler', async () => {
    const onBack = jest.fn(() => true);
    await render(
      <RootNavigator
        main={mainWith(onBack)}
        log={Plain}
        settings={Plain}
        search={Plain}
        add={AddPage}
        startInAdd
      />,
    );
    expect(screen.getByText('the-add-page')).toBeTruthy();
    expect(await pressBack()).toBe(true);
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByText('the-add-page')).toBeNull();
    // Back on Main alone reaches the app handler again.
    expect(await pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('reports back as unhandled (the system exits) when the app handler declines', async () => {
    const onBack = jest.fn(() => false);
    await render(
      <RootNavigator
        main={mainWith(onBack)}
        log={Plain}
        settings={Plain}
        search={Plain}
        add={AddPage}
      />,
    );
    expect(await pressBack()).toBe(false);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has the Main route (no chrome, no transition, no swipe) and an Add route with a push and the swipe off until the page allows it', async () => {
    mockNavigatorProps.current = null;
    await render(
      <RootNavigator main={Plain} log={Plain} settings={Plain} search={Plain} add={AddPage} />,
    );
    const props = mockNavigatorProps.current as unknown as {
      initialRouteName: string;
      screenOptions: Record<string, unknown>;
      children: { props: { name: string; options?: Record<string, unknown> } }[];
    };
    expect(props.initialRouteName).toBe('Main');
    expect(props.children.map((c) => c.props.name)).toEqual([
      'Main',
      'Log',
      'Settings',
      'Search',
      'Add',
    ]);
    expect(props.screenOptions).toEqual(
      expect.objectContaining({ headerShown: false, gestureEnabled: false, animation: 'none' }),
    );
    // Main keeps the stack defaults; Add overrides only the animation (a real push) and starts
    // with the swipe off (the page turns it on while leaving needs no prompt).
    expect(props.children[0].props.options).toBeUndefined();
    expect(props.children[4].props.options).toEqual({
      animation: 'default',
      gestureEnabled: false,
    });
  });

  it('has Log as a push with the native swipe back on (the log turns it off while searching)', async () => {
    mockNavigatorProps.current = null;
    await render(
      <RootNavigator main={Plain} log={Plain} settings={Plain} search={Plain} add={AddPage} />,
    );
    const props = mockNavigatorProps.current as unknown as {
      children: { props: { name: string; options?: Record<string, unknown> } }[];
    };
    const route = props.children.find((c) => c.props.name === 'Log');
    expect(route?.props.options).toEqual({ animation: 'default', gestureEnabled: true });
  });

  it('has Settings and Search as pushes with the native swipe back on', async () => {
    mockNavigatorProps.current = null;
    await render(
      <RootNavigator main={Plain} log={Plain} settings={Plain} search={Plain} add={AddPage} />,
    );
    const props = mockNavigatorProps.current as unknown as {
      children: { props: { name: string; options?: Record<string, unknown> } }[];
    };
    for (const name of ['Settings', 'Search']) {
      const route = props.children.find((c) => c.props.name === name);
      expect(route?.props.options).toEqual({ animation: 'default', gestureEnabled: true });
    }
  });

  it('starts on Main alone', async () => {
    function Main() {
      const routes =
        useNavigation()
          .getState()
          ?.routes.map((r) => r.name) ?? [];
      return <Text>{`routes:${routes.join(',')}`}</Text>;
    }
    await render(
      <RootNavigator main={Main} log={Plain} settings={Plain} search={Plain} add={AddPage} />,
    );
    expect(screen.getByText('routes:Main')).toBeTruthy();
    expect(screen.queryByText('the-add-page')).toBeNull();
  });

  it('starts with Add on top of Main when asked to (the launch page), and only at mount', async () => {
    function Main() {
      return <Text>the-main</Text>;
    }
    const view = await render(
      <RootNavigator
        main={Main}
        log={Plain}
        settings={Plain}
        search={Plain}
        add={AddPage}
        startInAdd
      />,
    );
    expect(screen.getByText('the-add-page')).toBeTruthy();
    // Main stays mounted underneath.
    expect(screen.getByText('the-main', { includeHiddenElements: true })).toBeTruthy();
    // A later change of the prop does not re-initialise a mounted container.
    await view.rerender(
      <RootNavigator
        main={Main}
        log={Plain}
        settings={Plain}
        search={Plain}
        add={AddPage}
        startInAdd={false}
      />,
    );
    expect(screen.getByText('the-add-page')).toBeTruthy();
  });

  it('applies the dark theme with the app background', async () => {
    function Main() {
      const theme = useTheme();
      return <Text>{`theme:${theme.dark}:${theme.colors.background}:${theme.colors.card}`}</Text>;
    }
    await render(
      <RootNavigator main={Main} log={Plain} settings={Plain} search={Plain} add={AddPage} />,
    );
    expect(colors.background).toBe('#0D1017');
    expect(screen.getByText('theme:true:#0D1017:#0D1017')).toBeTruthy();
  });
});
