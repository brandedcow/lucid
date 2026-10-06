import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler } from 'react-native';
import App from './App';
import { discardRecording, saveDream } from './src/services/dreamStorage';

jest.mock('expo-file-system', () => jest.requireActual('./src/test/fakeFileSystem'));
// The real provider renders nothing until it measures the screen, which never happens in tests.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
}));
jest.mock('./src/services/dreamStorage', () => ({
  discardRecording: jest.fn(),
  dreamAudioUri: jest.fn(),
  saveDream: jest.fn(),
  isIndexUnreadableError: () => false,
}));

// The heavy screens are replaced by small stubs that expose their callbacks as buttons.
jest.mock('./src/screens/CaptureScreen', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    CaptureScreen: ({ onRecorded, onWrite }: any) => (
      <View>
        <Text>capture-screen</Text>
        <Pressable
          onPress={() => onRecorded({ uri: 'file:///cache/r.m4a', durationMs: 7000 }, 'live')}
        >
          <Text>stub-save-recording</Text>
        </Pressable>
        <Pressable onPress={() => onRecorded({ uri: 'file:///cache/e.m4a', durationMs: 7000 }, '')}>
          <Text>stub-save-recording-no-text</Text>
        </Pressable>
        <Pressable onPress={onWrite}>
          <Text>stub-write</Text>
        </Pressable>
      </View>
    ),
  };
});
jest.mock('./src/screens/ReviewScreen', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    ReviewScreen: (p: any) => (
      <View>
        <Text>review-screen</Text>
        <Text>{`transcript:${p.transcript}`}</Text>
        <Text>{`title:${p.title}`}</Text>
        <Text>{`audio:${p.audio ? p.audio.uri : 'none'}`}</Text>
        <Text>{`date:${p.date}`}</Text>
        <Text>{`saving:${p.saving}`}</Text>
        <Pressable onPress={() => p.onTitleChange('My title')}>
          <Text>stub-set-title</Text>
        </Pressable>
        <Pressable onPress={p.onBack}>
          <Text>stub-review-back</Text>
        </Pressable>
        <Pressable onPress={p.onEditTranscript}>
          <Text>stub-edit</Text>
        </Pressable>
        <Pressable onPress={p.onDone}>
          <Text>stub-done</Text>
        </Pressable>
        <Pressable onPress={p.onFinishLater}>
          <Text>stub-finish-later</Text>
        </Pressable>
      </View>
    ),
  };
});
jest.mock('./src/screens/DreamListScreen', () => {
  const { Text } = require('react-native');
  const { Pressable } = require('react-native');
  const draft = {
    id: '42',
    createdAt: '2026-10-05T08:00:00.000Z',
    durationMs: 9000,
    audioFileName: '42.m4a',
    title: 'Flooded hall',
    tags: [],
    transcript: 'it filled up',
    status: 'draft',
  };
  return {
    DreamListScreen: ({ onOpenDraft }: any) => (
      <>
        <Text>list-screen</Text>
        <Pressable onPress={() => onOpenDraft(draft)}>
          <Text>stub-open-draft</Text>
        </Pressable>
      </>
    ),
  };
});

let addListener: jest.SpyInstance;
const hardwareBack = async (): Promise<boolean> => {
  const calls = addListener.mock.calls;
  const handler = calls[calls.length - 1][1] as () => boolean;
  let result = false;
  await act(async () => {
    result = handler();
  });
  return result;
};

const press = (label: string) => fireEvent.press(screen.getByText(label));
const lastAlertButtons = () =>
  (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(saveDream).mockResolvedValue({ id: '1', createdAt: 'c' } as any);
  addListener = jest.spyOn(BackHandler, 'addEventListener');
});
afterEach(() => jest.restoreAllMocks());

describe('App flow', () => {
  it('goes from a recording to Read it back with the live text, then to Review', async () => {
    await render(<App />);
    await press('stub-save-recording');
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(screen.getByLabelText('Dream text').props.value).toBe('live');
    expect(screen.getByLabelText('Play recording')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Dream text'), 'live, edited');
    await press('Continue');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('transcript:live, edited')).toBeTruthy();
    expect(screen.getByText('audio:file:///cache/r.m4a')).toBeTruthy();
  });

  it('Write instead opens Read it back focused, with no audio', async () => {
    await render(<App />);
    await press('stub-write');
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(screen.getByLabelText('Dream text').props.autoFocus).toBe(true);
    expect(screen.queryByLabelText('Play recording')).toBeNull();
  });

  it('a recording with no live text does not autofocus and starts empty', async () => {
    await render(<App />);
    await press('stub-save-recording-no-text');
    expect(screen.getByLabelText('Dream text').props.value).toBe('');
    expect(screen.getByLabelText('Dream text').props.autoFocus).toBe(false);
  });

  it('keeps title and edited text across Review -> Edit -> Review, and Edit back skips the alert', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-edit');
    expect(screen.getByText('Read it back')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Dream text'), 'changed');

    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:My title')).toBeTruthy();
    expect(screen.getByText('transcript:changed')).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('Done saves the session as a finished dream, then clears it and shows the list', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingUri: 'file:///cache/r.m4a',
        status: 'saved',
        details: expect.objectContaining({ title: 'My title', transcript: 'live' }),
      }),
    );
    expect(screen.getByText('list-screen')).toBeTruthy();
  });

  it('Finish later saves a draft without a title, then shows the list', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-finish-later');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    expect(screen.getByText('list-screen')).toBeTruthy();
  });

  it('stays on Review with the session kept when saving fails', async () => {
    jest.mocked(saveDream).mockRejectedValue(new Error('disk full'));
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:My title')).toBeTruthy();
    expect(screen.getByText('saving:false')).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('shows today on Review for a new dream', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    expect(screen.getByText(`date:${dateLabel(new Date())}`)).toBeTruthy();
  });
});

