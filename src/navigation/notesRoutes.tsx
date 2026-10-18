import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useNotesFlow } from '../app/NotesFlowProvider';
import { NotesDrawer } from '../components/NotesDrawer';
import { useBackEdgePrompt } from '../hooks/useBackEdgePrompt';
import { useNow } from '../hooks/useNow';
import { NoteEditorWithVoice } from '../screens/NoteEditorWithVoice';
import { NoteListScreen } from '../screens/NoteListScreen';
import { RecentlyDeletedScreen } from '../screens/RecentlyDeletedScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../theme';
import { formatToday } from '../utils/format';
import { viewTitle } from '../utils/noteViewLabels';
import type { NoteView } from '../utils/noteViews';
import type { NotesStackParamList } from './NotesNavigator';

// The note list as the root route. It hosts the drawer (its open state is local to the route).
// Choosing a view or a note, and opening Recently Deleted or Settings, close the drawer first, so
// it is never left open behind another screen. The drawer takes Android back while it is open; on
// the list otherwise back exits the app.
export function NotesRoute() {
  const navigation = useNavigation<NativeStackNavigationProp<NotesStackParamList>>();
  const { notes, view, setView, migrationNotice, openNote, openNewNote } = useNotesFlow();
  const now = useNow();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const selectView = (next: NoteView) => {
    setDrawerOpen(false);
    setView(next);
  };
  // Pushes only from the list itself, so a second tap never stacks a second screen.
  const push = (name: 'Settings' | 'RecentlyDeleted') => {
    setDrawerOpen(false);
    if (navigation.isFocused()) navigation.navigate(name);
  };
  const unreadable = notes.indexStatus === 'unreadable';

  return (
    <View style={{ flex: 1 }}>
      <NoteListScreen
        title={viewTitle(view)}
        notes={notes.loaded ? notes.visible : null}
        now={now}
        indexStatus={notes.indexStatus}
        emptyKind={view}
        migrationNotice={migrationNotice}
        onOpenNote={(id) => {
          setDrawerOpen(false);
          openNote(id);
        }}
        onNewNote={() => {
          setDrawerOpen(false);
          openNewNote();
        }}
        onOpenMenu={() => setDrawerOpen(true)}
        newNoteDisabled={unreadable}
        drawerOpen={drawerOpen}
      />
      <NotesDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        view={view}
        onSelectView={selectView}
        tags={notes.tags}
        trashedCount={notes.trashed.length}
        onOpenTrash={() => push('RecentlyDeleted')}
        onOpenSettings={() => push('Settings')}
        unreadable={unreadable}
      />
    </View>
  );
}

// The open note as a route. Every way out (the arrow, Android back, the iOS edge swipe) goes to the
// provider's `leaveEditor`, which saves first; the app's own exit raises `allowLeave` and this
// route pops once the prevention is down.
export function EditorRoute() {
  const navigation = useNavigation();
  const {
    session: openSession,
    sessionActions,
    knownTags,
    transcription,
    entryRecordingRef,
    entryLeaveRef,
    locked,
    banner,
    leaveEditor,
    deleteOpenNote,
    togglePin,
    allowLeave,
    resetAllowLeave,
  } = useNotesFlow();

  // The last non-null session of this route. After a leave the provider clears the session while
  // the pop animation still shows this page; it keeps painting the last content. The state
  // belongs to the route, so it is gone when the route unmounts.
  const [lastSession, setLastSession] = useState(openSession);
  if (openSession && openSession !== lastSession) setLastSession(openSession);
  const session = openSession ?? lastSession;

  // The flag starts down on every mount and focus.
  useEffect(() => {
    resetAllowLeave();
    return navigation.addListener('focus', resetAllowLeave);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetAllowLeave only sets state/ref
  }, [navigation]);

  // All removals (arrow, Android back, iOS swipe) are prevented while a note is open and land in
  // `leaveEditor`. `usePreventRemove` also tells iOS to let the swipe start and report it.
  const preventRemove = !!openSession && !allowLeave;
  usePreventRemove(preventRemove, () => void leaveEditor());

  // The app's own exit: pops once, in the render after `allowLeave` lowered the prevention.
  useEffect(() => {
    if (allowLeave) navigation.goBack();
  }, [allowLeave, navigation]);

  // The native iOS swipe stays off; this page's own left-edge swipe calls the same leave.
  const edgeEnabled = useRef(false);
  useEffect(() => {
    edgeEnabled.current = preventRemove;
  });
  const edgeHandlers = useBackEdgePrompt(edgeEnabled, () => void leaveEditor());

  if (!session) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  const created = session.createdAt ? new Date(session.createdAt) : new Date();
  return (
    <View style={{ flex: 1 }} {...edgeHandlers}>
      <NoteEditorWithVoice
        key={session.id}
        session={session}
        actions={sessionActions}
        knownTags={knownTags}
        transcription={transcription}
        onRecordingChange={(recording) => {
          entryRecordingRef.current = recording;
        }}
        leaveRef={entryLeaveRef}
        onRecordingDiscarded={() => void leaveEditor()}
        date={formatToday(Number.isNaN(created.getTime()) ? new Date() : created)}
        onBack={() => void leaveEditor()}
        onTogglePin={() => void togglePin()}
        onDelete={() => void deleteOpenNote()}
        menuDisabled={locked}
        banner={banner}
        locked={locked}
        autoFocus={!session.stored}
      />
    </View>
  );
}

// Recently Deleted: a stub in 7a (7b builds the list).
export function RecentlyDeletedRoute() {
  const navigation = useNavigation();
  return <RecentlyDeletedScreen onBack={() => navigation.goBack()} />;
}

// Settings as a route of its own. The arrow, Android back and (iOS) the native swipe pop it. The
// screen still has its old prop names and labels; chunk 7a-7 renames them.
export function NotesSettingsRoute() {
  const navigation = useNavigation();
  const { settings } = useNotesFlow();
  return (
    <SettingsScreen
      autoOpenDreamCapture={settings.autoOpenNewNote}
      onChangeAutoOpenDreamCapture={settings.setAutoOpenNewNote}
      onlineTranscription={settings.onlineTranscription}
      onChangeOnlineTranscription={settings.setOnlineTranscription}
      onBack={() => navigation.goBack()}
    />
  );
}
