import { Alert } from 'react-native';

export const CONFIRM_FOREVER_COPY = {
  deleteTitle: 'Delete this note forever?',
  deleteBodyWithAudio:
    "The note and its voice notes will be permanently deleted. This can't be undone.",
  deleteBodyNoAudio: "The note will be permanently deleted. This can't be undone.",
  keep: 'Keep',
  deleteConfirm: 'Delete forever',
  emptyTitle: 'Empty Recently Deleted?',
  emptyConfirm: 'Empty',
} as const;

/** Body of the Empty dialog. The voice-note clause is left out when no note has audio that would be deleted. */
export function emptyTrashBody(count: number, hasAudio: boolean): string {
  const what = count === 1 ? '1 note' : `${count} notes`;
  const tail = hasAudio ? ', along with their voice notes' : '';
  return `${what} will be permanently deleted${tail}. This can't be undone.`;
}

type DeleteOptions = {
  /** Some recording of the note is not legacy-origin (see `deletedRow().hasAudio`). */
  hasAudio: boolean;
  /** The user chose "Delete forever". Called after `onClose`. */
  onConfirm: () => void;
  /** The dialog is gone however it ended. Release any "dialog open" guard here. */
  onClose: () => void;
};

/** The confirmation before one note in Recently Deleted is deleted forever. */
export function confirmDeleteForever({ hasAudio, onConfirm, onClose }: DeleteOptions) {
  Alert.alert(
    CONFIRM_FOREVER_COPY.deleteTitle,
    hasAudio ? CONFIRM_FOREVER_COPY.deleteBodyWithAudio : CONFIRM_FOREVER_COPY.deleteBodyNoAudio,
    [
      { text: CONFIRM_FOREVER_COPY.keep, style: 'cancel', onPress: onClose },
      {
        text: CONFIRM_FOREVER_COPY.deleteConfirm,
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

type EmptyOptions = {
  /** How many notes are in Recently Deleted. */
  count: number;
  /** Some note there has a recording that is not legacy-origin. */
  hasAudio: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** The confirmation before Recently Deleted is emptied. */
export function confirmEmptyTrash({ count, hasAudio, onConfirm, onClose }: EmptyOptions) {
  Alert.alert(
    CONFIRM_FOREVER_COPY.emptyTitle,
    emptyTrashBody(count, hasAudio),
    [
      { text: CONFIRM_FOREVER_COPY.keep, style: 'cancel', onPress: onClose },
      {
        text: CONFIRM_FOREVER_COPY.emptyConfirm,
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
