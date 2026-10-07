import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, AlertButton, BackHandler } from 'react-native';
import App from './App';
import { discardRecording, saveDream } from './src/services/dreamStorage';
import {
  DISCARD_CHANGES_DISCARD,
  DISCARD_CHANGES_KEEP,
  DISCARD_CHANGES_MESSAGE,
  DISCARD_CHANGES_TITLE,
} from './src/utils/sessionNavigation';

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
    CaptureScreen: ({ onRecorded, onWrite, onNoDream, onTypeInstead }: any) => (
      <View>
        <Text>capture-screen</Text>
        <Pressable onPress={onNoDream}>
          <Text>stub-no-dream</Text>
        </Pressable>
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
        <Pressable onPress={() => onTypeInstead('so far')}>
          <Text>stub-type-instead</Text>
        </Pressable>
        <Pressable onPress={() => onTypeInstead('')}>
          <Text>stub-type-instead-empty</Text>
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
        <Text>{`finishLater:${p.showFinishLater !== false}`}</Text>
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
jest.mock('./src/screens/DreamLogScreen', () => {
  const { Pressable, Text } = require('react-native');
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
    DreamLogScreen: ({ view, onOpenDream, onOpenDraft, onNewDream }: any) => (
      <>
        <Text>log-screen</Text>
        <Text>{`query:${view.query}`}</Text>
        <Text>{`searching:${view.searching}`}</Text>
        <Pressable onPress={() => onOpenDraft(draft)}>
          <Text>stub-open-draft</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDream('7')}>
          <Text>stub-open-dream</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDream('missing')}>
          <Text>stub-open-missing</Text>
        </Pressable>
        <Pressable onPress={() => onOpenDream('42')}>
          <Text>stub-open-draft-as-dream</Text>
        </Pressable>
        <Pressable onPress={onNewDream}>
          <Text>stub-new-dream</Text>
        </Pressable>
        <Pressable onPress={view.openSearch}>
          <Text>stub-open-search</Text>
        </Pressable>
        <Pressable onPress={() => view.setQuery('hall')}>
          <Text>stub-set-query</Text>
        </Pressable>
      </>
    ),
  };
});
jest.mock('./src/screens/DreamDetailScreen', () => {
  const { Pressable, Text } = require('react-native');
  return {
    DreamDetailScreen: ({ dream, onBack, onEdit }: any) => (
      <>
        <Text>detail-screen</Text>
        <Text>{`detail-title:${dream.title}`}</Text>
        <Pressable onPress={onBack}>
          <Text>stub-detail-back</Text>
        </Pressable>
        <Pressable onPress={onEdit}>
          <Text>stub-detail-edit</Text>
        </Pressable>
      </>
    ),
  };
});
// The library is faked so tests control what the log holds and when a refresh finishes.
const mockLibrary: { dreams: any[]; onRefresh?: () => Promise<void> | void } = { dreams: [] };
jest.mock('./src/hooks/useDreamLibrary', () => {
  const { useState } = require('react');
  return {
    useDreamLibrary: () => {
      const [dreams, setDreams] = useState(mockLibrary.dreams);
      return {
        dreams,
        indexStatus: 'ok',
        refresh: async () => {
          await mockLibrary.onRefresh?.();
          setDreams(mockLibrary.dreams);
        },
      };
    },
  };
});

