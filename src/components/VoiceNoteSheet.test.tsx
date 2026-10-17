import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert, BackHandler, Platform, ScrollView, StyleSheet } from 'react-native';
import { stopAllPlayback } from '../hooks/useRecordingPlayback';
import { copyText } from '../services/clipboard';
import { createFakeTranscription } from '../test/fakeTranscription';
import { shareRecording, ShareUnavailableError } from '../services/shareRecording';
import { iconCircle } from '../theme';
import { SheetNote, VoiceNoteSheet } from './VoiceNoteSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

jest.mock('../services/clipboard', () => ({ copyText: jest.fn() }));

jest.mock('../services/shareRecording', () => ({
  ...jest.requireActual('../services/shareRecording'),
  shareRecording: jest.fn(),
}));

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(),
  setPlaybackRate: jest.fn(),
};
let mockStatus = { playing: false, currentTime: 0, duration: 0 };
const mockUseAudioPlayer = jest.fn((..._args: unknown[]) => mockPlayer);
jest.mock('expo-audio', () => ({
  useAudioPlayer: (...args: unknown[]) => mockUseAudioPlayer(...args),
  useAudioPlayerStatus: () => mockStatus,
  setAudioModeAsync: jest.fn(),
}));

const NOW = new Date();
const note: SheetNote = {
  id: 'n1',
  uri: 'file:///cache/r1.m4a',
  durationMs: 12_000,
  waveform: [0.2, 0.6, 0.9, 0.4],
  recordedAt: NOW,
};
const three: SheetNote[] = [1, 2, 3].map((n) => ({
  id: `n${n}`,
  uri: `file:///cache/r${n}.m4a`,
  durationMs: n * 10_000,
  waveform: [0.5, 0.7],
  recordedAt: NOW,
}));
const onClose = jest.fn();
const onRemove = jest.fn();

const renderSheet = async (props: Partial<Parameters<typeof VoiceNoteSheet>[0]> = {}) =>
  render(
    <VoiceNoteSheet
      notes={[note]}
      initialIndex={0}
      onClose={onClose}
      onRemove={onRemove}
      {...props}
    />,
  );

let backHandler: (() => boolean | null | undefined) | null = null;
const removeBack = jest.fn();
let addSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = { playing: false, currentTime: 0, duration: 12 };
  backHandler = null;
  addSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
    backHandler = handler as typeof backHandler;
    return { remove: removeBack };
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(shareRecording).mockResolvedValue(undefined);
  jest.mocked(copyText).mockResolvedValue(undefined);
});
afterEach(() => {
  addSpy.mockRestore();
  jest.restoreAllMocks();
});

describe('header and info', () => {
  it('shows the title, the length and the recorded time', async () => {
    await renderSheet();
    expect(screen.getByText('Audio Recording')).toBeTruthy();
    expect(screen.getByTestId('voice-note-subtitle').props.children).toMatch(
      /^00:12 · Today, \d{1,2}:\d{2} [AP]M$/,
    );
  });

  it('leaves the time out when none is known', async () => {
    await renderSheet({ notes: [{ ...note, recordedAt: null }] });
    expect(screen.getByTestId('voice-note-subtitle').props.children).toBe('00:12');
  });

  it('has no transcript toggle, no menu and no dots', async () => {
    await renderSheet();
    expect(screen.queryByLabelText('More options')).toBeNull();
    expect(screen.queryByTestId('voice-note-dots')).toBeNull();
    expect(screen.queryByLabelText(/transcript/i)).toBeNull();
  });

  it('draws the time ticks under the waveform', async () => {
    await renderSheet();
    const ticks = screen.getByTestId('voice-note-ticks');
    // 12 s: a mark every 5 s (0:00, 0:05, 0:10).
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByText('0:05')).toBeTruthy();
    expect(screen.getByText('0:10')).toBeTruthy();
    expect(ticks).toBeTruthy();
  });

  it('draws one bar per peak, or a plain bar without a waveform, with a playhead either way', async () => {
    const view = await renderSheet();
    expect(screen.getAllByTestId('wave-bar')).toHaveLength(4);
    expect(screen.getByTestId('sheet-playhead')).toBeTruthy();
    await view.unmount();
    await renderSheet({ notes: [{ ...note, waveform: undefined }] });
    expect(screen.queryAllByTestId('wave-bar')).toHaveLength(0);
    expect(screen.getByTestId('progress-fill')).toBeTruthy();
    expect(screen.getByTestId('sheet-playhead')).toBeTruthy();
  });
});

