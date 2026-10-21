import { File } from 'expo-file-system';

/** Deletes a recording that was never saved. Only for the cache file of the current recording. */
export function discardRecording(recordingUri: string) {
  const file = new File(recordingUri);
  if (file.exists) file.delete();
}
