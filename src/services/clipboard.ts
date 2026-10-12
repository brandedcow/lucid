import * as Clipboard from 'expo-clipboard';

/**
 * Copies text to the system clipboard. The text is never logged. Rejections
 * from the native clipboard propagate to the caller.
 */
export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
