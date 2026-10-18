import { StatusBar } from 'expo-status-bar';
import { type ComponentProps } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppFlowProvider, useAppFlow } from './src/app/AppFlowProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AddEntryMenu } from './src/components/AddEntryMenu';
import { AddRoute } from './src/navigation/AddRoute';
import { LogRoute, SearchRoute, SettingsRoute, TodayRoute } from './src/navigation/routes';
import { NewJournalSheet } from './src/components/NewJournalSheet';
import { colors } from './src/theme';

// The one "+" button and Add entry sheet of the app. It must sit inside SafeAreaProvider to read the
// bottom inset, so it is its own component.
function SharedAddEntry(props: ComponentProps<typeof AddEntryMenu>) {
  const insets = useSafeAreaInsets();
  return <AddEntryMenu {...props} bottomInset={insets.bottom} />;
}

// The shell: the shared "+" button and its sheet, both journal-name sheets and the status bar. It is
// rendered once above the navigator, so it stays put while screens slide beneath it.
function Shell() {
  const {
    routeName,
    journals,
    journalRegistry,
    journalsOpen,
    namingJournal,
    setNamingJournal,
    renamingJournal,
    renamingJournalId,
    setRenamingJournalId,
    deletingDream,
    visibleJournals,
    live,
    showLog,
    canRenameJournal,
    startCapture,
  } = useAppFlow();

  return (
    <>
      <NewJournalSheet
        visible={namingJournal && routeName !== 'Add'}
        onClose={() => setNamingJournal(false)}
        existing={journals}
        onSubmit={async (name) => {
          // The journal is in the registry (saved) before its log opens, so nothing is ever
          // captured into an unknown journal. A failure rejects and the sheet stays open.
          const created = await journalRegistry.add(name);
          setNamingJournal(false);
          showLog(created.id);
        }}
      />
      <NewJournalSheet
        visible={renamingJournal !== undefined && routeName === 'Today' && journalsOpen}
        onClose={() => setRenamingJournalId(null)}
        existing={journals}
        excludeId={renamingJournal?.id}
        initialName={renamingJournal?.name}
        title="Rename journal"
        submitLabel="Save"
        onSubmit={async (name) => {
          const id = renamingJournalId;
          // Checked again at submit time: the journal may have changed since the sheet opened.
          if (id === null || !canRenameJournal(id)) {
            setRenamingJournalId(null);
            return;
          }
          const stored = live.current.custom.find((j) => j.id === id);
          // Nothing changed: close without writing.
          if (!stored || name === stored.name) return;
          await journalRegistry.rename(id, name);
        }}
      />
      <SharedAddEntry
        journals={visibleJournals}
        onPick={(id) => startCapture(id)}
        onNewJournal={() => {
          setRenamingJournalId(null);
          setNamingJournal(true);
        }}
        disabled={deletingDream !== null}
        hidden={
          routeName === 'Add' || journalsOpen || namingJournal || renamingJournal !== undefined
        }
      />
      <StatusBar style="light" />
    </>
  );
}

// Mounts the navigator once the launch decision is made, so a launch into the add page starts with
// it on top of Today. Until then nothing is drawn but the background.
function AppNavigator() {
  const { launchDecided, navigationRef, syncRoute, startInAdd } = useAppFlow();
  if (!launchDecided) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return (
    <>
      <RootNavigator
        today={TodayRoute}
        log={LogRoute}
        settings={SettingsRoute}
        search={SearchRoute}
        add={AddRoute}
        navigationRef={navigationRef}
        startInAdd={startInAdd}
        onReady={syncRoute}
        onStateChange={syncRoute}
      />
      <Shell />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppFlowProvider>
          <AppNavigator />
        </AppFlowProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