const dateLabel = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** Saves a written dream as a draft so the list stub is on screen. */
async function reachList() {
  await render(<App />);
  await press('stub-write');
  await fireEvent.changeText(screen.getByLabelText('Dream text'), 'x');
  await press('Continue');
  await press('stub-finish-later');
  jest.mocked(saveDream).mockClear();
}

describe('App draft reopening', () => {
  it('opens a draft on Review with its fields and its created date', async () => {
    await reachList();
    await press('stub-open-draft');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('transcript:it filled up')).toBeTruthy();
    expect(screen.getByText('title:Flooded hall')).toBeTruthy();
    expect(
      screen.getByText(`date:${dateLabel(new Date('2026-10-05T08:00:00.000Z'))}`),
    ).toBeTruthy();
  });

  it('back from a reopened draft saves its edits as a draft and returns to the list', async () => {
    await reachList();
    await press('stub-open-draft');
    await press('stub-set-title');
    await press('stub-review-back');
    expect(saveDream).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '42',
        status: 'draft',
        details: expect.objectContaining({ title: 'My title' }),
      }),
    );
    expect(jest.mocked(saveDream).mock.calls[0][0]).not.toHaveProperty('recordingUri');
    expect(screen.getByText('list-screen')).toBeTruthy();
  });

  it('hardware back from a reopened draft does the same', async () => {
    await reachList();
    await press('stub-open-draft');
    expect(await hardwareBack()).toBe(true);
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: '42', status: 'draft' }));
    expect(screen.getByText('list-screen')).toBeTruthy();
  });

  it('stays on the draft when saving it on the way back fails', async () => {
    await reachList();
    await press('stub-open-draft');
    jest.mocked(saveDream).mockRejectedValue(new Error('disk full'));
    await press('stub-review-back');
    expect(Alert.alert).toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
  });
});

describe('App Review back while saving', () => {
  it('blocks the arrow and hardware back until the save finishes', async () => {
    let resolve: (v: unknown) => void = () => {};
    jest.mocked(saveDream).mockReturnValue(new Promise((r) => (resolve = r)) as any);
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(screen.getByText('saving:true')).toBeTruthy();

    await press('stub-review-back');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.queryByText('Read it back')).toBeNull();

    await act(async () => resolve({ id: '1', createdAt: 'c' }));
    expect(screen.getByText('list-screen')).toBeTruthy();
  });
});

describe('App back rules', () => {
  it('asks before discarding a recording; Keep leaves everything in place', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard this dream?',
      'Your recording and text will be deleted.',
      expect.any(Array),
    );
    const keep = lastAlertButtons().find((b) => b.text === 'Keep');
    expect(keep?.style).toBe('cancel');
    expect(keep?.onPress).toBeUndefined();
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
  });

  it('Discard deletes the cache recording, clears the session and returns to capture', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await fireEvent.press(screen.getByLabelText('Back'));
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(discardRecording).toHaveBeenCalledWith('file:///cache/r.m4a');
    expect(screen.getByText('capture-screen')).toBeTruthy();
    // A new Write instead starts clean.
    await press('stub-write');
    expect(screen.getByLabelText('Dream text').props.value).toBe('');
  });

  it('asks before discarding written text, and Discard does not delete any file', async () => {
    await render(<App />);
    await press('stub-write');
    await fireEvent.changeText(screen.getByLabelText('Dream text'), 'some words');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(discardRecording).not.toHaveBeenCalled();
    expect(screen.getByText('capture-screen')).toBeTruthy();
  });

  it('goes straight back to capture from an empty Write instead, with no alert', async () => {
    await render(<App />);
    await press('stub-write');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('capture-screen')).toBeTruthy();
  });

  it('Review back goes to Read it back with everything kept', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-review-back');
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(screen.getByLabelText('Dream text').props.value).toBe('live');
    // Back from here is a plain Read it back back: it asks again.
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    // And Continue still carries the title.
    await press('Continue');
    expect(screen.getByText('title:My title')).toBeTruthy();
  });
});

describe('App Android hardware back', () => {
  it('is not handled on capture or the list (default behavior)', async () => {
    await render(<App />);
    expect(await hardwareBack()).toBe(false);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(await hardwareBack()).toBe(false);
  });

  it('on Read it back shows the discard alert and is handled', async () => {
    await render(<App />);
    await press('stub-save-recording');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard this dream?',
      'Your recording and text will be deleted.',
      expect.any(Array),
    );
  });

  it('on an empty Write instead goes back to capture', async () => {
    await render(<App />);
    await press('stub-write');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('capture-screen')).toBeTruthy();
  });

  it('on Review goes to Read it back, and from Edit returns to Review', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('Read it back')).toBeTruthy();
    await press('Continue');
    await press('stub-edit');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
  });

  it('removes its listener on unmount', async () => {
    const remove = jest.fn();
    addListener.mockReturnValue({ remove });
    const view = await render(<App />);
    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });
});
