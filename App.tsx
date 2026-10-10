import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDreamLibrary } from './src/hooks/useDreamLibrary';
import { useDreamSession } from './src/hooks/useDreamSession';
import { useLogView } from './src/hooks/useLogView';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { DreamDetailScreen } from './src/screens/DreamDetailScreen';
import { DreamLogScreen } from './src/screens/DreamLogScreen';
import { ReadItBackScreen } from './src/screens/ReadItBackScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import {
  discardRecording,
  isIndexUnreadableError,
  isSafetyCopyBlockedError,
} from './src/services/dreamStorage';
import type { Dream } from './src/types/dream';
import { formatToday } from './src/utils/format';
import {
  DISCARD_CHANGES_DISCARD,
  DISCARD_CHANGES_KEEP,
  DISCARD_CHANGES_MESSAGE,
  DISCARD_CHANGES_TITLE,
  hasEdits,
  readItBackBack,
  reviewBack,
} from './src/utils/sessionNavigation';

type Screen = 'capture' | 'readItBack' | 'review' | 'log' | 'detail';

// Retrying will not help in the safety-copy case, so that message does not say so.
function deleteFailureMessage(e: unknown): string {
  if (isIndexUnreadableError(e)) return 'Your saved dreams could not be read. Nothing was deleted.';
  if (isSafetyCopyBlockedError(e)) {
    return 'A saved copy of your dreams is damaged, so this dream was not deleted. Nothing was changed.';
  }
  return 'Please try again.';
}

