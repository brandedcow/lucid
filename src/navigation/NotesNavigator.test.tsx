import { useNavigation, useTheme } from '@react-navigation/native';
import { act, render, screen } from '@testing-library/react-native';
import { BackHandler, Text } from 'react-native';
import { runBackChain } from '../test/hardwareBackChain';
import { colors } from '../theme';
import { NotesNavigator } from './NotesNavigator';

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

let listeners: (() => boolean)[] = [];
beforeEach(() => {
  listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
    listeners.push(h as () => boolean);
    return { remove: () => void (listeners = listeners.filter((x) => x !== h)) };
  });
});
afterEach(() => jest.restoreAllMocks());

const Plain = () => <Text>the-notes</Text>;
const EditorPage = () => <Text>the-editor</Text>;
const Other = () => <Text>other</Text>;

type RouteList = { props: { name: string; options?: Record<string, unknown> } }[];
const routes = () => (mockNavigatorProps.current as unknown as { children: RouteList }).children;

const mountPlain = (props: Partial<React.ComponentProps<typeof NotesNavigator>> = {}) =>
  render(
    <NotesNavigator
      notes={Plain}
      editor={EditorPage}
      settings={Other}
      recentlyDeleted={Other}
      {...props}
    />,
  );

describe('NotesNavigator', () => {
  it('has exactly the approved routes: Notes (root), Editor, Settings, RecentlyDeleted (Search is a state of Notes, not a route)', async () => {
    mockNavigatorProps.current = null;
    await mountPlain();
    const props = mockNavigatorProps.current as unknown as {
      initialRouteName: string;
      screenOptions: Record<string, unknown>;
    };
    expect(props.initialRouteName).toBe('Notes');
    expect(routes().map((c) => c.props.name)).toEqual([
      'Notes',
      'Editor',
      'Settings',
      'RecentlyDeleted',
    ]);
    expect(props.screenOptions).toEqual(
      expect.objectContaining({ headerShown: false, gestureEnabled: false, animation: 'none' }),
    );
  });

  it('pushes Editor with the native swipe off, and Settings and Recently Deleted with it on', async () => {
    mockNavigatorProps.current = null;
    await mountPlain();
    const options = (name: string) => routes().find((c) => c.props.name === name)?.props.options;
    expect(options('Notes')).toBeUndefined();
    expect(options('Editor')).toEqual({ animation: 'default', gestureEnabled: false });
    expect(options('Settings')).toEqual({ animation: 'default', gestureEnabled: true });
    expect(options('RecentlyDeleted')).toEqual({ animation: 'default', gestureEnabled: true });
  });

  it('starts on Notes alone', async () => {
    function Notes() {
      const names =
        useNavigation()
          .getState()
          ?.routes.map((r) => r.name) ?? [];
      return <Text>{`routes:${names.join(',')}`}</Text>;
    }
    await mountPlain({ notes: Notes });
    expect(screen.getByText('routes:Notes')).toBeTruthy();
    expect(screen.queryByText('the-editor')).toBeNull();
  });

  it('starts with Editor on top of Notes when asked to, and only at mount', async () => {
    const view = await mountPlain({ startInEditor: true });
    expect(screen.getByText('the-editor')).toBeTruthy();
    expect(screen.getByText('the-notes', { includeHiddenElements: true })).toBeTruthy();
    await view.rerender(
      <NotesNavigator
        notes={Plain}
        editor={EditorPage}
        settings={Other}
        recentlyDeleted={Other}
        startInEditor={false}
      />,
    );
    expect(screen.getByText('the-editor')).toBeTruthy();
  });

  it('hardware back on the root is left to the app (container declines)', async () => {
    await mountPlain();
    let handled = true;
    await act(async () => {
      handled = runBackChain(listeners);
    });
    expect(handled).toBe(false);
  });

  it('applies the dark theme with the app background', async () => {
    function Notes() {
      const theme = useTheme();
      return <Text>{`theme:${theme.dark}:${theme.colors.background}:${theme.colors.card}`}</Text>;
    }
    await mountPlain({ notes: Notes });
    expect(screen.getByText(`theme:true:${colors.background}:${colors.background}`)).toBeTruthy();
  });
});