describe('clock and playback', () => {
  it('shows the elapsed time with centiseconds and the playhead at the position', async () => {
    mockStatus = { playing: true, currentTime: 1.7, duration: 12 };
    await renderSheet();
    expect(screen.getByTestId('voice-note-clock').props.children).toBe('00:01.70');
    const left = screen.getByTestId('sheet-playhead').props.style;
    expect(JSON.stringify(left)).toContain(`${(1.7 / 12) * 100}%`);
  });

  it('asks for the fine update interval', async () => {
    await renderSheet();
    expect(mockUseAudioPlayer).toHaveBeenCalledWith(note.uri, { updateInterval: 50 });
  });

  it('plays from the play button', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Play audio recording'));
    await act(async () => {});
    expect(mockPlayer.play).toHaveBeenCalled();
  });

  it('pauses from the pause button while playing', async () => {
    mockStatus = { playing: true, currentTime: 2, duration: 12 };
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Pause audio recording'));
    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  it('skips 15 s back and forward, clamped to the recording', async () => {
    mockStatus = { playing: false, currentTime: 20, duration: 40 };
    const view = await renderSheet({ notes: [{ ...note, durationMs: 40_000 }] });
    await fireEvent.press(screen.getByLabelText('Forward 15 seconds'));
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(35);
    await fireEvent.press(screen.getByLabelText('Back 15 seconds'));
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(5);
    mockStatus = { playing: false, currentTime: 5, duration: 40 };
    await view.rerender(
      <VoiceNoteSheet
        notes={[{ ...note, durationMs: 40_000 }]}
        initialIndex={0}
        onClose={onClose}
        onRemove={onRemove}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Back 15 seconds'));
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
  });

  it('cycles the speed 1x, 1.5x, 2x, 0.75x, 1x and applies each rate to the player', async () => {
    await renderSheet();
    const speed = () => screen.getByLabelText(/Playback speed/);
    expect(speed().props.accessibilityLabel).toBe('Playback speed 1x');
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await fireEvent.press(speed());
      seen.push(speed().props.accessibilityLabel);
    }
    expect(seen).toEqual([
      'Playback speed 1.5x',
      'Playback speed 2x',
      'Playback speed 0.75x',
      'Playback speed 1x',
    ]);
    expect(mockPlayer.setPlaybackRate.mock.calls.map((c) => c[0])).toEqual([1.5, 2, 0.75, 1]);
  });

  it('the press area is 96pt tall and a tap at the top and at the bottom of it seeks', async () => {
    await renderSheet();
    const press = screen.getByTestId('seek-press');
    const heightOf = (el: { props: { style?: unknown } }) =>
      Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean)).height;
    expect(heightOf(press)).toBe(96);
    expect(heightOf(screen.getByTestId('seek-bar'))).toBe(96);
    await fireEvent(press, 'layout', { nativeEvent: { layout: { width: 200, height: 96 } } });
    // Only locationX matters; the full height is the press target.
    await fireEvent.press(press, { nativeEvent: { locationX: 50, locationY: 1 } });
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(3);
    await fireEvent.press(press, { nativeEvent: { locationX: 150, locationY: 95 } });
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(9);
  });

  it('seeks when the bar is tapped', async () => {
    await renderSheet();
    const press = screen.getByTestId('seek-press');
    await fireEvent(press, 'layout', { nativeEvent: { layout: { width: 200, height: 40 } } });
    await fireEvent.press(press, { nativeEvent: { locationX: 100 } });
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(6);
  });

  it('scrubs: pauses a playing note on touch down, previews the finger, seeks once on release', async () => {
    mockStatus = { playing: true, currentTime: 1, duration: 12 };
    await renderSheet();
    lastX = null;
    await fireEvent(screen.getByTestId('seek-press'), 'layout', {
      nativeEvent: { layout: { width: 200, height: 40 } },
    });
    const h = screen.getByTestId('seek-bar').props;
    expect(h.onMoveShouldSetResponderCapture(touch(50, 50, 70))).toBe(true);
    await act(async () => h.onResponderGrant(touch(50, 50, 50)));
    expect(mockPlayer.pause).toHaveBeenCalled();
    await act(async () => h.onResponderMove(touch(50, 50, 100)));
    // The clock follows the finger (0.5 of 12 s), with no seek yet.
    expect(screen.getByTestId('voice-note-clock').props.children).toBe('00:06.00');
    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
    await act(async () => h.onResponderRelease(touch(50, 50, 100)));
    expect(mockPlayer.seekTo).toHaveBeenCalledTimes(1);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(6);
  });

  it('disables play and skipping while a recording is running', async () => {
    await renderSheet({ playDisabled: true });
    expect(screen.getByLabelText('Play audio recording').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getByLabelText('Forward 15 seconds').props.accessibilityState.disabled).toBe(
      true,
    );
  });
});

/** A touch history for one finger that went down at pageX0 and is now at pageX. */
let clock = 0;
let lastX: number | null = null;
const touch = (locationX: number, pageX0: number, pageX: number) => {
  clock += 1;
  const previous = lastX ?? pageX0;
  lastX = pageX;
  return {
    nativeEvent: { locationX, touches: [{}], changedTouches: [{}], timestamp: clock },
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: clock,
      numberActiveTouches: 1,
      touchBank: [
        {
          touchActive: true,
          startPageX: pageX0,
          startPageY: 0,
          startTimeStamp: 0,
          currentPageX: pageX,
          currentPageY: 0,
          currentTimeStamp: clock,
          previousPageX: previous,
          previousPageY: 0,
          previousTimeStamp: clock - 1,
        },
      ],
    },
  };
};

