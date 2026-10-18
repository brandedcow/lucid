import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useBackEdgePrompt } from '../hooks/useBackEdgePrompt';
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
// enforced for this page. While Back would ask something (a prompt, a recording's discard confirm,
// or an ignored press) removal is prevented for every source (the toolbar arrow, Android hardware
// back, the iOS edge swipe) and goes to `backFromAdd`. When Back would leave at once nothing is
// prevented: the system pops the route once, and a `beforeRemove` listener runs the leave's side
// effects. An exit the app chooses (`leaveFlow`) raises `allowLeave`; the effect below pops once the
// prevention is down.
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
    allowLeave,
    resetAllowLeave,
    finishSystemLeave,
  } = useAppFlow();

  // The last non-null session of this route. After a save or leave `entry.clear()` empties the
  // session while the pop animation still shows this page; it keeps painting the last content.
  // The state belongs to the route, so it is gone when the route unmounts.
  const [lastSession, setLastSession] = useState(entry.session);
  if (entry.session && entry.session !== lastSession) setLastSession(entry.session);
  const session = entry.session ?? lastSession;

  // The flag starts down on every mount and focus.
  useEffect(() => {
    resetAllowLeave();
    return navigation.addListener('focus', resetAllowLeave);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetAllowLeave only sets state/ref
  }, [navigation]);

  // The recorder is a ref, so the page keeps a copy in state for the prompt rule to follow.
  const [recording, setRecording] = useState(false);
  const needsPrompt = session
    ? !leavesWithoutPrompt({
        origin: session.origin,
        hasContent: entryHasContent(session),
        hasEdits: entryHasEdits(session),
        pendingAudioRemoval: hasPendingAudioRemoval(session),
        recording,
        saving: entry.saving,
        deleting: deletingDream !== null,
      })
    : false;

  // Prevented removals (swipe, arrow, Android back) all land in `backFromAdd`, which keeps every
  // rule. `usePreventRemove` (not a bare listener) also tells iOS to let the swipe start and
  // report the dismissal instead of completing it behind the JS state.
  const preventRemove = !!session && needsPrompt && !allowLeave;
  usePreventRemove(preventRemove, () => backFromAdd());

  // A removal that needs no prompt is not prevented; the system pops once, and the leave's side
  // effects (clear the session, No dream on an empty launch page) run here. A removal the app asked
  // for (`allowLeaveRef`) already ran them.
  const finishRef = useRef(finishSystemLeave);
  useEffect(() => {
    finishRef.current = finishSystemLeave;
  });
  useEffect(() => {
    if (preventRemove) return;
    return navigation.addListener('beforeRemove', () => {
      if (allowLeaveRef.current) return;
      finishRef.current();
    });
  }, [navigation, preventRemove, allowLeaveRef]);

  // The app's own exit: pops once, in the render after `allowLeave` lowered the prevention.
  useEffect(() => {
    if (allowLeave) navigation.goBack();
  }, [allowLeave, navigation]);

  // The native iOS swipe is on only while leaving needs no prompt: on a page that asks it would
  // play the whole pop and snap back. There the page's own left-edge swipe opens the prompt.
  const clean = !!session && !needsPrompt;
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: clean });
  }, [navigation, clean]);
  const edgeEnabled = useRef(false);
  useEffect(() => {
    edgeEnabled.current = preventRemove;
  });
  const edgeHandlers = useBackEdgePrompt(edgeEnabled, () => backFromAdd());

  if (!session) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <View style={{ flex: 1 }} {...edgeHandlers}>
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
    </View>
  );
}
