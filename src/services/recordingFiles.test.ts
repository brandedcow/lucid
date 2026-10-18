import * as fakeFs from '../test/fakeFileSystem';
import { discardRecording } from './recordingFiles';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const { __fs } = fakeFs;
const RECORDING = 'file:///cache/recording.m4a';

beforeEach(() => {
  __fs.reset();
  __fs.put(RECORDING, 'audio-bytes');
});

describe('discardRecording', () => {
  it('deletes an unsaved recording', () => {
    discardRecording(RECORDING);
    expect(__fs.has(RECORDING)).toBe(false);
  });

  it('does nothing if the file is already gone', () => {
    discardRecording('file:///cache/missing.m4a');
  });
});
