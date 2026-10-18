import { StatusBar } from 'expo-status-bar';
import { type ComponentProps } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppFlowProvider, useAppFlow } from './src/app/AppFlowProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AddEntryMenu } from './src/components/AddEntryMenu';
import { AddRoute } from './src/navigation/AddRoute';
import { SearchRoute, SettingsRoute } from './src/navigation/routes';
import { DreamLogScreen } from './src/screens/DreamLogScreen';
import { NewJournalSheet } from './src/components/NewJournalSheet';
import { TodayScreen } from './src/screens/TodayScreen';
import { colors } from './src/theme';

// The one "+" button and Add entry sheet of the app. It must sit inside SafeAreaProvider to read the
// bottom inset, so it is its own component.
function SharedAddEntry(props: ComponentProps<typeof AddEntryMenu>) {
  const insets = useSafeAreaInsets();
  return <AddEntryMenu {...props} bottomInset={insets.bottom} />;
}

// Temporary screen switch for Today and the logs (they become routes later). Settings, Search and
// the add page are routes over this one; it keeps showing the screen they were opened from.
function MainRoute() {
  const {
    screen,
    openSettings,
    openSearch,
    journals,
    journalFor,
    library,
    dayMarker,
    todayKey,
    view,
    journalsOpen,
    setJournalsOpen,
    setNamingJournal,
    setRenamingJournalId,
    deletingDream,
    deletingJournalId,
    visibleRecords,
    visibleJournals,
    logEntries,
    counts,
    logJournal,
    journalsLocked,
    showLog,
    deleteDreamFor,
    requestRenameJournal,
    requestDeleteJournal,
    performBack,
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
          onOpenSettings={openSettings}
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
            onSearch: openSearch,
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
    </>
  );
}

// The shell: the shared "+" button and its sheet, both journal-name sheets and the status bar. It is
// rendered once above the navigator, so it stays put while screens slide beneath it.
function Shell() {
  const {
    current,
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
    <>
      <RootNavigator
        main={MainRoute}
        settings={SettingsRoute}
        search={SearchRoute}
        add={AddRoute}
        navigationRef={navigationRef}
        startInAdd={current === 'add'}
        onReady={syncAddOpen}
        onStateChange={syncAddOpen}
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
