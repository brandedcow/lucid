import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
const MIN_DB = -60;

export type FinishedRecording = { uri: string; durationMs: number };

/** Thin wrapper over expo-audio for the capture flow: start, pause/resume, stop. */
export function useDreamRecorder() {
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 100);

  /** Returns false if the microphone permission was not granted. */
  const start = async (): Promise<boolean> => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return false;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  };

  const pause = () => recorder.pause();
  const resume = () => recorder.record();

  const stop = async (): Promise<FinishedRecording | null> => {
    const durationMs = state.durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    return recorder.uri ? { uri: recorder.uri, durationMs } : null;
  };

  // metering is in dB (about -160..0); map the audible range to 0..1.
  const level =
    state.metering === undefined
      ? 0
      : Math.min(1, Math.max(0, (state.metering - MIN_DB) / -MIN_DB));

  return {
    start,
    pause,
    resume,
    stop,
    durationMs: state.durationMillis,
    level,
    isRecording: state.isRecording,
  };
}
