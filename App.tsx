import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDreamSession } from './src/hooks/useDreamSession';
import { CaptureScreen } from './src/screens/CaptureScreen';
import { DreamListScreen } from './src/screens/DreamListScreen';
import { ReadItBackScreen } from './src/screens/ReadItBackScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';
import { discardRecording } from './src/services/dreamStorage';
import { formatToday } from './src/utils/format';
import { readItBackBack, reviewBack } from './src/utils/sessionNavigation';

type Screen = 'capture' | 'readItBack' | 'review' | 'list';

// Temporary screen switch; replace with real navigation once that is decided.
export default function App() {
  const [screen, setScreen] = useState<Screen>('capture');
  // True only while Read it back was opened with Edit on Review, so its back arrow returns there.
  const [fromReview, setFromReview] = useState(false);
  const dream = useDreamSession();
  const { session } = dream;

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
      setScreen('list');
    }
  };

  // TODO(Review chunk): save the reopened draft's current edits as a draft before leaving.
  const onBackFromDraftReview = () => {
    dream.clear();
    setScreen('list');
  };

  const backFromReview = () => {
    if (!session) return;
    if (reviewBack(session) === 'draftToList') onBackFromDraftReview();
    else {
      setFromReview(false);
      setScreen('readItBack');
    }
  };

  // Android hardware back mirrors the on-screen back arrows. Capture and the list keep the default.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'readItBack' && session) {
        backFromReadItBack();
        return true;
      }
      if (screen === 'review' && session) {
        backFromReview();
        return true;
      }
      return false;
    });
    return () => sub.remove();
    // The handlers close over the latest screen, session and fromReview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, session, fromReview]);

  return (
    <SafeAreaProvider>
      {screen === 'capture' && (
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
          onNoDream={() => setScreen('list')}
        />
      )}
      {screen === 'readItBack' && session && (
        <ReadItBackScreen
          text={session.transcript}
          onChangeText={dream.setTranscript}
          audio={session.audio}
          autoFocus={session.origin === 'write' && session.transcript.trim().length === 0}
          onContinue={() => {
            dream.markPassedThroughReadItBack();
            setFromReview(false);
            setScreen('review');
          }}
          onBack={backFromReadItBack}
          date={formatToday()}
        />
      )}
      {screen === 'review' && session && (
        <ReviewScreen
          transcript={session.transcript}
          audio={session.audio}
          durationMs={session.audio?.durationMs ?? 0}
          title={session.title}
          onTitleChange={dream.setTitle}
          emotion={session.emotion}
          onEmotionChange={dream.setEmotion}
          tags={session.tags}
          onTagsChange={dream.setTags}
          onEditTranscript={() => {
            setFromReview(true);
            setScreen('readItBack');
          }}
          onDone={() => {
            dream.clear();
            setScreen('list');
          }}
          onBack={backFromReview}
          onRerecord={leaveToCapture}
        />
      )}
      {screen === 'list' && <DreamListScreen onRecord={() => setScreen('capture')} />}
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
