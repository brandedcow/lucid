import * as Sharing from 'expo-sharing';

import { ShareUnavailableError, shareRecording } from './shareRecording';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const isAvailable = Sharing.isAvailableAsync as jest.Mock;
const share = Sharing.shareAsync as jest.Mock;

const options = {
  mimeType: 'audio/mp4',
  UTI: 'public.mpeg-4-audio',
  dialogTitle: 'Share voice note',
};

describe('shareRecording', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAvailable.mockResolvedValue(true);
    share.mockResolvedValue(undefined);
  });

  it('shares a cache uri with the audio mime type and UTI', async () => {
    const uri = 'file:///var/mobile/Caches/recording-1.m4a';
    await shareRecording(uri);
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith(uri, options);
  });

  it('shares a stored dreams/ uri unchanged', async () => {
    const uri = 'file:///var/mobile/Documents/dreams/abc.m4a';
    await shareRecording(uri);
    expect(share).toHaveBeenCalledWith(uri, options);
  });

  it('throws ShareUnavailableError and does not share when unavailable', async () => {
    isAvailable.mockResolvedValue(false);
    const promise = shareRecording('file:///x.m4a');
    await expect(promise).rejects.toBeInstanceOf(ShareUnavailableError);
    await expect(promise).rejects.toMatchObject({ name: 'ShareUnavailableError' });
    expect(share).not.toHaveBeenCalled();
  });

  it('propagates a share rejection', async () => {
    const failure = new Error('share failed');
    share.mockRejectedValue(failure);
    await expect(shareRecording('file:///x.m4a')).rejects.toBe(failure);
  });
});
