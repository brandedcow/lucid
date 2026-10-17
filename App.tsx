import { StatusBar } from 'expo-status-bar';
import { type ComponentProps } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppFlowProvider, useAppFlow, type Screen } from './src/app/AppFlowProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { entryJournalLocked } from './src/hooks/useEntrySession';
import { AddEntryMenu } from './src/components/AddEntryMenu';
import { AddEntryWithVoice } from './src/screens/AddEntryWithVoice';
import { DreamLogScreen } from './src/screens/DreamLogScreen';
import { NewJournalSheet } from './src/components/NewJournalSheet';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { colors } from './src/theme';
import { capitalizeFirst } from './src/utils/capitalizeFirst';
import { splitEmotions } from './src/utils/emotions';
import { type FlowReturn } from './src/utils/sessionNavigation';

// Where saving or leaving the add page returns to, for the screen the shared "+" button was used on.
// Today has its own value; anything else (there is no other screen with a "+") uses Today too.
function flowReturnFor(screen: Screen): FlowReturn {
  return screen === 'log' || screen === 'search' || screen === 'settings' ? screen : 'today';
}

// The one "+" button and Add entry sheet of the app. It must sit inside SafeAreaProvider to read the
// bottom inset, so it is its own component.
function SharedAddEntry(props: ComponentProps<typeof AddEntryMenu>) {
  const insets = useSafeAreaInsets();
  return <AddEntryMenu {...props} bottomInset={insets.bottom} />;
}

// Temporary screen switch; replace with real navigation once that is decided.
function MainRoute() {
  const {
    current,
    setScreen,
    journals,
    journalFor,
    journalRegistry,
    entry,
    settings,
    transcription,
    library,
    dayMarker,
    todayKey,
    view,
    searchView,
    entryRecordingRef,
    entryLeaveRef,
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
    knownTags,
    logEntries,
    counts,
    logJournal,
    entryDate,
    journalsLocked,
    showLog,
    saveEntryAndLeave,
    backFromAdd,
    deleteDreamFor,
    requestDeleteOpenEntry,
    canRenameJournal,
    requestRenameJournal,
    requestDeleteJournal,
    performBack,
    startCapture,
    openDraft,
    openEntryForEdit,
    openEntryById,
  } = useAppFlow();

  if (current === null) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <>
      {current === 'add' && entry.session && (
        <AddEntryWithVoice
          journal={journalFor(entry.session.journalId)}
          journals={visibleJournals}
          onJournalChange={entry.setJournal}
          journalLocked={entryJournalLocked(entry.session)}
          title={entry.session.title}
          onTitleChange={entry.setTitle}
          body={entry.session.body}
          onBodyChange={entry.setBody}
          bodyBaseFrom={entry.session.materializedFrom}
          entryCreatedAt={entry.session.createdAt}
          knownTags={knownTags}
          date={entryDate}
          saving={entry.saving}
          autoFocus={entry.session.origin === 'new'}
          onSave={() => void saveEntryAndLeave('saved')}
          onBack={() => void performBack()}
          recordings={entry.session.recordings}
          transcription={transcription}
          onRecorded={entry.attachRecording}
          onRemoveRecording={entry.removeRecording}
          onRestoreRecording={entry.restoreRecording}
          onRecordingChange={(recording) => {
            entryRecordingRef.current = recording;
          }}
          leaveRef={entryLeaveRef}
          onRecordingDiscarded={backFromAdd}
          emotions={splitEmotions(entry.session.emotion).map(capitalizeFirst)}
          onDelete={entry.session.id ? requestDeleteOpenEntry : undefined}
          deleteDisabled={deletingDream !== null || deletingJournalId !== null}
        />
      )}
      {current === 'log' && (
        <DreamLogScreen
          journal={logJournal}
          onBack={() => void performBack()}
          dreams={logEntries}
          indexStatus={library.indexStatus}
          view={view}
          onOpenDream={(id) => openEntryById(id, 'log')}
          onOpenDraft={(draft) => openDraft(draft, 'log')}
          onDeleteDream={(d) => void deleteDreamFor(d)}
          deletingId={deletingDream?.id ?? null}
        />
      )}
      {current === 'today' && (
        <TodayScreen
          journals={visibleJournals}
          dreams={visibleRecords}
          todayKey={todayKey}
          skippedToday={dayMarker.noDreamDate === todayKey}
          unreadable={library.indexStatus === 'unreadable'}
          onOpenEntry={(d) => openEntryForEdit(d, 'today')}
          onOpenDraft={(draft) => openDraft(draft, 'today')}
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
      {current === 'settings' && (
        <SettingsScreen
          autoOpenDreamCapture={settings.autoOpenDreamCapture}
          onChangeAutoOpenDreamCapture={settings.setAutoOpenDreamCapture}
          onlineTranscription={settings.onlineTranscription}
          onChangeOnlineTranscription={settings.setOnlineTranscription}
          onBack={() => void performBack()}
        />
      )}
      {current === 'search' && (
        <SearchScreen
          journals={visibleJournals}
          records={visibleRecords}
          indexStatus={library.indexStatus}
          view={searchView}
          onBack={() => void performBack()}
          onOpenDream={(id) => openEntryById(id, 'search')}
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
        onPick={(id) => startCapture(id, flowReturnFor(current))}
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

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppFlowProvider>
          <RootNavigator main={MainRoute} />
        </AppFlowProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
