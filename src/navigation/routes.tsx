import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { useAppFlow } from '../app/AppFlowProvider';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

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
