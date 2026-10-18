import {
  DefaultTheme,
  NavigationContainer,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState, type ComponentType } from 'react';
import { colors } from '../theme';

// `Main` renders Today and the logs through the app's own screen switch (they become routes in a
// later chunk). `Settings` and `Search` are pushed over it. `Add` is the add-entry page, pushed over
// whatever is showing, so the screen it was opened from stays mounted underneath. No deep linking
// and no navigation-state persistence.
export type RootStackParamList = {
  Main: undefined;
  Settings: undefined;
  Search: undefined;
  Add: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  dark: true,
  colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background },
};

export function RootNavigator({
  main,
  settings,
  search,
  add,
  navigationRef,
  startInAdd = false,
  onReady,
  onStateChange,
}: {
  main: ComponentType;
  settings: ComponentType;
  search: ComponentType;
  add: ComponentType;
  navigationRef?: NavigationContainerRefWithCurrent<RootStackParamList>;
  /** Mount with `Add` already on top of `Main` (the launch page). Read once, at mount. */
  startInAdd?: boolean;
  onReady?: () => void;
  onStateChange?: () => void;
}) {
  // The container reads its initial state only at mount, so it is fixed here too.
  const [initialState] = useState(() =>
    startInAdd ? { routes: [{ name: 'Main' as const }, { name: 'Add' as const }] } : undefined,
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
        initialRouteName="Main"
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          animation: 'none',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Main" component={main} />
        {/* Pushed from Today: the default push, and the native swipe back (iOS) pops to Today. */}
        <Stack.Screen
          name="Settings"
          component={settings}
          options={{ animation: 'default', gestureEnabled: true }}
        />
        <Stack.Screen
          name="Search"
          component={search}
          options={{ animation: 'default', gestureEnabled: true }}
        />
        <Stack.Screen
          name="Add"
          component={add}
          // The default push. The native swipe back starts off; the page turns it on while leaving
          // needs no prompt (see `leavesWithoutPrompt`); otherwise its own edge swipe asks.
          options={{ animation: 'default', gestureEnabled: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
