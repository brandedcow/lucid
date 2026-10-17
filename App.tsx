import { StatusBar } from 'expo-status-bar';
import { type ComponentProps } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppFlowProvider, useAppFlow } from './src/app/AppFlowProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AddEntryMenu } from './src/components/AddEntryMenu';
import { AddRoute } from './src/navigation/AddRoute';
import { DreamLogScreen } from './src/screens/DreamLogScreen';
import { NewJournalSheet } from './src/components/NewJournalSheet';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { colors } from './src/theme';

// The one "+" button and Add entry sheet of the app. It must sit inside SafeAreaProvider to read the
// bottom inset, so it is its own component.
function SharedAddEntry(props: ComponentProps<typeof AddEntryMenu>) {
  const insets = useSafeAreaInsets();
  return <AddEntryMenu {...props} bottomInset={insets.bottom} />;
}

// Temporary screen switch for Today, the logs, Search and Settings (they become routes later). The
// add page is its own route over this one; this keeps showing the screen it was opened from.
function MainRoute() {
  const {
    current,
    screen,
    setScreen,
    journals,
    journalFor,
    journalRegistry,
    settings,
    library,
    dayMarker,
    todayKey,
    view,
    searchView,
    journalsOpen,
    setJournalsOpen,
    namingJournal,
    setNamingJournal,
    renamingJournal,
    renamingJournalId,
    setRenamingJournalId,
    deletingDream,
    deletingJournalId,
    live,
    visibleRecords,
    visibleJournals,
    logEntries,
    counts,
    logJournal,
    journalsLocked,
    showLog,
    deleteDreamFor,
    canRenameJournal,
    requestRenameJournal,
    requestDeleteJournal,
    performBack,
    startCapture,
    openDraft,
    openEntryForEdit,
    openEntryById,
  } = useAppFlow();

  if (screen === null) return null;

  return (
    <>
      {screen === 'log' && (
        <DreamLogScreen
          journal={logJournal}
          onBack={() => void performBack()}
          dreams={logEntries}
          indexStatus={library.indexStatus}
          view={view}
          onOpenDream={(id) => openEntryById(id)}
          onOpenDraft={(draft) => openDraft(draft)}
          onDeleteDream={(d) => void deleteDreamFor(d)}
          deletingId={deletingDream?.id ?? null}
        />
      )}
      {screen === 'today' && (
        <TodayScreen
          journals={visibleJournals}
          dreams={visibleRecords}
          todayKey={todayKey}
          skippedToday={dayMarker.noDreamDate === todayKey}
          unreadable={library.indexStatus === 'unreadable'}
          onOpenEntry={(d) => openEntryForEdit(d)}
          onOpenDraft={(draft) => openDraft(draft)}
          onDeleteDream={(d) => void deleteDreamFor(d)}
          deletingId={deletingDream?.id ?? null}
          onOpenJournals={() => {
            if (!journalsLocked) setJournalsOpen(true);
          }}
          onOpenSettings={() => setScreen('settings')}
          journalsOpen={journalsOpen}
          onCloseJournals={() => setJournalsOpen(false)}
          journalsDisabled={journalsLocked}
          drawer={{
            journals,
            counts,
            unreadable: library.indexStatus === 'unreadable',
            onOpenJournal: (id) => {
              setJournalsOpen(false);
              showLog(id);
            },
            onSearch: () => {
              setJournalsOpen(false);
              setScreen('search');
            },
            onNewJournal: () => {
              setRenamingJournalId(null);
              setNamingJournal(true);
            },
            onDeleteJournal: requestDeleteJournal,
            onRenameJournal: requestRenameJournal,
            deletingId: deletingJournalId,
          }}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          autoOpenDreamCapture={settings.autoOpenDreamCapture}
          onChangeAutoOpenDreamCapture={settings.setAutoOpenDreamCapture}
          onlineTranscription={settings.onlineTranscription}
          onChangeOnlineTranscription={settings.setOnlineTranscription}
          onBack={() => void performBack()}
        />
      )}
      {screen === 'search' && (
        <SearchScreen
          journals={visibleJournals}
          records={visibleRecords}
          indexStatus={library.indexStatus}
          view={searchView}
          onBack={() => void performBack()}
          onOpenDream={(id) => openEntryById(id)}
        />
      )}
      <NewJournalSheet
        visible={namingJournal && current !== 'add'}
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
        visible={renamingJournal !== undefined && current === 'today' && journalsOpen}
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
        hidden={current === 'add' || journalsOpen || namingJournal || renamingJournal !== undefined}
      />
      <StatusBar style="light" />
    </>
  );
}

// Mounts the navigator once the launch decision is made, so a launch into the add page starts with
// it on top of Today. Until then nothing is drawn but the background.
function AppNavigator() {
  const { screen, navigationRef, syncAddOpen, current } = useAppFlow();
  if (screen === null) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return (
    <RootNavigator
      main={MainRoute}
      add={AddRoute}
      navigationRef={navigationRef}
      startInAdd={current === 'add'}
      onReady={syncAddOpen}
      onStateChange={syncAddOpen}
    />
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
