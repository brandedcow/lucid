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

type JournalOptions = {
  /** The journal's name, shown in the title. */
  name: string;
  /** Every entry in it, drafts included. */
  entryCount: number;
  /** At least one of those entries has a recording. */
  hasAudio: boolean;
  /** The user chose "Delete". Called after `onClose`. */
  onConfirm: () => void;
  /** The dialog is gone however it ended. Release any "dialog open" guard here. */
  onClose: () => void;
};

/** What the journal confirmation says will be deleted. Recordings are mentioned only when there are any. */
function journalDeleteBody(entryCount: number, hasAudio: boolean): string {
  const warning = "This can't be undone.";
  if (entryCount === 0) {
    return `This journal has no entries. It will be permanently deleted. ${warning}`;
  }
  let what: string;
  if (entryCount === 1) {
    what = hasAudio ? 'The journal, its entry and the recording' : 'The journal and its entry';
  } else {
    what = hasAudio
      ? `The journal, all ${entryCount} entries and their recordings`
      : `The journal and all ${entryCount} entries`;
  }
  return `${what} will be permanently deleted. ${warning}`;
}

/** The confirmation before a whole custom journal and all its entries are deleted. */
export function confirmDeleteJournal({
  name,
  entryCount,
  hasAudio,
  onConfirm,
  onClose,
}: JournalOptions) {
  Alert.alert(
    `Delete "${name}"?`,
    journalDeleteBody(entryCount, hasAudio),
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