const finishedDream = {
  id: '7',
  createdAt: '2026-10-01T08:00:00.000Z',
  durationMs: 5000,
  audioFileName: '7.m4a',
  title: 'Old title',
  emotion: '',
  tags: ['water'],
  transcript: 'old text',
};

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
  mockLibrary.dreams = [finishedDream];
  mockLibrary.onRefresh = undefined;
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

  it('Type instead opens Read it back with the text so far, focused, with no player', async () => {
    await render(<App />);
    await press('stub-type-instead');
    expect(screen.getByText('Read it back')).toBeTruthy();
    expect(screen.getByLabelText('Dream text').props.value).toBe('so far');
    expect(screen.getByLabelText('Dream text').props.autoFocus).toBe(true);
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    await press('Continue');
    expect(screen.getByText('transcript:so far')).toBeTruthy();
    expect(screen.getByText('audio:none')).toBeTruthy();
  });

  it('Type instead with no text opens an empty, focused box', async () => {
    await render(<App />);
    await press('stub-type-instead-empty');
    expect(screen.getByLabelText('Dream text').props.value).toBe('');
    expect(screen.getByLabelText('Dream text').props.autoFocus).toBe(true);
  });

  it('back from a Type instead dream asks to discard, and never deletes persisted audio', async () => {
    await render(<App />);
    await press('stub-type-instead');
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard this dream?',
      'Your recording and text will be deleted.',
      expect.any(Array),
    );
    await act(async () =>
      lastAlertButtons()
        .find((b) => b.text === 'Discard')
        ?.onPress?.(),
    );
    expect(discardRecording).not.toHaveBeenCalled();
    expect(screen.getByText('capture-screen')).toBeTruthy();
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

  it('Done saves the session as a finished dream, then clears it and shows the log', async () => {
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
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('Finish later saves a draft without a title, then shows the log', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-finish-later');
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    expect(screen.getByText('log-screen')).toBeTruthy();
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

/** Saves a written dream as a draft so the log stub is on screen. */
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

  it('back from a reopened draft saves its edits as a draft and returns to the log', async () => {
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
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('hardware back from a reopened draft does the same', async () => {
    await reachList();
    await press('stub-open-draft');
    expect(await hardwareBack()).toBe(true);
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: '42', status: 'draft' }));
    expect(screen.getByText('log-screen')).toBeTruthy();
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
    expect(screen.getByText('log-screen')).toBeTruthy();
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
  it('is not handled on capture (default behavior, exits)', async () => {
    await render(<App />);
    expect(await hardwareBack()).toBe(false);
  });

  it('after saving to the log goes to capture, and capture then exits', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('capture-screen')).toBeTruthy();
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

/** Capture -> No dream -> log, then opens the finished dream on its detail screen. */
async function reachDetail() {
  await render(<App />);
  await press('stub-no-dream');
  await press('stub-open-dream');
}

/** Detail -> Edit: an edit session on Review. */
async function reachEdit() {
  await reachDetail();
  await press('stub-detail-edit');
}

describe('App Dream log and detail', () => {
  it('opens on capture, and No dream goes to the log', async () => {
    await render(<App />);
    expect(screen.getByText('capture-screen')).toBeTruthy();
    await press('stub-no-dream');
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('New dream goes to capture without resetting the log view state', async () => {
    await render(<App />);
    await press('stub-no-dream');
    await press('stub-open-search');
    await press('stub-set-query');
    await press('stub-new-dream');
    expect(screen.getByText('capture-screen')).toBeTruthy();
    await press('stub-no-dream');
    expect(screen.getByText('query:hall')).toBeTruthy();
    expect(screen.getByText('searching:true')).toBeTruthy();
  });

  it('a row tap opens that dream on the detail screen', async () => {
    await reachDetail();
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.getByText('detail-title:Old title')).toBeTruthy();
  });

  it('detail back returns to the log with the view state kept', async () => {
    await render(<App />);
    await press('stub-no-dream');
    await press('stub-set-query');
    await press('stub-open-dream');
    await press('stub-detail-back');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.getByText('query:hall')).toBeTruthy();
  });

  it('hardware back on detail goes to the log and is handled', async () => {
    await reachDetail();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('hardware back on the log closes an open search first, then goes to capture', async () => {
    await render(<App />);
    await press('stub-no-dream');
    await press('stub-open-search');
    await press('stub-set-query');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('searching:false')).toBeTruthy();
    expect(screen.getByText('query:')).toBeTruthy();
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('capture-screen')).toBeTruthy();
    expect(await hardwareBack()).toBe(false);
  });

  it('hardware back on the log with search closed goes to capture and keeps the view state', async () => {
    await render(<App />);
    await press('stub-no-dream');
    await press('stub-set-query');
    expect(await hardwareBack()).toBe(true);
    expect(screen.getByText('capture-screen')).toBeTruthy();
    await press('stub-no-dream');
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(screen.getByText('query:hall')).toBeTruthy();
  });

  it('falls back to the log when the detail dream is missing or a draft', async () => {
    mockLibrary.dreams = [finishedDream, { ...finishedDream, id: '42', status: 'draft' }];
    await render(<App />);
    await press('stub-no-dream');
    await press('stub-open-missing');
    expect(screen.queryByText('detail-screen')).toBeNull();
    expect(screen.getByText('log-screen')).toBeTruthy();
    await press('stub-open-draft-as-dream');
    expect(screen.queryByText('detail-screen')).toBeNull();
    expect(screen.getByText('log-screen')).toBeTruthy();
  });
});

describe('App edit flow', () => {
  it('Edit opens Review as an edit session with Finish later hidden', async () => {
    await reachEdit();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:Old title')).toBeTruthy();
    expect(screen.getByText('transcript:old text')).toBeTruthy();
    expect(screen.getByText('finishLater:false')).toBeTruthy();
  });

  it('a new dream still offers Finish later', async () => {
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    expect(screen.getByText('finishLater:true')).toBeTruthy();
  });

  it('Done with no edits writes nothing and returns to detail', async () => {
    await reachEdit();
    await press('stub-done');
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.getByText('detail-title:Old title')).toBeTruthy();
  });

  it('Done with changes saves as saved with full strings, refreshes and shows the new dream', async () => {
    mockLibrary.onRefresh = () => {
      mockLibrary.dreams = [{ ...finishedDream, title: 'My title' }];
    };
    await reachEdit();
    await press('stub-set-title');
    await press('stub-done');
    expect(saveDream).toHaveBeenCalledTimes(1);
    const arg = jest.mocked(saveDream).mock.calls[0][0] as any;
    expect(arg).toMatchObject({
      id: '7',
      status: 'saved',
      details: { title: 'My title', emotion: '', tags: ['water'], transcript: 'old text' },
    });
    expect(arg).not.toHaveProperty('recordingUri');
    expect(screen.getByText('detail-screen')).toBeTruthy();
    expect(screen.getByText('detail-title:My title')).toBeTruthy();
  });

  it('never saves a draft for an edit session (Finish later, back, hardware back)', async () => {
    await reachEdit();
    await press('stub-finish-later');
    expect(saveDream).not.toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
    await press('stub-set-title');
    await press('stub-review-back');
    await hardwareBack();
    expect(jest.mocked(saveDream).mock.calls.some(([a]) => a.status === 'draft')).toBe(false);
    expect(saveDream).not.toHaveBeenCalled();
  });

  it('stays on Review with the session kept when saving the edit fails', async () => {
    jest.mocked(saveDream).mockRejectedValue(new Error('disk full'));
    await reachEdit();
    await press('stub-set-title');
    await press('stub-done');
    expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.');
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:My title')).toBeTruthy();
  });

  it('back with edits asks first; Keep editing stays on Review', async () => {
    await reachEdit();
    await press('stub-set-title');
    await press('stub-review-back');
    expect(Alert.alert).toHaveBeenCalledWith(
      DISCARD_CHANGES_TITLE,
      DISCARD_CHANGES_MESSAGE,
      expect.any(Array),
    );
    const keep = lastAlertButtons().find((b) => b.text === DISCARD_CHANGES_KEEP);
    expect(keep?.style).toBe('cancel');
    expect(keep?.onPress).toBeUndefined();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.getByText('title:My title')).toBeTruthy();
  });

  it('Discard clears the edit and returns to detail with the stored dream', async () => {
    await reachEdit();
    await press('stub-set-title');
    await press('stub-review-back');
    const discard = lastAlertButtons().find((b) => b.text === DISCARD_CHANGES_DISCARD);
    expect(discard?.style).toBe('destructive');
    await act(async () => discard?.onPress?.());
    expect(screen.getByText('detail-title:Old title')).toBeTruthy();
    expect(saveDream).not.toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();
    // The session is gone: Edit starts again from the stored values.
    await press('stub-detail-edit');
    expect(screen.getByText('title:Old title')).toBeTruthy();
  });

  it('back and hardware back without edits go straight to detail', async () => {
    await reachEdit();
    await press('stub-review-back');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('detail-screen')).toBeTruthy();
    await press('stub-detail-edit');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('detail-screen')).toBeTruthy();
  });

  it('hardware back with edits shows the same alert', async () => {
    await reachEdit();
    await press('stub-set-title');
    expect(await hardwareBack()).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      DISCARD_CHANGES_TITLE,
      DISCARD_CHANGES_MESSAGE,
      expect.any(Array),
    );
  });

  it('Edit text then back returns to Review with no confirmation', async () => {
    await reachEdit();
    await press('stub-edit');
    expect(screen.getByText('Read it back')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(discardRecording).not.toHaveBeenCalled();
  });
});

describe('App refresh before leaving', () => {
  it('awaits the library refresh before leaving Review after Done', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-set-title');
    await press('stub-done');
    expect(saveDream).toHaveBeenCalled();
    expect(screen.getByText('review-screen')).toBeTruthy();
    expect(screen.queryByText('log-screen')).toBeNull();
    await act(async () => finishRefresh());
    expect(screen.getByText('log-screen')).toBeTruthy();
  });

  it('awaits the refresh for Finish later and for a draft back, and blocks back meanwhile', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await render(<App />);
    await press('stub-save-recording');
    await press('Continue');
    await press('stub-finish-later');
    expect(screen.getByText('review-screen')).toBeTruthy();
    // A second back while the refresh is pending must not save again.
    await press('stub-review-back');
    expect(saveDream).toHaveBeenCalledTimes(1);
    await act(async () => finishRefresh());
    expect(screen.getByText('log-screen')).toBeTruthy();

    jest.mocked(saveDream).mockClear();
    await press('stub-open-draft');
    await press('stub-review-back');
    expect(screen.getByText('review-screen')).toBeTruthy();
    await act(async () => finishRefresh());
    expect(screen.getByText('log-screen')).toBeTruthy();
    expect(saveDream).toHaveBeenCalledWith(expect.objectContaining({ id: '42', status: 'draft' }));
  });

  it('awaits the refresh before returning to detail after an edit', async () => {
    let finishRefresh: () => void = () => {};
    mockLibrary.onRefresh = () => new Promise<void>((r) => (finishRefresh = r));
    await reachEdit();
    await press('stub-set-title');
    await press('stub-done');
    expect(screen.getByText('review-screen')).toBeTruthy();
    await act(async () => finishRefresh());
    expect(screen.getByText('detail-screen')).toBeTruthy();
  });
});