describe('back, close and stop', () => {
  it('registers Android back while open; back closes the view and is handled', async () => {
    await renderSheet();
    expect(addSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    expect(backHandler?.()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('removes its back handler when closed', async () => {
    const view = await renderSheet();
    await view.unmount();
    expect(removeBack).toHaveBeenCalled();
  });

  it('the back arrow closes', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Close voice note'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closing (unmounting) stops its own player', async () => {
    const view = await renderSheet();
    mockPlayer.pause.mockClear();
    await view.unmount();
    expect(mockPlayer.pause).toHaveBeenCalled();
  });

  it('is a modal layer', async () => {
    await renderSheet();
    expect(screen.getByTestId('voice-note-sheet').props.accessibilityViewIsModal).toBe(true);
  });
});

describe('trash', () => {
  it('reports the note id, with the card wording for the label', async () => {
    await renderSheet({ notes: three, initialIndex: 1 });
    await fireEvent.press(screen.getByLabelText('Remove voice note 2 of 3'));
    expect(onRemove).toHaveBeenCalledWith('n2');
  });

  it('uses "Remove recording" for a single note', async () => {
    await renderSheet();
    expect(screen.getByLabelText('Remove recording')).toBeTruthy();
  });

  it('is disabled while busy', async () => {
    await renderSheet({ busy: true });
    const trash = screen.getByLabelText('Remove recording');
    expect(trash.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(trash);
    expect(onRemove).not.toHaveBeenCalled();
  });
});

describe('share', () => {
  it('pauses playback, then shares the note uri', async () => {
    const order: string[] = [];
    mockPlayer.pause.mockImplementation(() => void order.push('pause'));
    jest.mocked(shareRecording).mockImplementation(async () => void order.push('share'));
    // Playback must be registered as active for stopAllPlayback to pause it.
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Play audio recording'));
    await act(async () => {});
    order.length = 0;
    await fireEvent.press(screen.getByLabelText('Share voice note'));
    await act(async () => {});
    expect(shareRecording).toHaveBeenCalledWith(note.uri);
    expect(order).toEqual(['pause', 'share']);
    stopAllPlayback();
  });

  it('is disabled while busy and shares nothing', async () => {
    await renderSheet({ busy: true });
    const share = screen.getByLabelText('Share voice note');
    expect(share.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(share);
    expect(shareRecording).not.toHaveBeenCalled();
  });

  it('shows a quiet alert when sharing is unavailable, and nothing else changes', async () => {
    jest.mocked(shareRecording).mockRejectedValue(new ShareUnavailableError());
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Share voice note'));
    await act(async () => {});
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not share',
      'Sharing is not available on this device.',
    );
    expect(onRemove).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Share voice note').props.accessibilityState.disabled).toBe(false);
  });

  it('shows a quiet alert when the share sheet rejects', async () => {
    jest.mocked(shareRecording).mockRejectedValue(new Error('boom'));
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Share voice note'));
    await act(async () => {});
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not share',
      'This voice note could not be shared.',
    );
  });

  it('two presses before a re-render share once; a press after it finishes shares again; a rejection resets the guard', async () => {
    let resolve: () => void = () => {};
    jest
      .mocked(shareRecording)
      .mockImplementationOnce(() => new Promise<void>((r) => (resolve = r)));
    await renderSheet();
    const button = screen.getByLabelText('Share voice note');
    // Both handlers run in one tick, before any re-render (the host's onClick calls the Pressable's onPress).
    const onPress = () => button.props.onClick({});
    await act(() => {
      onPress();
      onPress();
    });
    expect(shareRecording).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    await fireEvent.press(screen.getByLabelText('Share voice note'));
    expect(shareRecording).toHaveBeenCalledTimes(2);
    jest.mocked(shareRecording).mockRejectedValueOnce(new Error('boom'));
    await fireEvent.press(screen.getByLabelText('Share voice note'));
    expect(shareRecording).toHaveBeenCalledTimes(3);
    await fireEvent.press(screen.getByLabelText('Share voice note'));
    expect(shareRecording).toHaveBeenCalledTimes(4);
  });

  it('ignores a second tap while the share is open', async () => {
    let resolve: () => void = () => {};
    jest.mocked(shareRecording).mockReturnValue(new Promise<void>((r) => (resolve = r)));
    await renderSheet();
    // The first press stays pending (its act is not awaited) until the share resolves.
    const first = fireEvent.press(screen.getByLabelText('Share voice note'));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByLabelText('Share voice note').props.accessibilityState.disabled).toBe(true);
    expect(shareRecording).toHaveBeenCalledTimes(1);
    resolve();
    await first;
  });
});

describe('the pager', () => {
  const pager = () => screen.getByTestId('voice-note-pager');
  const WIDTH = 300;
  const layout = () =>
    fireEvent(pager(), 'layout', { nativeEvent: { layout: { width: WIDTH, height: 600 } } });
  const swipeTo = async (page: number) => {
    await fireEvent(pager(), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: page * WIDTH, y: 0 } },
    });
  };
  const titleIs = () => screen.getByTestId('voice-note-subtitle').props.children as string;
  const render3 = async (props: Partial<Parameters<typeof VoiceNoteSheet>[0]> = {}) => {
    const view = await renderSheet({ notes: three, ...props });
    await layout();
    return view;
  };

  it('opens on the tapped note, with a player on that page only', async () => {
    mockStatus = { playing: false, currentTime: 0, duration: 20 };
    await render3({ initialIndex: 1 });
    expect(titleIs()).toMatch(/^00:20 · /);
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(screen.getAllByTestId('voice-note-sheet-page')).toHaveLength(3);
    // The neighbours are static: no seek bar, no controls of their own.
    expect(screen.getAllByTestId('seek-bar')).toHaveLength(1);
    expect(
      screen.getAllByTestId('voice-note-placeholder', { includeHiddenElements: true }),
    ).toHaveLength(2);
    expect(screen.getAllByTestId('placeholder-bar', { includeHiddenElements: true })).toHaveLength(
      4,
    );
    // Every player ever created is the active page's.
    expect(mockUseAudioPlayer.mock.calls.every((c) => c[0] === three[1].uri)).toBe(true);
  });

  it('ending a swipe makes that page active, reports it, and pauses the previous player', async () => {
    const onIndexChange = jest.fn();
    mockStatus = { playing: true, currentTime: 2, duration: 10 };
    await render3({ onIndexChange });
    mockPlayer.pause.mockClear();
    mockStatus = { playing: false, currentTime: 0, duration: 20 };
    await swipeTo(1);
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(onIndexChange).toHaveBeenCalledWith(1, 'n2');
    expect(titleIs()).toMatch(/^00:20 · /);
    expect(screen.getByLabelText('Remove voice note 2 of 3')).toBeTruthy();
    expect(screen.getByLabelText('Play audio recording')).toBeTruthy();
    expect(screen.getAllByTestId('seek-bar')).toHaveLength(1);
    expect(mockUseAudioPlayer.mock.calls.at(-1)?.[0]).toBe(three[1].uri);
  });

  it('a settle on the same page or past the ends does nothing wrong', async () => {
    const onIndexChange = jest.fn();
    await render3({ onIndexChange });
    await swipeTo(0);
    expect(onIndexChange).not.toHaveBeenCalled();
    await swipeTo(9);
    expect(onIndexChange).toHaveBeenCalledWith(2, 'n3');
  });

  it('the speed carries over to the next note and is applied to its player', async () => {
    await render3();
    await fireEvent.press(screen.getByLabelText('Playback speed 1x'));
    expect(screen.getByLabelText('Playback speed 1.5x')).toBeTruthy();
    mockPlayer.setPlaybackRate.mockClear();
    await swipeTo(1);
    expect(screen.getByLabelText('Playback speed 1.5x')).toBeTruthy();
    expect(mockPlayer.setPlaybackRate).toHaveBeenCalledWith(1.5, 'high');
  });

  it('the next / previous buttons change page and are disabled at the ends', async () => {
    const onIndexChange = jest.fn();
    await render3({ onIndexChange });
    expect(screen.getByLabelText('Previous voice note').props.accessibilityState.disabled).toBe(
      true,
    );
    await fireEvent.press(screen.getByLabelText('Next voice note'));
    expect(onIndexChange).toHaveBeenLastCalledWith(1, 'n2');
    expect(screen.getByText('2 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next voice note'));
    expect(screen.getByLabelText('Next voice note').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Previous voice note'));
    expect(onIndexChange).toHaveBeenLastCalledWith(1, 'n2');
  });

  it('announces the position in a polite live region; the dots are decorative', async () => {
    await render3();
    const pos = screen.getByTestId('voice-note-position');
    expect(pos.props.accessibilityLiveRegion).toBe('polite');
    expect(pos.props.accessibilityLabel).toBe('Voice note 1 of 3');
    await swipeTo(2);
    expect(screen.getByTestId('voice-note-position').props.accessibilityLabel).toBe(
      'Voice note 3 of 3',
    );
    const dots = screen.getByTestId('voice-note-sheet-dots', { includeHiddenElements: true });
    expect(dots.props.importantForAccessibility).toBe('no');
  });

  it('a touch on the waveform turns paging off and releasing (or cancelling) turns it on', async () => {
    await render3();
    expect(pager().props.scrollEnabled).toBe(true);
    const wave = screen.getByTestId('voice-note-wave-block');
    await fireEvent(wave, 'touchStart');
    expect(pager().props.scrollEnabled).toBe(false);
    await fireEvent(wave, 'touchEnd');
    expect(pager().props.scrollEnabled).toBe(true);
    await fireEvent(wave, 'touchStart');
    expect(pager().props.scrollEnabled).toBe(false);
    await fireEvent(wave, 'touchCancel');
    expect(pager().props.scrollEnabled).toBe(true);
  });

  it('a note list change keeps the active note by id (a note before it is removed)', async () => {
    mockStatus = { playing: false, currentTime: 0, duration: 20 };
    const view = await render3({ initialIndex: 1 });
    await view.rerender(
      <VoiceNoteSheet
        notes={three.slice(1)}
        initialIndex={1}
        onClose={onClose}
        onRemove={onRemove}
      />,
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(titleIs()).toMatch(/^00:20 · /);
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('closes when the active note disappears', async () => {
    const view = await render3({ initialIndex: 1 });
    await view.rerender(
      <VoiceNoteSheet
        notes={[three[0], three[2]]}
        initialIndex={1}
        onClose={onClose}
        onRemove={onRemove}
      />,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('one note: no pager bar, no dots, paging is off', async () => {
    await renderSheet();
    expect(screen.queryByTestId('voice-note-pager-bar')).toBeNull();
    expect(screen.queryByLabelText('Next voice note')).toBeNull();
    expect(screen.queryByLabelText('Previous voice note')).toBeNull();
    expect(
      screen.queryByTestId('voice-note-sheet-dots', { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.getByTestId('voice-note-pager').props.scrollEnabled).toBe(false);
  });
});

describe('the pager: rest and settle', () => {
  const WIDTH = 300;
  const pager = () => screen.getByTestId('voice-note-pager');
  const ev = (x: number) => ({ nativeEvent: { contentOffset: { x, y: 0 } } });
  let scrollTo: jest.SpyInstance;
  const calls = () => scrollTo.mock.calls.map((c) => c[0]);
  const layout = (w = WIDTH) =>
    fireEvent(pager(), 'layout', { nativeEvent: { layout: { width: w, height: 600 } } });
  const mount = async (props: Partial<Parameters<typeof VoiceNoteSheet>[0]> = {}) => {
    const view = await renderSheet({ notes: three, ...props });
    await layout();
    return view;
  };

  beforeEach(() => {
    scrollTo = jest.spyOn(ScrollView.prototype as never, 'scrollTo');
  });

  it('passes the start offset on the first render', async () => {
    await renderSheet({ notes: three, initialIndex: 2 });
    const width = jest.requireActual('react-native').Dimensions.get('window').width as number;
    expect(pager().props.contentOffset).toEqual({ x: 2 * width, y: 0 });
  });

  it('re-rests until a scroll event confirms the offset, then stops', async () => {
    await mount({ initialIndex: 2 });
    const first = scrollTo.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    expect(calls().at(-1)).toMatchObject({ x: 2 * WIDTH, animated: false });
    // Same width again (the usual case on a device): rests again, nothing confirmed yet.
    await layout();
    expect(scrollTo.mock.calls.length).toBe(first + 1);
    await fireEvent(pager(), 'contentSizeChange', 3 * WIDTH, 600);
    expect(scrollTo.mock.calls.length).toBe(first + 2);
    // Content not yet wide enough: no call.
    await fireEvent(pager(), 'contentSizeChange', WIDTH, 600);
    expect(scrollTo.mock.calls.length).toBe(first + 2);
    await fireEvent(pager(), 'scroll', ev(2 * WIDTH - 0.5));
    await layout();
    await fireEvent(pager(), 'contentSizeChange', 3 * WIDTH, 600);
    expect(scrollTo.mock.calls.length).toBe(first + 2);
  });

  it('retries once after 100 ms when unconfirmed, and not after a confirmation or unmount', async () => {
    jest.useFakeTimers();
    try {
      const view = await mount({ initialIndex: 2 });
      const n = scrollTo.mock.calls.length;
      await act(async () => void jest.advanceTimersByTime(100));
      expect(scrollTo.mock.calls.length).toBe(n + 1);
      await act(async () => void jest.advanceTimersByTime(1000));
      expect(scrollTo.mock.calls.length).toBe(n + 1);
      await view.unmount();
      scrollTo.mockClear();
      await act(async () => void jest.advanceTimersByTime(1000));
      expect(scrollTo).not.toHaveBeenCalled();
      // Confirmed before the timer: no retry.
      await renderSheet({ notes: three, initialIndex: 1 });
      await layout();
      await fireEvent(pager(), 'scroll', ev(WIDTH));
      scrollTo.mockClear();
      await act(async () => void jest.advanceTimersByTime(200));
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rests again when a note before the active one is removed or restored', async () => {
    mockStatus = { playing: false, currentTime: 0, duration: 20 };
    const view = await mount({ initialIndex: 1 });
    await fireEvent(pager(), 'scroll', ev(WIDTH));
    scrollTo.mockClear();
    const re = (list: SheetNote[]) =>
      view.rerender(
        <VoiceNoteSheet notes={list} initialIndex={1} onClose={onClose} onRemove={onRemove} />,
      );
    await re(three.slice(1));
    expect(calls().at(-1)).toMatchObject({ x: 0, animated: false });
    await fireEvent(pager(), 'scroll', ev(0));
    await re(three);
    expect(calls().at(-1)).toMatchObject({ x: WIDTH, animated: false });
  });

  it('two quick Next presses move two pages and report each', async () => {
    const onIndexChange = jest.fn();
    await mount({ onIndexChange });
    const next = screen.getByLabelText('Next voice note');
    await act(async () => {
      next.props.onClick({});
      next.props.onClick({});
    });
    expect(onIndexChange.mock.calls).toEqual([
      [1, 'n2'],
      [2, 'n3'],
    ]);
    expect(screen.getByText('3 of 3')).toBeTruthy();
    // A third press at the end changes nothing, and Previous goes back one.
    await fireEvent.press(screen.getByLabelText('Previous voice note'));
    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('ignores an intermediate settle while an animated scroll is in flight', async () => {
    const onIndexChange = jest.fn();
    await mount({ onIndexChange });
    await fireEvent.press(screen.getByLabelText('Next voice note'));
    await fireEvent.press(screen.getByLabelText('Next voice note'));
    onIndexChange.mockClear();
    await fireEvent(pager(), 'momentumScrollEnd', ev(WIDTH));
    expect(onIndexChange).not.toHaveBeenCalled();
    expect(screen.getByText('3 of 3')).toBeTruthy();
    // The event at the target page ends the flight; a user swipe then settles normally.
    await fireEvent(pager(), 'momentumScrollEnd', ev(2 * WIDTH));
    await fireEvent(pager(), 'momentumScrollEnd', ev(0));
    expect(onIndexChange).toHaveBeenCalledWith(0, 'n1');
    expect(screen.getByText('1 of 3')).toBeTruthy();
  });

  it('a stuck in-flight flag clears after 500 ms', async () => {
    jest.useFakeTimers();
    try {
      const onIndexChange = jest.fn();
      await mount({ onIndexChange });
      await fireEvent.press(screen.getByLabelText('Next voice note'));
      onIndexChange.mockClear();
      await fireEvent(pager(), 'momentumScrollEnd', ev(0));
      expect(onIndexChange).not.toHaveBeenCalled();
      await act(async () => void jest.advanceTimersByTime(500));
      await fireEvent(pager(), 'momentumScrollEnd', ev(0));
      expect(onIndexChange).toHaveBeenCalledWith(0, 'n1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a drag end on a page boundary settles; between pages it does nothing; twice is a no-op', async () => {
    const onIndexChange = jest.fn();
    await mount({ onIndexChange });
    await fireEvent(pager(), 'scrollEndDrag', ev(WIDTH * 0.4));
    expect(onIndexChange).not.toHaveBeenCalled();
    await fireEvent(pager(), 'scrollEndDrag', ev(WIDTH + 0.5));
    expect(onIndexChange).toHaveBeenCalledTimes(1);
    expect(onIndexChange).toHaveBeenCalledWith(1, 'n2');
    await fireEvent(pager(), 'momentumScrollEnd', ev(WIDTH));
    expect(onIndexChange).toHaveBeenCalledTimes(1);
  });

  it('the speed goes back to 1x when the view is opened again', async () => {
    const view = await mount();
    await fireEvent.press(screen.getByLabelText('Playback speed 1x'));
    expect(screen.getByLabelText('Playback speed 1.5x')).toBeTruthy();
    await view.unmount();
    await renderSheet({ notes: three });
    expect(screen.getByLabelText('Playback speed 1x')).toBeTruthy();
  });

  it('a note added while open joins the pager and the active note stays', async () => {
    const view = await mount({ initialIndex: 1 });
    const extra: SheetNote = { id: 'n4', uri: 'file:///cache/r4.m4a', durationMs: 4000 };
    await view.rerender(
      <VoiceNoteSheet
        notes={[...three, extra]}
        initialIndex={1}
        onClose={onClose}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('2 of 4')).toBeTruthy();
    expect(screen.getAllByTestId('voice-note-sheet-page')).toHaveLength(4);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('transcript', () => {
  const withText: SheetNote = { ...note, voiceTranscript: 'I was flying over water' };
  type P = Partial<Parameters<typeof VoiceNoteSheet>[0]>;
  let fake = createFakeTranscription();
  let current: P = {};
  const view = (props: P) => {
    current = props;
    return (
      <VoiceNoteSheet
        notes={[note]}
        initialIndex={0}
        onClose={onClose}
        onRemove={onRemove}
        transcription={fake}
        {...props}
      />
    );
  };
  const show = async (props: P = {}) => render(view(props));
  const refresh = (v: Awaited<ReturnType<typeof show>>) => v.rerender(view(current));
  const toggle = () => screen.queryByLabelText(/^Show (transcript|waveform)$/);
  const open = async () => {
    await fireEvent.press(screen.getByLabelText('Show transcript'));
    await act(async () => {});
  };

  beforeEach(() => {
    fake = createFakeTranscription();
    onAddTranscript.mockClear();
  });
  const onAddTranscript = jest.fn();

  describe('with the default (unsupported) transcription', () => {
    it('hides the toggle and the menu, and never starts anything', async () => {
      await renderSheet();
      expect(toggle()).toBeNull();
      expect(screen.queryByLabelText('More options')).toBeNull();
      expect(screen.getByTestId('voice-note-wave-block')).toBeTruthy();
    });

    it('still shows the toggle and text for a note that has a transcript', async () => {
      await renderSheet({ notes: [withText] });
      await open();
      expect(screen.getByText('I was flying over water')).toBeTruthy();
      expect(screen.queryByText('Transcribe')).toBeNull();
    });
  });

  describe('controls row centring', () => {
    // Layout does not run under Jest, so assert the structure that centres play: the left and right
    // slots are identical flex-1 boxes (no padding or margin) around a symmetric back / play / forward
    // cluster, whether or not the toggle renders. Device-verified separately.
    const expectCentred = () => {
      const row = screen.getByTestId('voice-note-controls');
      const left = screen.getByTestId('voice-note-controls-left');
      const main = screen.getByTestId('voice-note-controls-main');
      const right = screen.getByTestId('voice-note-controls-right');
      const kids = row.props.children as { props: { testID: string } }[];
      expect(kids.map((c) => c.props.testID)).toEqual([
        'voice-note-controls-left',
        'voice-note-controls-main',
        'voice-note-controls-right',
      ]);
      expect(StyleSheet.flatten(left.props.style)).toEqual(StyleSheet.flatten(right.props.style));
      expect(left).toHaveStyle({ flex: 1 });
      expect(StyleSheet.flatten(left.props.style).padding).toBeUndefined();
      expect(StyleSheet.flatten(left.props.style).paddingHorizontal).toBeUndefined();
      expect(StyleSheet.flatten(left.props.style).margin).toBeUndefined();
      // The cluster is back, play, forward with equal-width skips, and is not itself flexible.
      expect(StyleSheet.flatten(main.props.style).flex).toBeUndefined();
      const back = screen.getByLabelText('Back 15 seconds');
      const fwd = screen.getByLabelText('Forward 15 seconds');
      expect(StyleSheet.flatten(back.props.style).width).toBe(
        StyleSheet.flatten(fwd.props.style).width,
      );
      expect(within(main).getByLabelText('Back 15 seconds')).toBe(back);
      expect(within(main).getByLabelText('Play audio recording')).toBeTruthy();
      expect(within(main).getByLabelText('Forward 15 seconds')).toBe(fwd);
      return { left, right };
    };

    it('keeps play centred with the toggle shown', async () => {
      await show({ notes: [withText] });
      const { left } = expectCentred();
      expect(within(left).getByLabelText('Show transcript')).toBeTruthy();
    });

    it('keeps play centred with the toggle hidden (empty left slot of the same width)', async () => {
      fake.setSupported(false);
      await show({ notes: [note] });
      expect(toggle()).toBeNull();
      const { left } = expectCentred();
      expect(within(left).queryByLabelText(/^Show /)).toBeNull();
    });
  });

  describe('toggle', () => {
    it('is shown when supported, even with no text', async () => {
      await show();
      expect(toggle()).toBeTruthy();
    });

    it('is shown for a note with text (even empty) when unsupported, hidden otherwise', async () => {
      fake.setSupported(false);
      const v = await show({ notes: [{ ...note, voiceTranscript: '' }] });
      expect(toggle()).toBeTruthy();
      await v.unmount();
      await show({ notes: [note] });
      expect(toggle()).toBeNull();
    });

    it('swaps the waveform for the transcript, keeping the clock, with labels, selected state and a filled icon', async () => {
      await show({ notes: [withText] });
      const off = screen.getByLabelText('Show transcript');
      expect(off.props.accessibilityState).toMatchObject({ selected: false });
      expect(screen.getByTestId('voice-note-wave-block')).toBeTruthy();
      expect(screen.getByTestId('voice-note-clock')).toBeTruthy();
      expect(
        StyleSheet.flatten(screen.getByTestId('transcript-bubble', { hidden: true }).props.style)
          .backgroundColor,
      ).toBe('transparent');
      await open();
      expect(screen.queryByTestId('voice-note-wave-block')).toBeNull();
      expect(screen.getByTestId('voice-note-clock')).toBeTruthy();
      const on = screen.getByLabelText('Show waveform');
      expect(on.props.accessibilityState).toMatchObject({ selected: true });
      expect(
        StyleSheet.flatten(screen.getByTestId('transcript-bubble', { hidden: true }).props.style)
          .backgroundColor,
      ).not.toBe('transparent');
      // The title, subtitle and player controls stay.
      expect(screen.getByText('Audio Recording')).toBeTruthy();
      expect(screen.getByLabelText('Play audio recording')).toBeTruthy();
      await fireEvent.press(on);
      expect(screen.getByTestId('voice-note-wave-block')).toBeTruthy();
    });

    it('is the first control, 44pt, before back 15 s', async () => {
      await show({ notes: [withText] });
      expect(screen.getByLabelText('Show transcript')).toHaveStyle({ width: 44, height: 44 });
      const labels = screen
        .getAllByRole('button')
        .map((b) => b.props.accessibilityLabel)
        .filter((l: string) => /transcript|Back 15|Play audio|Forward 15/.test(l));
      expect(labels).toEqual([
        'Show transcript',
        'Back 15 seconds',
        'Play audio recording',
        'Forward 15 seconds',
      ]);
    });

    it('stays open when paging to another note', async () => {
      const two = [withText, { ...three[1], voiceTranscript: 'second note text' }];
      await show({ notes: two });
      await open();
      await fireEvent.press(screen.getByLabelText('Next voice note'));
      await act(async () => {});
      expect(screen.getByText('second note text')).toBeTruthy();
      expect(screen.getByLabelText('Show waveform')).toBeTruthy();
      expect(screen.queryByTestId('voice-note-wave-block')).toBeNull();
    });

    it('falls back to the waveform when it can no longer show, and returns when it can again', async () => {
      const v = await show({ notes: [note] });
      await open();
      expect(screen.getByText('No transcript yet.')).toBeTruthy();
      fake.setSupported(false);
      await refresh(v);
      expect(toggle()).toBeNull();
      expect(screen.getByTestId('voice-note-wave-block')).toBeTruthy();
      fake.setSupported(true);
      await refresh(v);
      expect(screen.getByText('No transcript yet.')).toBeTruthy();
    });

    it('does not show transcripts on neighbouring placeholder pages', async () => {
      const two = [note, { ...three[1], voiceTranscript: 'second note text' }];
      await show({ notes: two });
      await open();
      expect(screen.queryByText('second note text')).toBeNull();
    });
  });

  describe('states', () => {
    it('starts transcribing once when the bubble is tapped on a note with none, with no Transcribe button', async () => {
      await show();
      expect(screen.queryByLabelText('Transcribe')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Show transcript'));
      await act(async () => {});
      expect(fake.start).toHaveBeenCalledTimes(1);
      expect(fake.start).toHaveBeenCalledWith('n1', 'file:///cache/r1.m4a', 12_000);
      expect(fake.cancel).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Transcribe')).toBeNull();
    });

    it('does not start anything until the bubble is tapped', async () => {
      await show();
      expect(fake.start).not.toHaveBeenCalled();
    });

    it('a tap with the view already open on a note with none starts it and keeps the view open', async () => {
      await show();
      await open();
      await fireEvent.press(screen.getByLabelText('Show waveform'));
      expect(fake.start).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText('Show waveform')).toBeTruthy();
      expect(screen.getByText('No transcript yet.')).toBeTruthy();
    });

    it('a fast double tap leaves the view open', async () => {
      await show();
      const bubble = screen.getByLabelText('Show transcript');
      await fireEvent.press(bubble);
      await fireEvent.press(bubble);
      await act(async () => {});
      expect(screen.getByLabelText('Show waveform')).toBeTruthy();
    });

    it('a ready or running transcript only toggles the view', async () => {
      const v = await show({ notes: [withText] });
      await open();
      await fireEvent.press(screen.getByLabelText('Show waveform'));
      expect(screen.getByLabelText('Show transcript')).toBeTruthy();
      await v.unmount();
      fake.setState('n1', { status: 'running' });
      await show();
      await open();
      await fireEvent.press(screen.getByLabelText('Show waveform'));
      expect(screen.getByLabelText('Show transcript')).toBeTruthy();
      expect(fake.start).not.toHaveBeenCalled();
    });

    it('tapping while running only shows the running view', async () => {
      fake.setState('n1', { status: 'running' });
      await show();
      await open();
      expect(screen.getByText('Transcribing...')).toBeTruthy();
      expect(fake.start).not.toHaveBeenCalled();
    });

    it('retries a failed run from the bubble', async () => {
      fake.setState('n1', { status: 'failed', error: { code: 'failed', message: 'x' } });
      await show();
      await open();
      expect(fake.start).toHaveBeenCalledTimes(1);
    });

    it('does not start (but shows the view) while saving, recording or another note runs', async () => {
      const v = await show({ busy: true });
      await open();
      expect(screen.getByText('No transcript yet.')).toBeTruthy();
      expect(fake.start).not.toHaveBeenCalled();
      await v.unmount();
      fake.setState('other', { status: 'running' });
      await show();
      await open();
      expect(screen.getByText('Another voice note is being transcribed.')).toBeTruthy();
      expect(fake.start).not.toHaveBeenCalled();
    });

    it('never starts for a note that already has a transcript', async () => {
      await show({ notes: [withText] });
      await open();
      expect(fake.start).not.toHaveBeenCalled();
    });

    describe('fixed layout', () => {
      const visible = (el: { props: { style?: unknown } }) =>
        (StyleSheet.flatten(el.props.style as object) as { opacity?: number } | undefined)
          ?.opacity !== 0;
      const buttons = () =>
        screen
          .getAllByRole('button')
          .map((b) => b.props.accessibilityLabel as string)
          .filter((l) => /transcript|waveform|Back 15|Play audio|Forward 15|speed/.test(l))
          .map((l) => (/^Show (transcript|waveform)$/.test(l) ? 'toggle' : l));
      const stateTests: [string, () => void, P, string][] = [
        ['none', () => {}, {}, 'voice-note-transcript-state'],
        [
          'running',
          () => fake.setState('n1', { status: 'running' }),
          {},
          'voice-note-transcript-state',
        ],
        [
          'failed',
          () => fake.setState('n1', { status: 'failed', error: { code: 'failed', message: 'x' } }),
          {},
          'voice-note-transcript-state',
        ],
        ['short text', () => {}, { notes: [withText] }, 'voice-note-transcript'],
        [
          'long text',
          () => {},
          { notes: [{ ...note, voiceTranscript: 'word '.repeat(2000) }] },
          'voice-note-transcript',
        ],
      ];

      it.each(stateTests)(
        'covers only the waveform; clock and controls stay visible (%s)',
        async (_name, setup, props, areaId) => {
          setup();
          const v = await show(props);
          await refresh(v);
          const before = buttons();
          await open();
          // The clock is rendered, readable, not faded, and outside the stage that is covered.
          const clock = screen.getByTestId('voice-note-clock');
          expect(visible(clock)).toBe(true);
          expect(clock.props.children).toBe('00:00.00');
          const region = screen.getByTestId('voice-note-media-region');
          const stage = screen.getByTestId('voice-note-stage');
          expect(visible(stage)).toBe(true);
          expect(stage).not.toContainElement(clock);
          expect(region).toContainElement(clock);
          // The controls row keeps every control, in the same order, all reachable.
          expect(buttons()).toEqual(before);
          expect(screen.getByTestId('voice-note-controls')).toBeVisible();
          // The waveform is hidden (faded, inert, out of the accessibility tree).
          expect(screen.queryByTestId('voice-note-wave-block')).toBeNull();
          const wave = screen.getByTestId('voice-note-wave-block', { hidden: true });
          expect(visible(wave)).toBe(false);
          expect(wave.props.pointerEvents).toBe('none');
          // The transcript is a sibling of the waveform in the stage (the box the waveform keeps),
          // absolute-filled, so its height comes from the stage and never from its own content.
          const area = screen.getByTestId(areaId);
          expect(stage).toContainElement(area);
          expect(area.parent).toBe(wave.parent);
          expect(StyleSheet.flatten(area.props.style)).toMatchObject({
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          });
          expect(StyleSheet.flatten(area.props.style)).not.toHaveProperty('height');
          expect(StyleSheet.flatten(area.props.style)).not.toHaveProperty('minHeight');
          // The region is only the stage and the clock, and the controls row follows it.
          expect(region.props.children).toHaveLength(2);
        },
      );
    });

    describe('online route line', () => {
      const SERVERS = /^Uses .* servers$/;
      it('shows no line for an on-device route, in the offer or the running state', async () => {
        const v = await show();
        await open();
        expect(screen.queryByText(SERVERS)).toBeNull();
        fake.setState('n1', { status: 'running' });
        await refresh(v);
        expect(screen.getByText('Transcribing...')).toBeTruthy();
        expect(screen.queryByText(SERVERS)).toBeNull();
      });

      it("shows the provider line in the region and while running when the route is online (iOS: Apple's)", async () => {
        fake.setRoute('online');
        const v = await show();
        await open();
        expect(screen.getByText("Uses Apple's servers")).toBeTruthy();
        expect(screen.queryByLabelText('Transcribe')).toBeNull();
        fake.setState('n1', { status: 'running' });
        await refresh(v);
        expect(screen.getByText('Transcribing online...')).toBeTruthy();
        expect(screen.getByText("Uses Apple's servers")).toBeTruthy();
      });

      it("names Google's servers on Android", async () => {
        const r = jest.replaceProperty(Platform, 'OS', 'android');
        try {
          fake.setRoute('online');
          await show();
          await open();
          expect(screen.getByText("Uses Google's servers")).toBeTruthy();
        } finally {
          r.restore();
        }
      });

      it('shows the needs-internet message for an offline failure, with Try again', async () => {
        fake.setRoute('online');
        const v = await show();
        await open();
        fake.setState('n1', {
          status: 'failed',
          error: { code: 'offline', message: 'x' },
        });
        await refresh(v);
        expect(
          screen.getByText(
            "Transcribing online needs an internet connection. Try again when you're online.",
          ),
        ).toBeTruthy();
        expect(screen.getByLabelText('Try again')).toBeTruthy();
      });
    });

    it('shows running with Cancel, a live region and a spinner', async () => {
      const v = await show();
      await open();
      fake.setState('n1', { status: 'running' });
      await refresh(v);
      expect(screen.getByText('Transcribing...')).toBeTruthy();
      expect(screen.queryByLabelText('Transcribe')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Cancel'));
      expect(fake.cancel).toHaveBeenCalledWith('n1');
      expect(screen.getByTestId('voice-note-transcribing').props.accessibilityLiveRegion).toBe(
        'polite',
      );
    });

    it.each([
      ['unsupported', 'This device cannot transcribe voice notes on-device.'],
      ['no-model', 'The offline speech model for transcription is not installed.'],
      ['permission', 'Speech recognition permission was not granted.'],
      ['failed', 'Could not transcribe this voice note.'],
      ['busy', 'Could not transcribe this voice note.'],
    ] as const)('shows a message for %s with Try again', async (code, message) => {
      const v = await show();
      await open();
      fake.setState('n1', { status: 'failed', error: { code, message: 'raw' } });
      await refresh(v);
      expect(screen.getByText(message)).toBeTruthy();
      expect(screen.queryByText('raw')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Try again'));
      expect(fake.start).toHaveBeenCalledWith('n1', 'file:///cache/r1.m4a', 12_000);
    });

    it('disables Try again while saving or recording', async () => {
      const v = await show({ busy: true });
      await open();
      fake.setState('n1', { status: 'failed', error: { code: 'failed', message: 'x' } });
      await refresh(v);
      expect(screen.getByLabelText('Try again').props.accessibilityState).toMatchObject({
        disabled: true,
      });
    });

    it('returns to the empty prompt after a cancel, with no message', async () => {
      const v = await show();
      await open();
      fake.setState('n1', { status: 'running' });
      await refresh(v);
      fake.setState('n1', { status: 'failed', error: { code: 'cancelled', message: 'x' } });
      await refresh(v);
      expect(screen.getByText('No transcript yet.')).toBeTruthy();
      expect(screen.queryByLabelText('Transcribe')).toBeNull();
      expect(screen.queryByText(/Could not/)).toBeNull();
      expect(screen.queryByLabelText('Try again')).toBeNull();
    });

    it('shows the text after a result, and the empty message with Try again for ""', async () => {
      const v = await show();
      await open();
      const results: Record<string, string> = {};
      fake = createFakeTranscription((id, text) => (results[id] = text));
      fake.emit('n1', 'dreamt of a lake');
      await v.rerender(view({ notes: [{ ...note, voiceTranscript: results.n1 }] }));
      expect(screen.getByText('dreamt of a lake')).toBeTruthy();
      fake.emit('n1', '');
      await v.rerender(view({ notes: [{ ...note, voiceTranscript: results.n1 }] }));
      expect(screen.getByText('No speech was found in this note.')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Try again'));
      expect(fake.start).toHaveBeenCalledWith('n1', 'file:///cache/r1.m4a', 12_000);
    });

    it('shows the empty message without Try again when unsupported', async () => {
      fake.setSupported(false);
      await show({ notes: [{ ...note, voiceTranscript: '' }] });
      await open();
      expect(screen.getByText('No speech was found in this note.')).toBeTruthy();
      expect(screen.queryByLabelText('Try again')).toBeNull();
    });

    it('shows selectable text in a scroll area with no re-transcribe action', async () => {
      await show({ notes: [withText] });
      await open();
      const text = screen.getByText('I was flying over water');
      expect(text.props.selectable).toBe(true);
      const area = screen.getByLabelText('Transcript');
      expect(area.type).toBe('RCTScrollView');
      expect(screen.queryByLabelText('Transcribe')).toBeNull();
      expect(screen.queryByLabelText('Try again')).toBeNull();
      expect(fake.start).not.toHaveBeenCalled();
    });

    it('keeps the player controls working in the transcript view', async () => {
      await show({ notes: [withText] });
      await open();
      await fireEvent.press(screen.getByLabelText('Play audio recording'));
      await act(async () => {});
      expect(mockPlayer.play).toHaveBeenCalled();
    });
  });

  describe('menu', () => {
    const menuHidden = () => expect(screen.queryByLabelText('More options')).toBeNull();
    const pick = async (label: string) => {
      await fireEvent.press(screen.getByLabelText('More options'));
      await fireEvent.press(screen.getByLabelText(label));
      await act(async () => {});
    };

    it('is hidden without a non-empty transcript', async () => {
      const v = await show();
      menuHidden();
      await v.unmount();
      const v2 = await show({ notes: [{ ...note, voiceTranscript: '' }] });
      menuHidden();
      await v2.unmount();
      await show({ notes: [{ ...note, voiceTranscript: '  \n' }] });
      menuHidden();
    });

    it('is a 40pt circle at the top right, with the share/trash pill shifted left of it', async () => {
      await show({ notes: [withText] });
      expect(screen.getByLabelText('More options')).toHaveStyle({
        width: iconCircle,
        height: iconCircle,
        borderRadius: iconCircle / 2,
      });
      const pill = screen.getByTestId('voice-note-actions');
      expect(StyleSheet.flatten(pill.props.style).marginRight).toBe(iconCircle + 4);
    });

    it('leaves the pill unshifted without a menu', async () => {
      await show();
      const pill = screen.getByTestId('voice-note-actions');
      expect(StyleSheet.flatten(pill.props.style).marginRight).toBeUndefined();
    });

    it('lists Copy transcript and Add transcript to entry as menu items', async () => {
      await show({ notes: [withText], onAddTranscript });
      await fireEvent.press(screen.getByLabelText('More options'));
      expect(screen.getAllByRole('menuitem').map((i) => i.props.accessibilityLabel)).toEqual([
        'Copy transcript',
        'Add transcript to entry',
      ]);
    });

    it('has no Add item when the owner gives no onAddTranscript', async () => {
      await show({ notes: [withText] });
      await fireEvent.press(screen.getByLabelText('More options'));
      expect(screen.queryByLabelText('Add transcript to entry')).toBeNull();
    });

    describe('Copy transcript', () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      it('copies the text (trailing whitespace trimmed), then shows Copied for 1.5 s', async () => {
        await show({ notes: [{ ...note, voiceTranscript: ' hello there \n\n' }] });
        await pick('Copy transcript');
        expect(copyText).toHaveBeenCalledWith(' hello there');
        expect(screen.getByText('Copied')).toBeTruthy();
        expect(screen.getByText('Copied').props.accessibilityLiveRegion).toBe('polite');
        expect(screen.queryByRole('menuitem')).toBeNull();
        await act(async () => void jest.advanceTimersByTime(1400));
        expect(screen.getByText('Copied')).toBeTruthy();
        await act(async () => void jest.advanceTimersByTime(200));
        expect(screen.queryByText('Copied')).toBeNull();
      });

      it('restarts the timer on a second copy', async () => {
        await show({ notes: [withText] });
        await pick('Copy transcript');
        await act(async () => void jest.advanceTimersByTime(1000));
        await pick('Copy transcript');
        await act(async () => void jest.advanceTimersByTime(1000));
        expect(screen.getByText('Copied')).toBeTruthy();
        await act(async () => void jest.advanceTimersByTime(600));
        expect(screen.queryByText('Copied')).toBeNull();
      });

      it('alerts on a rejection and shows no pill', async () => {
        jest.mocked(copyText).mockRejectedValue(new Error('boom'));
        await show({ notes: [withText] });
        await pick('Copy transcript');
        expect(Alert.alert).toHaveBeenCalledWith('Could not copy', 'Please try again.');
        expect(screen.queryByText('Copied')).toBeNull();
      });

      it('raises no update after unmounting', async () => {
        const v = await show({ notes: [withText] });
        await pick('Copy transcript');
        await v.unmount();
        const err = jest.spyOn(console, 'error').mockImplementation(() => {});
        await act(async () => void jest.advanceTimersByTime(2000));
        expect(err).not.toHaveBeenCalled();
      });
    });

    describe('Add transcript to entry', () => {
      it('calls onAddTranscript with the note id and the stored text, and does not close by itself', async () => {
        await show({ notes: [withText], onAddTranscript });
        await pick('Add transcript to entry');
        expect(onAddTranscript).toHaveBeenCalledWith('n1', 'I was flying over water');
        expect(onClose).not.toHaveBeenCalled();
        expect(onRemove).not.toHaveBeenCalled();
      });

      it('is disabled while saving or recording', async () => {
        await show({ notes: [withText], onAddTranscript, busy: true });
        await fireEvent.press(screen.getByLabelText('More options'));
        const item = screen.getByLabelText('Add transcript to entry');
        expect(item.props.accessibilityState).toMatchObject({ disabled: true });
        await fireEvent.press(item);
        expect(onAddTranscript).not.toHaveBeenCalled();
        // Copy stays available.
        expect(screen.getByLabelText('Copy transcript').props.accessibilityState).toMatchObject({
          disabled: false,
        });
      });
    });
  });
});
