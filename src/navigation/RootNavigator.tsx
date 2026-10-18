import {
  DefaultTheme,
  NavigationContainer,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState, type ComponentType } from 'react';
import { colors } from '../theme';

// `Main` renders Today, the logs, Search and Settings through the app's own screen switch (they
// become routes in a later chunk). `Add` is the add-entry page, pushed over `Main`, so the screen it
// was opened from stays mounted underneath. No deep linking and no navigation-state persistence.
export type RootStackParamList = { Main: undefined; Add: undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  dark: true,
  colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background },
};

export function RootNavigator({
  main,
  add,
  navigationRef,
  startInAdd = false,
  onReady,
  onStateChange,
}: {
  main: ComponentType;
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