// Temporary screen switch; replace with real navigation once that is decided.
export default function App() {
  const [screen, setScreen] = useState<Screen>('capture');
  // True only while Read it back was opened with Edit on Review, so its back arrow returns there.
  const [fromReview, setFromReview] = useState(false);
  // The finished dream shown on the detail screen.
  const [detailId, setDetailId] = useState<string | null>(null);
  const dream = useDreamSession();
  const { session } = dream;
  const library = useDreamLibrary();
  // Created here so the filter, search and scroll position survive leaving the Dream log.
  const view = useLogView();
  // True from the start of a save until its refresh finishes, so a second tap or back cannot race it.
  const finishing = useRef(false);
  // The dream being deleted, held from the confirmed delete until it ends, and whether the delete
  // was started from its entry. `library.remove` drops the dream from the list at once, and an
  // entry's delete must not make the entry vanish while it is in flight. A delete started from the
  // Dream log (`fromDetail` false) never touches the entry screen.
  const [deletingDream, setDeletingDream] = useState<{ dream: Dream; fromDetail: boolean } | null>(
    null,
  );
  // True while any delete runs, readable synchronously: a second delete is ignored.
  const deleting = useRef(false);
  // True while a delete started from the entry runs: blocks back and Edit there. A delete started
  // from the Dream log blocks nothing, like Notes.
  const detailDeleting = useRef(false);
  // The latest screen and open entry, for the async delete to read after its await.
  const nav = useRef({ screen, detailId });
  nav.current = { screen, detailId };
  const detailDeletingDream = deletingDream?.fromDetail ? deletingDream.dream : null;

  // The detail screen needs a finished dream; otherwise the log shows.
  const detailDream =
    (detailId ? library.dreams?.find((d) => d.id === detailId) : undefined) ??
    (detailDeletingDream && detailDeletingDream.id === detailId ? detailDeletingDream : undefined);
  const current: Screen =
    screen === 'detail' && (!detailDream || detailDream.status === 'draft') ? 'log' : screen;

  const leaveToCapture = () => {
    dream.clear();
    setFromReview(false);
    setScreen('capture');
  };

  const confirmDiscard = () => {
    Alert.alert('Discard this dream?', 'Your recording and text will be deleted.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          // Only the cache file of a new recording; anything in dreams/ is never touched here.
          if (session?.audio && !session.audio.persisted) discardRecording(session.audio.uri);
          leaveToCapture();
        },
      },
    ]);
  };

  const backFromReadItBack = () => {
    if (!session) return;
    const target = readItBackBack(session, fromReview);
    if (target === 'review') {
      setFromReview(false);
      setScreen('review');
    } else if (target === 'confirmDiscard') confirmDiscard();
    else if (target === 'capture') leaveToCapture();
    else {
      dream.clear();
      setScreen('log');
    }
  };

  const leaveToLog = () => {
    dream.clear();
    setFromReview(false);
    setScreen('log');
  };

  const showDetail = (id: string | null) => {
    dream.clear();
    setFromReview(false);
    setDetailId(id);
    setScreen('detail');
  };

  // Saves, then refreshes the library, and only then leaves, so the log and detail never show
  // stale data. On a failed save the Alert is shown and the session stays. An edit never saves
  // a draft, and with no changes it writes nothing.
  const saveAndLeave = async (status: 'draft' | 'saved') => {
    if (finishing.current || !session) return;
    const isEdit = session.origin === 'edit';
    if (isEdit && (status === 'draft' || session.title.trim().length === 0)) return;
    const id = session.id ?? detailId;
    if (isEdit && !hasEdits(session)) {
      showDetail(id);
      return;
    }
    finishing.current = true;
    try {
      if (!(await dream.save(status))) return;
      await library.refresh();
      if (isEdit) showDetail(id);
      else leaveToLog();
    } finally {
      finishing.current = false;
    }
  };

  // Deletes from the entry or from a Dream log row (the caller has already confirmed). Leaves for
  // the log only if the entry of that same dream is open when the delete ends.
  const deleteDreamFor = async (target: Dream) => {
    if (deleting.current) return;
    const fromDetail = nav.current.screen === 'detail' && nav.current.detailId === target.id;
    deleting.current = true;
    detailDeleting.current = fromDetail;
    setDeletingDream({ dream: target, fromDetail });
    try {
      await library.remove(target.id);
      if (nav.current.screen === 'detail' && nav.current.detailId === target.id) {
        // The log keeps its filter, search and scroll: only the entry is left.
        setDetailId(null);
        setScreen('log');
      }
    } catch (e) {
      Alert.alert('Could not delete dream', deleteFailureMessage(e));
    } finally {
      deleting.current = false;
      detailDeleting.current = false;
      setDeletingDream(null);
    }
  };

  const backFromEdit = () => {
    if (!session) return;
    const id = session.id ?? detailId;
    if (!hasEdits(session)) {
      showDetail(id);
      return;
    }
    Alert.alert(DISCARD_CHANGES_TITLE, DISCARD_CHANGES_MESSAGE, [
      { text: DISCARD_CHANGES_KEEP, style: 'cancel' },
      { text: DISCARD_CHANGES_DISCARD, style: 'destructive', onPress: () => showDetail(id) },
    ]);
  };

  const backFromReview = () => {
    if (!session || finishing.current) return;
    const result = reviewBack(session, dream.isSaving());
    switch (result) {
      case 'blocked':
        break;
      case 'draftToList':
        void saveAndLeave('draft');
        break;
      case 'readItBack':
        setFromReview(false);
        setScreen('readItBack');
        break;
      case 'editBack':
        backFromEdit();
        break;
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  };

  // A reopened draft or edited dream shows when it was first stored; a new dream shows today.
  const dreamDate = formatToday(session?.createdAt ? new Date(session.createdAt) : new Date());

  // Android hardware back mirrors the on-screen back arrows. Capture keeps the default (exit).
  // The log closes an open search first, otherwise goes to capture.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (current === 'detail') {
        if (detailDeleting.current) return true;
        setScreen('log');
        return true;
      }
      if (current === 'log') {
        // Same transition as the New dream button: the log view state is kept.
        if (view.searching) view.closeSearch();
        else setScreen('capture');
        return true;
      }
      if (current === 'readItBack' && session) {
        backFromReadItBack();
        return true;
      }
      if (current === 'review' && session) {
        backFromReview();
        return true;
      }
      return false;
    });
    return () => sub.remove();
    // The handlers close over the latest screen, session, fromReview, detailId and search state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, session, fromReview, detailId, view.searching]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {current === 'capture' && (
          <CaptureScreen
            onRecorded={(recording, text) => {
              dream.startFromRecording(recording, text);
              setFromReview(false);
              setScreen('readItBack');
            }}
            onWrite={() => {
              dream.startWriting();
              setFromReview(false);
              setScreen('readItBack');
            }}
            onTypeInstead={(text) => {
              dream.startWriting(text);
              setFromReview(false);
              setScreen('readItBack');
            }}
            onNoDream={() => setScreen('log')}
          />
        )}
        {current === 'readItBack' && session && (
          <ReadItBackScreen
            text={session.transcript}
            onChangeText={dream.setTranscript}
            audio={session.audio}
            autoFocus={session.origin === 'write'}
            onContinue={() => {
              dream.markPassedThroughReadItBack();
              setFromReview(false);
              setScreen('review');
            }}
            onBack={backFromReadItBack}
            date={dreamDate}
          />
        )}
        {current === 'review' && session && (
          <ReviewScreen
            transcript={session.transcript}
            audio={session.audio}
            durationMs={session.audio?.durationMs ?? 0}
            title={session.title}
            onTitleChange={dream.setTitle}
            emotion={session.emotion}
            onEmotionChange={dream.setEmotion}
            emotionDraft={session.emotionDraft}
            onEmotionDraftChange={dream.setEmotionDraft}
            tags={session.tags}
            onTagsChange={dream.setTags}
            tagDraft={session.tagDraft}
            onTagDraftChange={dream.setTagDraft}
            saving={dream.saving}
            date={dreamDate}
            onEditTranscript={() => {
              setFromReview(true);
              setScreen('readItBack');
            }}
            onDone={() => void saveAndLeave('saved')}
            showFinishLater={session.origin !== 'edit'}
            onFinishLater={() => void saveAndLeave('draft')}
            onBack={backFromReview}
          />
        )}
        {current === 'log' && (
          <DreamLogScreen
            dreams={library.dreams}
            indexStatus={library.indexStatus}
            view={view}
            onOpenDream={(id) => {
              setDetailId(id);
              setScreen('detail');
            }}
            onOpenDraft={(draft) => {
              dream.openDraft(draft);
              setFromReview(false);
              setScreen('review');
            }}
            onNewDream={() => setScreen('capture')}
            onDeleteDream={(d) => void deleteDreamFor(d)}
            deletingId={deletingDream?.dream.id ?? null}
          />
        )}
        {current === 'detail' && detailDream && (
          <DreamDetailScreen
            dream={detailDream}
            onBack={() => {
              if (!detailDeleting.current) setScreen('log');
            }}
            onEdit={() => {
              if (detailDeleting.current) return;
              dream.openDream(detailDream);
              setFromReview(false);
              setScreen('review');
            }}
            onDelete={async () => {
              if (deleting.current) throw new Error('delete in progress');
              await deleteDreamFor(detailDream);
            }}
            deleteBlocked={deletingDream !== null}
            deleting={detailDeletingDream !== null && detailDeletingDream.id === detailDream.id}
          />
        )}
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
