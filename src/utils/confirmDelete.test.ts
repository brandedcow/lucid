import { Alert, AlertButton } from 'react-native';
import { confirmDeleteDream, confirmDeleteJournal } from './confirmDelete';

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

describe('confirmDeleteDream for a journal entry', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [true, "The recording and text will be permanently deleted. This can't be undone."],
    [false, "The text will be permanently deleted. This can't be undone."],
  ])('uses the entry title with the same body (audio %s)', (hasAudio, body) => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    confirmDeleteDream({ hasAudio, kind: 'journal', onConfirm: jest.fn(), onClose: jest.fn() });
    expect(spy.mock.calls[0][0]).toBe('Delete this entry?');
    expect(spy.mock.calls[0][1]).toBe(body);
  });
});

describe('confirmDeleteJournal', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());
  const ask = (over: Partial<Parameters<typeof confirmDeleteJournal>[0]> = {}) => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    confirmDeleteJournal({
      name: 'Gratitude',
      entryCount: 5,
      hasAudio: false,
      onConfirm,
      onClose,
      ...over,
    });
    return { onConfirm, onClose };
  };

  it('names the journal in the title', () => {
    ask();
    expect(spy.mock.calls[0][0]).toBe('Delete "Gratitude"?');
  });

  it('states the entry count and that it cannot be undone, without mentioning recordings', () => {
    ask({ entryCount: 5, hasAudio: false });
    expect(spy.mock.calls[0][1]).toBe(
      "The journal and all 5 entries will be permanently deleted. This can't be undone.",
    );
  });

  it('counts drafts the same as finished entries (the caller passes the total)', () => {
    ask({ entryCount: 12 });
    expect(spy.mock.calls[0][1]).toContain('all 12 entries');
  });

  it('mentions recordings only when an entry has audio', () => {
    ask({ entryCount: 3, hasAudio: true });
    expect(spy.mock.calls[0][1]).toBe(
      "The journal, all 3 entries and their recordings will be permanently deleted. This can't be undone.",
    );
    spy.mockClear();
    ask({ entryCount: 3, hasAudio: false });
    expect(spy.mock.calls[0][1]).not.toMatch(/recording/);
  });

  it('has singular and empty wording', () => {
    ask({ entryCount: 1 });
    expect(spy.mock.calls[0][1]).toBe(
      "The journal and its entry will be permanently deleted. This can't be undone.",
    );
    ask({ entryCount: 1, hasAudio: true });
    expect(spy.mock.calls[1][1]).toBe(
      "The journal, its entry and the recording will be permanently deleted. This can't be undone.",
    );
    ask({ entryCount: 0 });
    expect(spy.mock.calls[2][1]).toBe(
      "This journal has no entries. It will be permanently deleted. This can't be undone.",
    );
  });

  it('has Keep (cancel) and Delete (destructive)', () => {
    ask();
    expect(buttons().map((b) => [b.text, b.style])).toEqual([
      ['Keep', 'cancel'],
      ['Delete', 'destructive'],
    ]);
  });

  it('Keep closes without confirming', () => {
    const { onConfirm, onClose } = ask();
    buttons()[0].onPress?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Delete closes, then confirms', () => {
    const order: string[] = [];
    ask({ onConfirm: () => order.push('confirm'), onClose: () => order.push('close') });
    buttons()[1].onPress?.();
    expect(order).toEqual(['close', 'confirm']);
  });

  it('dismissing by tapping outside closes without confirming', () => {
    const { onConfirm, onClose } = ask();
    spy.mock.calls[0][3]?.onDismiss?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
