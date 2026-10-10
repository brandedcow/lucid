import { Alert } from 'react-native';

type Options = {
  hasAudio: boolean;
  /** The user chose "Delete". Called after `onClose`. */
  onConfirm: () => void;
  /** The dialog is gone however it ended (Keep, Delete or tapped outside). Release any "dialog open" guard here. */
  onClose: () => void;
};

/** The one "Delete this dream?" confirmation, shared by every place a dream can be deleted. */
export function confirmDeleteDream({ hasAudio, onConfirm, onClose }: Options) {
  Alert.alert(
    'Delete this dream?',
    hasAudio
      ? "The recording and text will be permanently deleted. This can't be undone."
      : "The text will be permanently deleted. This can't be undone.",
    [
      { text: 'Keep', style: 'cancel', onPress: onClose },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onClose();
          onConfirm();
        },
      },
    ],
    { onDismiss: onClose },
  );
}
