import * as Sharing from 'expo-sharing';

export const RECORDING_MIME_TYPE = 'audio/mp4';
export const RECORDING_UTI = 'public.mpeg-4-audio';
export const SHARE_DIALOG_TITLE = 'Share voice note';

export class ShareUnavailableError extends Error {
  constructor() {
    super('Sharing is not available on this device.');
    this.name = 'ShareUnavailableError';
  }
}

/**
 * Opens the system share sheet for one voice note file (a cache or `dreams/` URI).
 * Read-only: never reads, copies, moves or deletes the file. Rejections from the
 * share sheet propagate to the caller.
 */
export async function shareRecording(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new ShareUnavailableError();
  }
  await Sharing.shareAsync(uri, {
    mimeType: RECORDING_MIME_TYPE,
    UTI: RECORDING_UTI,
    dialogTitle: SHARE_DIALOG_TITLE,
  });
}
