import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppFlowProvider, useAppFlow } from './src/app/AppFlowProvider';
import { NotesNavigator } from './src/navigation/NotesNavigator';
import {
  EditorRoute,
  NotesRoute,
  NotesSettingsRoute,
  RecentlyDeletedRoute,
} from './src/navigation/notesRoutes';
import { colors } from './src/theme';
import { EditorSpikeScreen } from './src/dev/EditorSpikeScreen';

// Mounts the navigator once the launch decision is made, so a launch into a new note starts with the
// editor on top of the list. Until then nothing is drawn but the background.
function AppNavigator() {
  const { launchDecided, navigationRef, startInEditor } = useAppFlow();
  if (!launchDecided) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return (
    <NotesNavigator
      notes={NotesRoute}
      editor={EditorRoute}
      settings={NotesSettingsRoute}
      recentlyDeleted={RecentlyDeletedRoute}
      navigationRef={navigationRef}
      startInEditor={startInEditor}
    />
  );
}

export default function App() {
  // Dev-only harness for the editor device spike (chunk 6c).
  if (__DEV__ && process.env.EXPO_PUBLIC_EDITOR_SPIKE === '1') return <EditorSpikeScreen />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppFlowProvider>
          <AppNavigator />
          <StatusBar style="light" />
        </AppFlowProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
