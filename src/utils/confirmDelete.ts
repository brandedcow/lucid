import { Alert } from 'react-native';
import { EntryType } from '../types/entry';
import { kindCopy } from './journals';

type Options = {
  hasAudio: boolean;
  /** Whose wording to use. Defaults to 'dream'. */
  kind?: EntryType;
  /** The user chose "Delete". Called after `onClose`. */
  onConfirm: () => void;
  /** The dialog is gone however it ended (Keep, Delete or tapped outside). Release any "dialog open" guard here. */
  onClose: () => void;
};

/** The one "Delete this dream?" (or "entry") confirmation, shared by every place an entry can be deleted. */
export function confirmDeleteDream({ hasAudio, kind = 'dream', onConfirm, onClose }: Options) {
  const copy = kindCopy(kind);
  Alert.alert(
    copy.deleteTitle,
    hasAudio ? copy.deleteBodyWithAudio : copy.deleteBodyNoAudio,
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
