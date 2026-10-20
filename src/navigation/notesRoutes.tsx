import { useFocusEffect, useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useAppFlow } from '../app/AppFlowProvider';
import { NotesDrawer } from '../components/NotesDrawer';
import { SearchButton } from '../components/SearchButton';
import { useBackEdgePrompt } from '../hooks/useBackEdgePrompt';
import { drawerGestureEnabled, useDrawerGesture } from '../hooks/useDrawerGesture';
import { drawerWidthFor, useDrawerProgress } from '../hooks/useDrawerProgress';
import { useNow } from '../hooks/useNow';
import { NoteEditorWithVoice } from '../screens/NoteEditorWithVoice';
import { NoteListScreen } from '../screens/NoteListScreen';
import { NoteSearchPanel, SearchHeader } from '../screens/NoteSearchPanel';
import { RecentlyDeletedScreen } from '../screens/RecentlyDeletedScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors } from '../theme';
import { formatDayKey, formatToday } from '../utils/format';
import { monthSections, searchChips, searchResults } from '../utils/noteSearch';
import { viewTitle } from '../utils/noteViewLabels';
import type { NoteView } from '../utils/noteViews';
import type { NotesStackParamList } from './NotesNavigator';

// The note list as the root route. It hosts the drawer, which sits behind the page: opening slides
// the page to the right (leaving a strip of it visible) and the drawer fades in under it. The open
// state is local to the route; `progress` (0..1, native driven) is only the visuals. Choosing a view
// or a note, and opening Recently Deleted or Settings, close the drawer first, so it is never left
// open behind another screen; it also closes when the route loses focus, so a screen pushed by any
// other means never returns to an open drawer. It closes by tapping the visible strip of the page,
// dragging left, or Android back (the drawer handles it while open); on the list otherwise back
// exits the app. A swipe from the left edge opens it (`useDrawerGesture`).
//
// Search is a state of this route, not a screen: the search icon turns the list header into the
// search field and draws the results over the list body. The query and the selected chips live
// here, so they survive a note being opened over the list (this route stays mounted under the
// pushed Editor) and are cleared when search closes. Results come from the provider's note list, so
// a note edited or trashed meanwhile is current when the user comes back. No timers, no debounce.
//
// Today shows the date under its title, from the flow's `todayKey` (the same key the Today filter
// uses, so the two cannot disagree). The drawer's tag sort comes from the settings.
// Search closes with the arrow or Android back (the handler is on only while this route is
// focused and searching, so an editor pushed over it keeps its own back), or when the drawer opens.
export function NotesRoute() {
  const navigation = useNavigation<NativeStackNavigationProp<NotesStackParamList>>();
  const {
    notes,
    view,
    setView,
    migrationNotice,
    openNote,
    openNewNote,
    pinNote,
    trashNote,
    trashBusy,
    todayKey,
    settings,
  } = useAppFlow();
  const now = useNow();
  const { width: windowWidth } = useWindowDimensions();
  const width = drawerWidthFor(windowWidth);
  const { progress, animateTo } = useDrawerProgress();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rowOpen, setRowOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const closeSearch = useCallback(() => {
    setSearching(false);
    setQuery('');
    setSelectedTags([]);
  }, [setQuery]);
  const setOpen = useCallback(
    (open: boolean) => {
      if (open) closeSearch();
      setDrawerOpen(open);
      animateTo(open ? 1 : 0);
    },
    [animateTo, closeSearch],
  );
  const closeDrawer = useCallback(() => setOpen(false), [setOpen]);
  useEffect(() => navigation.addListener('blur', closeDrawer), [navigation, closeDrawer]);

  const gesture = useDrawerGesture({
    progress,
    width,
    open: drawerOpen,
    enabled: drawerGestureEnabled({
      open: drawerOpen,
      rowOpen,
      searching,
      swipeDisabled: trashBusy,
    }),
    onSettle: setOpen,
  });

  const selectView = (next: NoteView) => {
    setOpen(false);
    setView(next);
  };
  // Pushes only from the list itself, so a second tap never stacks a second screen.
  const push = (name: 'Settings' | 'RecentlyDeleted') => {
    setOpen(false);
    if (navigation.isFocused()) navigation.navigate(name);
  };
  const unreadable = notes.indexStatus === 'unreadable';
  const openSearch = () => {
    setOpen(false);
    setSearching(true);
  };
  useFocusEffect(
    useCallback(() => {
      if (!searching) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        closeSearch();
        return true;
      });
      return () => sub.remove();
    }, [searching, closeSearch]),
  );
  const { sections, resultCount } = useMemo(() => {
    if (!searching) return { sections: [], resultCount: 0 };
    const results = searchResults(notes.all, query, selectedTags);
    return { sections: monthSections(results, now), resultCount: results.length };
  }, [searching, notes.all, query, selectedTags, now]);
  const chips = useMemo(() => searchChips(notes.tags, selectedTags), [notes.tags, selectedTags]);
  const toggleTag = useCallback(
    (tag: string) =>
      setSelectedTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag])),
    [],
  );

  const pageX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width],
    extrapolate: 'clamp',
  });
  const dim = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, DIM_OPACITY],
    extrapolate: 'clamp',
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <NotesDrawer
          open={drawerOpen}
          progress={progress}
          width={width}
          onClose={closeDrawer}
          view={view}
          onSelectView={selectView}
          tags={notes.tags}
          trashedCount={notes.trashed.length}
          onOpenTrash={() => push('RecentlyDeleted')}
          onOpenSettings={() => push('Settings')}
          unreadable={unreadable}
          tagSort={settings.tagSort}
          onChangeTagSort={settings.setTagSort}
        />
        <Animated.View
          testID="notes-page"
          style={[styles.page, { transform: [{ translateX: pageX }] }]}
        >
          <View
            style={styles.fill}
            accessibilityElementsHidden={drawerOpen}
            importantForAccessibility={drawerOpen ? 'no-hide-descendants' : 'auto'}
          >
            <NoteListScreen
              title={viewTitle(view)}
              subtitle={view.kind === 'today' ? formatDayKey(todayKey) : undefined}
              notes={notes.loaded ? notes.visible : null}
              now={now}
              indexStatus={notes.indexStatus}
              emptyKind={view}
              migrationNotice={migrationNotice}
              onOpenNote={(id) => {
                setOpen(false);
                openNote(id);
              }}
              onNewNote={() => {
                setOpen(false);
                openNewNote();
              }}
              onOpenMenu={() => setOpen(true)}
              rightSlot={unreadable ? undefined : <SearchButton onPress={openSearch} />}
              newNoteDisabled={unreadable}
              drawerOpen={drawerOpen}
              onPinNote={(id, pinned) => void pinNote(id, pinned)}
              onDeleteNote={(id) => void trashNote(id)}
              swipeDisabled={trashBusy}
              onRowOpenChange={setRowOpen}
              searchHeader={
                searching ? (
                  <SearchHeader
                    query={query}
                    onChangeQuery={setQuery}
                    onClose={closeSearch}
                    disabled={unreadable}
                  />
                ) : undefined
              }
              searchPanel={
                searching ? (
                  <NoteSearchPanel
                    query={query}
                    selectedTags={selectedTags}
                    onToggleTag={toggleTag}
                    chips={chips}
                    sections={sections}
                    resultCount={resultCount}
                    now={now}
                    indexStatus={notes.indexStatus}
                    onOpenNote={(id) => {
                      setOpen(false);
                      openNote(id);
                    }}
                  />
                ) : undefined
              }
            />
          </View>
          <Animated.View pointerEvents="none" style={[styles.fill, styles.dim, { opacity: dim }]} />
          {drawerOpen && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={closeDrawer}
              style={styles.fill}
            />
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const DIM_OPACITY = 0.35;
const styles = StyleSheet.create({
  // Opaque, so the drawer behind it only shows once the page has moved. No elevation: a large
  // shadowed view is costly on Android; a hairline edge separates it instead.
  page: {
    flex: 1,
    backgroundColor: colors.background,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  fill: { ...StyleSheet.absoluteFill },
  dim: { backgroundColor: '#000' },
});

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
  } = useAppFlow();

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

// Recently Deleted. The provider holds the actions, the busy flag and the "Restored" line; the
// line is cleared when the screen loses focus or unmounts.
export function RecentlyDeletedRoute() {
  const navigation = useNavigation();
  const {
    notes,
    trashBusy,
    trashNotice,
    clearTrashNotice,
    restoreNote,
    requestDeleteForever,
    requestEmptyTrash,
  } = useAppFlow();
  const now = useNow();
  useEffect(() => {
    const off = navigation.addListener('blur', clearTrashNotice);
    return () => {
      off();
      clearTrashNotice();
    };
  }, [navigation, clearTrashNotice]);
  return (
    <RecentlyDeletedScreen
      notes={notes.loaded ? notes.trashed : null}
      now={now}
      indexStatus={notes.indexStatus}
      busy={trashBusy}
      notice={trashNotice}
      onBack={() => navigation.goBack()}
      onRestore={(id) => void restoreNote(id)}
      onDeleteForever={requestDeleteForever}
      onEmpty={requestEmptyTrash}
    />
  );
}

// Settings as a route of its own. The arrow, Android back and (iOS) the native swipe pop it.
export function NotesSettingsRoute() {
  const navigation = useNavigation();
  const { settings } = useAppFlow();
  return (
    <SettingsScreen
      autoOpenNewNote={settings.autoOpenNewNote}
      onChangeAutoOpenNewNote={settings.setAutoOpenNewNote}
      onlineTranscription={settings.onlineTranscription}
      onChangeOnlineTranscription={settings.setOnlineTranscription}
      onBack={() => navigation.goBack()}
    />
  );
}
