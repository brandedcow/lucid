import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useAppFlow } from '../app/AppFlowProvider';
import {
  entryHasContent,
  entryHasEdits,
  entryJournalLocked,
  hasPendingAudioRemoval,
} from '../hooks/useEntrySession';
import { AddEntryWithVoice } from '../screens/AddEntryWithVoice';
import { colors } from '../theme';
import { capitalizeFirst } from '../utils/capitalizeFirst';
import { splitEmotions } from '../utils/emotions';
import { leavesWithoutPrompt } from '../utils/sessionNavigation';

// The `Add` route: the add-entry page pushed over `Main`. It is the only place the leave rules are
// enforced for this page: a `beforeRemove` listener sends every removal that did not come from the
// app itself (the toolbar arrow, Android hardware back, the iOS swipe) to `backFromAdd`.
export function AddRoute() {
  const navigation = useNavigation();
  const {
    entry,
    journalFor,
    visibleJournals,
    knownTags,
    entryDate,
    transcription,
    entryRecordingRef,
    entryLeaveRef,
    deletingDream,
    deletingJournalId,
    saveEntryAndLeave,
    backFromAdd,
    requestDeleteOpenEntry,
    allowLeaveRef,
  } = useAppFlow();

  // The last non-null session of this route. After a save or leave `entry.clear()` empties the
  // session while the pop animation still shows this page; it keeps painting the last content.
  // The state belongs to the route, so it is gone when the route unmounts.
  const [lastSession, setLastSession] = useState(entry.session);
  if (entry.session && entry.session !== lastSession) setLastSession(entry.session);
  const session = entry.session ?? lastSession;

  // A removal the app asked for passes once; the flag starts down on every mount and focus.
  useEffect(() => {
    allowLeaveRef.current = false;
    return navigation.addListener('focus', () => {
      allowLeaveRef.current = false;
    });
  }, [navigation, allowLeaveRef]);

  const backRef = useRef(backFromAdd);
  useEffect(() => {
    backRef.current = backFromAdd;
  });
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (allowLeaveRef.current) return;
        e.preventDefault();
        backRef.current();
      }),
    [navigation, allowLeaveRef],
  );

  // The iOS swipe-back is on only while leaving needs no prompt. The recorder is a ref, so the page
  // keeps a copy in state for this effect to follow.
  const [recording, setRecording] = useState(false);
  const leaves = session
    ? leavesWithoutPrompt({
        origin: session.origin,
        hasContent: entryHasContent(session),
        hasEdits: entryHasEdits(session),
        pendingAudioRemoval: hasPendingAudioRemoval(session),
        recording,
        saving: entry.saving,
        deleting: deletingDream !== null,
      })
    : false;
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: leaves });
  }, [navigation, leaves]);

  if (!session) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <AddEntryWithVoice
      journal={journalFor(session.journalId)}
      journals={visibleJournals}
      onJournalChange={entry.setJournal}
      journalLocked={entryJournalLocked(session)}
      title={session.title}
      onTitleChange={entry.setTitle}
      body={session.body}
      onBodyChange={entry.setBody}
      bodyBaseFrom={session.materializedFrom}
      entryCreatedAt={session.createdAt}
      knownTags={knownTags}
      date={entryDate}
      saving={entry.saving}
      autoFocus={session.origin === 'new'}
      onSave={() => void saveEntryAndLeave('saved')}
      onBack={() => navigation.goBack()}
      recordings={session.recordings}
      transcription={transcription}
      onRecorded={entry.attachRecording}
      onRemoveRecording={entry.removeRecording}
      onRestoreRecording={entry.restoreRecording}
      onRecordingChange={(isRecording) => {
        entryRecordingRef.current = isRecording;
        setRecording(isRecording);
      }}
      leaveRef={entryLeaveRef}
      onRecordingDiscarded={backFromAdd}
      emotions={splitEmotions(session.emotion).map(capitalizeFirst)}
      onDelete={session.id ? requestDeleteOpenEntry : undefined}
      deleteDisabled={deletingDream !== null || deletingJournalId !== null}
    />
  );
}
