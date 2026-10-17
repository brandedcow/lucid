import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';
import { colors } from '../theme';

// Scaffold only: one route renders the whole existing app, so nothing visible changes. The app's
// own screen switch and Android BackHandler still run inside it. Screens migrate to real routes
// in later chunks. No deep linking and no navigation-state persistence.
export type RootStackParamList = { Main: undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  dark: true,
  colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background },
};

export function RootNavigator({ main }: { main: ComponentType }) {
  return (
    <NavigationContainer theme={theme}>
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
