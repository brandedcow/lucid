import {
  StackActions,
  useFocusEffect,
  useIsFocused,
  useNavigation,
  usePreventRemove,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { useCallback, useEffect, useMemo } from 'react';
import { BackHandler } from 'react-native';
import { useAppFlow } from '../app/AppFlowProvider';
import { DreamLogScreen } from '../screens/DreamLogScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { entriesFor } from '../utils/journals';
import type { RootStackParamList } from './RootNavigator';

// A journal's log as a route, pushed from Today (`Log { journalId }`: the journal is the route's
// identity, so the log derives its journal and entries from it). Its filter, search and scroll live
// in the provider (`view`) so they survive an Add push. The arrow, Android back and (iOS) the swipe
// pop it to Today; while its search field is open the swipe is off and every back closes the search
// first.
export function LogRoute() {
  const navigation = useNavigation();
  const { journalId } = useRoute<RouteProp<RootStackParamList, 'Log'>>().params;
  const {
    journalFor,
    visibleRecords,
    visibleJournals,
    deletingJournalId,
    deletingDream,
    library,
    view,
    openEntryById,
    openDraft,
    deleteDreamFor,
    setDrawerAfterLeave,
  } = useAppFlow();
  const focused = useIsFocused();
  const { searching, closeSearch } = view;

  // Each log shows only its own journal's entries (drafts included), whatever else is stored.
  const logEntries = useMemo(
    () => (visibleRecords ? entriesFor(visibleRecords, journalId) : null),
    [visibleRecords, journalId],
  );

  // The iOS swipe is off while the search field is open (the first back closes the search).
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !searching });
  }, [navigation, searching]);
  // Safety net for any removal while searching (it also keeps the native dismiss off): the search
  // closes instead, and a second back pops.
  usePreventRemove(searching, () => closeSearch());
  // Android hardware back closes the search first. Registered only while this log is in focus AND
  // searching, so it never grabs back under an Add push or from another route.
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

  // The journal is being deleted, or is gone: back to Today (not just one step back), with the
  // Journals drawer open when the delete shows there. Re-runs when the search closes, because a
  // removal is prevented while it is open.
  const gone = deletingJournalId === journalId || !visibleJournals.some((j) => j.id === journalId);
  const deleting = deletingJournalId === journalId;
  useEffect(() => {
    if (!focused || !gone) return;
    if (deleting) setDrawerAfterLeave(true);
    navigation.dispatch(StackActions.popToTop());
  }, [focused, gone, deleting, searching, navigation, setDrawerAfterLeave]);

  return (
    <DreamLogScreen
      journal={journalFor(journalId)}
      onBack={() => (searching ? closeSearch() : navigation.goBack())}
      dreams={logEntries}
      indexStatus={library.indexStatus}
      view={view}
      onOpenDream={(id) => openEntryById(id)}
      onOpenDraft={(draft) => openDraft(draft)}
      onDeleteDream={(d) => void deleteDreamFor(d)}
      deletingId={deletingDream?.id ?? null}
    />
  );
}

// Settings as a route of its own, pushed from Today. The arrow, Android back and (iOS) the native
// swipe all pop it, which lands on Today.
export function SettingsRoute() {
  const navigation = useNavigation();
  const { settings } = useAppFlow();
  return (
    <SettingsScreen
      autoOpenDreamCapture={settings.autoOpenDreamCapture}
      onChangeAutoOpenDreamCapture={settings.setAutoOpenDreamCapture}
      onlineTranscription={settings.onlineTranscription}
      onChangeOnlineTranscription={settings.setOnlineTranscription}
      onBack={() => navigation.goBack()}
    />
  );
}

// Search across journals as a route of its own, pushed from the Journals drawer. Its query, tags
// and scroll live in the provider (`searchView`) so they survive an Add push; leaving Search for
// any reason (arrow, Android back, swipe) clears them, so it starts fresh next time.
export function SearchRoute() {
  const navigation = useNavigation();
  const { searchView, visibleJournals, visibleRecords, library, openEntryById } = useAppFlow();
  useEffect(
    () => navigation.addListener('beforeRemove', () => searchView.clearFilters()),
    [navigation, searchView],
  );
  return (
    <SearchScreen
      journals={visibleJournals}
      records={visibleRecords}
      indexStatus={library.indexStatus}
      view={searchView}
      onBack={() => navigation.goBack()}
      onOpenDream={(id) => openEntryById(id)}
    />
  );
}
