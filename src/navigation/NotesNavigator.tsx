import {
  DefaultTheme,
  NavigationContainer,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState, type ComponentType } from 'react';
import { colors } from '../theme';

// `Notes` (the note list) is the root. `Editor` is the open note, pushed over it. `Settings` and
// `RecentlyDeleted` are pushed over the list. Search is not a route: it is a state of `Notes`. No deep
// linking and no navigation-state persistence.
export type NotesStackParamList = {
  Notes: undefined;
  Editor: undefined;
  Settings: undefined;
  RecentlyDeleted: undefined;
};

const Stack = createNativeStackNavigator<NotesStackParamList>();

const theme = {
  ...DefaultTheme,
  dark: true,
  colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background },
};

export function NotesNavigator({
  notes,
  editor,
  settings,
  recentlyDeleted,
  navigationRef,
  startInEditor = false,
  onReady,
  onStateChange,
}: {
  notes: ComponentType;
  editor: ComponentType;
  settings: ComponentType;
  recentlyDeleted: ComponentType;
  navigationRef?: NavigationContainerRefWithCurrent<NotesStackParamList>;
  /** Mount with `Editor` already on top of `Notes` (the launch note). Read once, at mount. */
  startInEditor?: boolean;
  onReady?: () => void;
  onStateChange?: () => void;
}) {
  // The container reads its initial state only at mount, so it is fixed here too.
  const [initialState] = useState(() =>
    startInEditor
      ? { routes: [{ name: 'Notes' as const }, { name: 'Editor' as const }] }
      : undefined,
  );
  return (
    <NavigationContainer
      ref={navigationRef}
      theme={theme}
      initialState={initialState}
      onReady={onReady}
      onStateChange={onStateChange}
    >
      <Stack.Navigator
        initialRouteName="Notes"
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          animation: 'none',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Notes" component={notes} />
        <Stack.Screen
          name="Editor"
          component={editor}
          // The default push. The native swipe back stays off: leaving saves first, so every back
          // source goes through the provider's `leaveEditor` (the iOS edge swipe via its own hook).
          options={{ animation: 'default', gestureEnabled: false }}
        />
        <Stack.Screen
          name="Settings"
          component={settings}
          options={{ animation: 'default', gestureEnabled: true }}
        />
        <Stack.Screen
          name="RecentlyDeleted"
          component={recentlyDeleted}
          options={{ animation: 'default', gestureEnabled: true }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
