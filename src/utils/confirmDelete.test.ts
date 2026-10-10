import { Alert, AlertButton } from 'react-native';
import { confirmDeleteDream } from './confirmDelete';

const buttons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];

describe('confirmDeleteDream', () => {
  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('uses the audio copy', () => {
    confirmDeleteDream({ hasAudio: true, onConfirm: jest.fn(), onClose: jest.fn() });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete this dream?',
      "The recording and text will be permanently deleted. This can't be undone.",
      expect.any(Array),
      expect.anything(),
    );
  });

  it('uses the text-only copy without audio', () => {
    confirmDeleteDream({ hasAudio: false, onConfirm: jest.fn(), onClose: jest.fn() });
    expect(jest.mocked(Alert.alert).mock.calls[0][1]).toBe(
      "The text will be permanently deleted. This can't be undone.",
    );
  });

  it('has Keep (cancel) and Delete (destructive)', () => {
    confirmDeleteDream({ hasAudio: true, onConfirm: jest.fn(), onClose: jest.fn() });
    expect(buttons().map((b) => [b.text, b.style])).toEqual([
      ['Keep', 'cancel'],
      ['Delete', 'destructive'],
    ]);
  });

  it('Keep closes without confirming', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    confirmDeleteDream({ hasAudio: true, onConfirm, onClose });
    buttons()[0].onPress?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Delete closes, then confirms', () => {
    const order: string[] = [];
    confirmDeleteDream({
      hasAudio: true,
      onConfirm: () => order.push('confirm'),
      onClose: () => order.push('close'),
    });
    buttons()[1].onPress?.();
    expect(order).toEqual(['close', 'confirm']);
  });

  it('dismissing by tapping outside closes without confirming', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    confirmDeleteDream({ hasAudio: true, onConfirm, onClose });
    jest.mocked(Alert.alert).mock.calls[0][3]?.onDismiss?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
