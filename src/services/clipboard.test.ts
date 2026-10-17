import * as Clipboard from 'expo-clipboard';

import { copyText } from './clipboard';

const setString = Clipboard.setStringAsync as jest.Mock;

describe('copyText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setString.mockResolvedValue(true);
  });

  it('calls setStringAsync with the exact text', async () => {
    const text = '  Flying over a lake.\n\nThen I woke up. \u{1F30A}  ';
    await copyText(text);
    expect(setString).toHaveBeenCalledTimes(1);
    expect(setString).toHaveBeenCalledWith(text);
  });

  it('resolves to undefined', async () => {
    await expect(copyText('x')).resolves.toBeUndefined();
  });

  it('propagates a rejection', async () => {
    const failure = new Error('clipboard failed');
    setString.mockRejectedValue(failure);
    await expect(copyText('x')).rejects.toBe(failure);
  });
});
