import {
  DefaultTheme,
  NavigationContainer,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState, type ComponentType } from 'react';
import { colors } from '../theme';

// `Today` is the root. `Log` (one journal's log), `Settings` and `Search` are pushed over it. `Add`
// is the add-entry page, pushed over whatever is showing, so the screen it was opened from stays
// mounted underneath. No deep linking and no navigation-state persistence.
export type RootStackParamList = {
  Today: undefined;
  Log: { journalId: string };
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
  today,
  log,
  settings,
  search,
  add,
  navigationRef,
  startInAdd = false,
  onReady,
  onStateChange,
}: {
  today: ComponentType;
  log: ComponentType;
  settings: ComponentType;
  search: ComponentType;
  add: ComponentType;
  navigationRef?: NavigationContainerRefWithCurrent<RootStackParamList>;
  /** Mount with `Add` already on top of `Today` (the launch page). Read once, at mount. */
  startInAdd?: boolean;
  onReady?: () => void;
  onStateChange?: () => void;
}) {
  // The container reads its initial state only at mount, so it is fixed here too.
  const [initialState] = useState(() =>
    startInAdd ? { routes: [{ name: 'Today' as const }, { name: 'Add' as const }] } : undefined,
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
        initialRouteName="Today"
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          animation: 'none',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Today" component={today} />
        {/* Pushed from Today: the default push, and the native swipe back (iOS) pops to Today. The
            log turns its swipe off while its search field is open (see `LogRoute`). */}
        <Stack.Screen
          name="Log"
          component={log}
          options={{ animation: 'default', gestureEnabled: true }}
        />
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
