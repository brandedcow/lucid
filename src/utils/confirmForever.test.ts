import { Alert, AlertButton } from 'react-native';
import {
  CONFIRM_FOREVER_COPY,
  confirmDeleteForever,
  confirmEmptyTrash,
  emptyTrashBody,
} from './confirmForever';

const call = () => jest.mocked(Alert.alert).mock.calls.at(-1)!;
const buttons = () => (call()[2] ?? []) as AlertButton[];

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('confirmDeleteForever', () => {
  it('uses the exact audio wording', () => {
    confirmDeleteForever({ hasAudio: true, onConfirm: jest.fn(), onClose: jest.fn() });
    expect(call()[0]).toBe('Delete this note forever?');
    expect(call()[1]).toBe(
      "The note and its voice notes will be permanently deleted. This can't be undone.",
    );
  });

  it('does not mention voice notes without audio (including legacy-only notes)', () => {
    confirmDeleteForever({ hasAudio: false, onConfirm: jest.fn(), onClose: jest.fn() });
    expect(call()[1]).toBe("The note will be permanently deleted. This can't be undone.");
    expect(String(call()[1])).not.toMatch(/voice/);
  });

  it('has Keep (cancel) and Delete forever (destructive)', () => {
    confirmDeleteForever({ hasAudio: true, onConfirm: jest.fn(), onClose: jest.fn() });
    expect(buttons().map((b) => [b.text, b.style])).toEqual([
      ['Keep', 'cancel'],
      ['Delete forever', 'destructive'],
    ]);
  });

  it('Keep closes without confirming', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    confirmDeleteForever({ hasAudio: true, onConfirm, onClose });
    buttons()[0].onPress?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dismissing closes without confirming', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    confirmDeleteForever({ hasAudio: true, onConfirm, onClose });
    (call()[3] as { onDismiss: () => void }).onDismiss();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Delete forever closes, then confirms', () => {
    const order: string[] = [];
    confirmDeleteForever({
      hasAudio: true,
      onConfirm: () => order.push('confirm'),
      onClose: () => order.push('close'),
    });
    buttons()[1].onPress?.();
    expect(order).toEqual(['close', 'confirm']);
  });
});

describe('confirmEmptyTrash', () => {
  it('uses the exact plural wording with audio', () => {
    confirmEmptyTrash({ count: 3, hasAudio: true, onConfirm: jest.fn(), onClose: jest.fn() });
    expect(call()[0]).toBe('Empty Recently Deleted?');
    expect(call()[1]).toBe(
      "3 notes will be permanently deleted, along with their voice notes. This can't be undone.",
    );
  });

  it('uses the singular for one note', () => {
    expect(emptyTrashBody(1, true)).toBe(
      "1 note will be permanently deleted, along with their voice notes. This can't be undone.",
    );
  });

  it('omits the voice note clause without audio', () => {
    expect(emptyTrashBody(2, false)).toBe(
      "2 notes will be permanently deleted. This can't be undone.",
    );
    expect(emptyTrashBody(1, false)).toBe(
      "1 note will be permanently deleted. This can't be undone.",
    );
  });

  it('has Keep (cancel) and Empty (destructive)', () => {
    confirmEmptyTrash({ count: 2, hasAudio: false, onConfirm: jest.fn(), onClose: jest.fn() });
    expect(buttons().map((b) => [b.text, b.style])).toEqual([
      ['Keep', 'cancel'],
      ['Empty', 'destructive'],
    ]);
  });

  it('Keep and dismiss only close; Empty closes then confirms', () => {
    const order: string[] = [];
    confirmEmptyTrash({
      count: 2,
      hasAudio: true,
      onConfirm: () => order.push('confirm'),
      onClose: () => order.push('close'),
    });
    buttons()[0].onPress?.();
    (call()[3] as { onDismiss: () => void }).onDismiss();
    expect(order).toEqual(['close', 'close']);
    buttons()[1].onPress?.();
    expect(order).toEqual(['close', 'close', 'close', 'confirm']);
  });

  it('exports the copy in one object', () => {
    expect(CONFIRM_FOREVER_COPY.keep).toBe('Keep');
    expect(CONFIRM_FOREVER_COPY.deleteConfirm).toBe('Delete forever');
    expect(CONFIRM_FOREVER_COPY.emptyConfirm).toBe('Empty');
  });
});
