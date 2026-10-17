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

describe('RootNavigator scaffold', () => {
  it('mounts and renders the main component on its single route', async () => {
    await render(<RootNavigator main={Plain} />);
    expect(screen.getByText('the-app')).toBeTruthy();
  });

  it('lets hardware back reach the app handler, which is not consumed or doubled', async () => {
    const onBack = jest.fn(() => true);
    await render(<RootNavigator main={mainWith(onBack)} />);
    // The container registers a listener of its own, so the app's is not the only one ...
    expect(listeners.length).toBeGreaterThan(1);
    // ... but with one route it declines, and the app's handler runs once per press.
    expect(await pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(await pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('reports back as unhandled (the system exits) when the app handler declines', async () => {
    const onBack = jest.fn(() => false);
    await render(<RootNavigator main={mainWith(onBack)} />);
    expect(await pressBack()).toBe(false);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has exactly one route, Main, and no visible chrome or transition', async () => {
    mockNavigatorProps.current = null;
    await render(<RootNavigator main={Plain} />);
    const props = mockNavigatorProps.current as unknown as {
      initialRouteName: string;
      screenOptions: Record<string, unknown>;
      children: { props: { name: string } } | { props: { name: string } }[];
    };
    expect(props.initialRouteName).toBe('Main');
    expect(props.children).toEqual(expect.objectContaining({ props: expect.anything() }));
    expect(Array.isArray(props.children)).toBe(false);
    expect((props.children as { props: { name: string } }).props.name).toBe('Main');
    expect(props.screenOptions).toEqual(
      expect.objectContaining({ headerShown: false, gestureEnabled: false, animation: 'none' }),
    );
  });

  it('reports a single route in the navigation state', async () => {
    function Main() {
      const routes =
        useNavigation()
          .getState()
          ?.routes.map((r) => r.name) ?? [];
      return <Text>{`routes:${routes.join(',')}`}</Text>;
    }
    await render(<RootNavigator main={Main} />);
    expect(screen.getByText('routes:Main')).toBeTruthy();
  });

  it('applies the dark theme with the app background', async () => {
    function Main() {
      const theme = useTheme();
      return <Text>{`theme:${theme.dark}:${theme.colors.background}:${theme.colors.card}`}</Text>;
    }
    await render(<RootNavigator main={Main} />);
    expect(colors.background).toBe('#0D1017');
    expect(screen.getByText('theme:true:#0D1017:#0D1017')).toBeTruthy();
  });
});
