import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

const LANG = 'en-US';
const RESTART_DELAY_MS = 300;
/** Give up after this many restarts in a row that produced no result. */
const MAX_EMPTY_RESTARTS = 5;
/** Errors where retrying cannot help. */
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);
/** Errors that just mean nothing was heard; recognition is restarted quietly. */
const QUIET_ERRORS = new Set(['no-speech', 'speech-timeout', 'aborted']);

const MODEL_MISSING =
  'On-device speech model is not installed. Live text is off (audio is still recording).';

const log = (...args: unknown[]) => console.log('[transcription]', ...args);

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

/**
 * Live, on-device speech-to-text for the capture screen. Spike: runs alongside the expo-audio
 * recorder and never throws; failures end up in `error` and the recording is unaffected.
 */
export function useLiveTranscription() {
  const [committed, setCommitted] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [listening, setListening] = useState(false);

  const wanted = useRef(false);
  const interimRef = useRef('');
  const emptyRestarts = useRef(0);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitInterim = () => {
    const pending = interimRef.current;
    interimRef.current = '';
    setInterim('');
    if (pending) setCommitted((prev) => join(prev, pending));
  };

  const beginRecognition = () => {
    ExpoSpeechRecognitionModule.start({
      lang: LANG,
      interimResults: true,
      continuous: true,
      requiresOnDeviceRecognition: true,
    });
  };

  useSpeechRecognitionEvent('start', () => {
    log('start');
    setListening(true);
  });

  useSpeechRecognitionEvent('audiostart', () => log('audio capture started'));
  useSpeechRecognitionEvent('audioend', () => log('audio capture ended'));

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript?.trim() ?? '';
    emptyRestarts.current = 0;
    if (event.isFinal) {
      interimRef.current = '';
      setInterim('');
      if (text) setCommitted((prev) => join(prev, text));
    } else {
      interimRef.current = text;
      setInterim(text);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    log('error', event.error, event.message, event.code);
    if (event.error === 'audio-capture' || event.error === 'interrupted') {
      log('audio session/mic problem:', event.error, event.message);
    }
    if (QUIET_ERRORS.has(event.error)) return;
    if (FATAL_ERRORS.has(event.error)) {
      wanted.current = false;
      setError(
        event.error === 'language-not-supported' && Platform.OS === 'android'
          ? MODEL_MISSING
          : `${event.error}: ${event.message}`,
      );
      return;
    }
    setError(`${event.error}: ${event.message}`);
  });

  useSpeechRecognitionEvent('end', () => {
    log('end', wanted.current ? '(will restart)' : '');
    setListening(false);
    // Whatever was still interim belongs to the text; keep it before a new session starts.
    commitInterim();
    if (!wanted.current) return;
    emptyRestarts.current += 1;
    if (emptyRestarts.current > MAX_EMPTY_RESTARTS) {
      log('giving up after repeated empty restarts');
      wanted.current = false;
      setError((prev) => prev ?? 'Live text stopped (nothing was recognized).');
      return;
    }
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null;
      if (!wanted.current) return;
      log('restarting');
      try {
        beginRecognition();
      } catch (e) {
        log('restart failed', e);
        wanted.current = false;
        setError('Live text stopped.');
      }
    }, RESTART_DELAY_MS);
  });

  /** Starts live text. Resolves false (and sets `error`) if it cannot run; never throws. */
  const start = useCallback(async (): Promise<boolean> => {
    try {
      setCommitted('');
      setInterim('');
      interimRef.current = '';
      setError(null);
      emptyRestarts.current = 0;

      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        log('recognition not available on this device');
        setIsSupported(false);
        return false;
      }
      if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
        log('on-device recognition not supported');
        setIsSupported(false);
        setError(
          Platform.OS === 'android'
            ? MODEL_MISSING
            : 'On-device speech recognition is not available on this device.',
        );
        return false;
      }
      setIsSupported(true);

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        log('permission not granted');
        setError('Speech recognition permission was not granted.');
        return false;
      }

      if (Platform.OS === 'android') {
        const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
        log('installed on-device locales:', installedLocales);
        if (installedLocales.length > 0 && !installedLocales.includes(LANG)) {
          setError(MODEL_MISSING);
          return false;
        }
        // An empty list means we could not verify the model, so we try anyway.
      }

      wanted.current = true;
      beginRecognition();
      return true;
    } catch (e) {
      log('start failed', e);
      wanted.current = false;
      setError('Live text could not start.');
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    log('stop requested');
    wanted.current = false;
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      log('stop failed', e);
    }
  }, []);

  useEffect(
    () => () => {
      wanted.current = false;
      if (restartTimer.current) clearTimeout(restartTimer.current);
    },
    [],
  );

  return {
    start,
    stop,
    transcript: join(committed, interim),
    error,
    isSupported,
    listening,
  };
}
