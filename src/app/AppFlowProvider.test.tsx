import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { __fs } from '../test/fakeFileSystem';
import { AppFlowProvider, useAppFlow } from './AppFlowProvider';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
  RecordingPresets: { HIGH_QUALITY: {} },
}));

function Probe() {
  const { current, startCapture, openDraft, navigationRef, entry, finishSystemLeave, allowLeave } =
    useAppFlow();
  return (
    <>
      <Text>{`current:${String(current)}`}</Text>
      <Text>{`ready:${navigationRef.isReady()}`}</Text>
      <Text>{`session:${entry.session ? 'open' : 'none'}`}</Text>
      <Text>{`allowLeave:${allowLeave}`}</Text>
      <Pressable
        onPress={() => {
          finishSystemLeave();
          finishSystemLeave();
        }}
      >
        <Text>finish-twice</Text>
      </Pressable>
      <Pressable onPress={() => startCapture('dreams')}>
        <Text>start</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          openDraft({
            id: 'd',
            createdAt: 'c',
            durationMs: 0,
            title: 't',
            tags: [],
            status: 'draft',
          })
        }
      >
        <Text>draft</Text>
      </Pressable>
    </>
  );
}

describe('AppFlowProvider without a navigator', () => {
  it('opening the add page while the container is not ready does nothing and does not throw', async () => {
    __fs.reset();
    // Auto-open off: the launch settles on Today, so any "add" below could only come from openAdd.
    __fs.put('file:///document/settings.json', JSON.stringify({ autoOpenDreamCapture: false }));
    await render(
      <AppFlowProvider>
        <Probe />
      </AppFlowProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('current:today')).toBeTruthy();
    expect(screen.getByText('ready:false')).toBeTruthy();
    await fireEvent.press(screen.getByText('start'));
    await fireEvent.press(screen.getByText('draft'));
    expect(screen.getByText('current:today')).toBeTruthy();
  });

  it('finishSystemLeave clears the session and is safe to run twice; allowLeave stays down off the Add route', async () => {
    __fs.reset();
    __fs.put('file:///document/settings.json', JSON.stringify({ autoOpenDreamCapture: false }));
    await render(
      <AppFlowProvider>
        <Probe />
      </AppFlowProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await fireEvent.press(screen.getByText('start'));
    expect(screen.getByText('session:open')).toBeTruthy();
    await fireEvent.press(screen.getByText('finish-twice'));
    expect(screen.getByText('session:none')).toBeTruthy();
    expect(screen.getByText('allowLeave:false')).toBeTruthy();
    expect(__fs.read('file:///document/no-dream.json')).toBeUndefined();
  });
});
