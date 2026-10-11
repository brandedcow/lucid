import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { RecordingPlayer } from './RecordingPlayer';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
let mockStatus = { playing: false, currentTime: 0, duration: 0 };

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
  setAudioModeAsync: jest.fn(),
}));

beforeEach(() => {
  mockPlayer.play.mockClear();
  mockPlayer.pause.mockClear();
  mockPlayer.seekTo.mockClear();
  mockStatus = { playing: false, currentTime: 0, duration: 0 };
});

describe('RecordingPlayer compact', () => {
  it('shows the total at rest, with no label', async () => {
    await render(<RecordingPlayer compact uri="file:///a.m4a" durationMs={34000} label="Hidden" />);
    expect(screen.getByText('0:34')).toBeTruthy();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.queryByText(/ \/ /)).toBeNull();
  });

  it('shows elapsed / total while playing and labels the button Pause', async () => {
    mockStatus = { playing: true, currentTime: 12.4, duration: 34 };
    await render(<RecordingPlayer compact uri="file:///a.m4a" durationMs={34000} />);
    expect(screen.getByText('0:12 / 0:34')).toBeTruthy();
    expect(screen.getByLabelText('Pause recording')).toBeTruthy();
  });

  it('plays from the start button and pauses while playing', async () => {
    await render(<RecordingPlayer compact uri="file:///a.m4a" durationMs={34000} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Play recording'));
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);

    mockStatus = { playing: true, currentTime: 1, duration: 34 };
    await screen.rerender(<RecordingPlayer compact uri="file:///a.m4a" durationMs={34000} />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Pause recording'));
    });
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('uses a 40dp outlined button', async () => {
    await render(<RecordingPlayer compact uri="file:///a.m4a" durationMs={34000} />);
    const style = StyleSheet.flatten(screen.getByLabelText('Play recording').props.style) as Record<
      string,
      unknown
    >;
    expect(style).toMatchObject({ width: 40, height: 40, borderRadius: 20 });
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.backgroundColor).toBeUndefined();
  });
});

describe('RecordingPlayer default layout', () => {
  it('shows the label instead of the time', async () => {
    await render(<RecordingPlayer uri="file:///a.m4a" durationMs={4000} label="Original" />);
    expect(screen.getByText('Original')).toBeTruthy();
    expect(screen.queryByText(/\//)).toBeNull();
  });

  it('shows elapsed / total at rest when there is no label, on the 48dp filled button', async () => {
    await render(<RecordingPlayer uri="file:///a.m4a" durationMs={4000} />);
    expect(screen.getByText('0:00 / 0:04')).toBeTruthy();
    const style = StyleSheet.flatten(screen.getByLabelText('Play recording').props.style) as Record<
      string,
      unknown
    >;
    expect(style).toMatchObject({ width: 48, height: 48 });
    expect(style.backgroundColor).toBeDefined();
  });
});

describe('RecordingPlayer seeking', () => {
  const seekTap = async (x: number) => {
    await fireEvent(screen.getByTestId('seek-press'), 'layout', {
      nativeEvent: { layout: { width: 200, height: 40 } },
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('seek-press'), { nativeEvent: { locationX: x } });
    });
  };

  it('the compact form seeks on a tap and does not play', async () => {
    mockStatus = { playing: false, currentTime: 0, duration: 34 };
    await render(<RecordingPlayer compact uri="file:///a.m4a" durationMs={34000} />);
    await seekTap(100);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(17);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('the card form seeks on a tap and keeps its label', async () => {
    mockStatus = { playing: false, currentTime: 0, duration: 34 };
    await render(<RecordingPlayer uri="file:///a.m4a" durationMs={34000} label="Caption" />);
    await seekTap(50);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(8.5);
    expect(screen.getByText('Caption')).toBeTruthy();
    expect(screen.getByLabelText('Recording position').props.accessibilityValue.text).toBe(
      '0:00 of 0:34',
    );
  });

  const drag = async () => {
    await fireEvent(screen.getByTestId('seek-press'), 'layout', {
      nativeEvent: { layout: { width: 200, height: 40 } },
    });
    const bar = screen.getByTestId('seek-bar');
    const t = (x: number, n: number) => ({
      nativeEvent: { locationX: x, touches: [{}], changedTouches: [{}], timestamp: n },
      touchHistory: {
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: n,
        numberActiveTouches: 1,
        touchBank: [
          {
            touchActive: true,
            startPageX: 20,
            startPageY: 0,
            startTimeStamp: 0,
            currentPageX: x,
            currentPageY: 0,
            currentTimeStamp: n,
            previousPageX: n === 1 ? 20 : 50,
            previousPageY: 0,
            previousTimeStamp: n - 1,
          },
        ],
      },
    });
    await act(async () => bar.props.onResponderGrant(t(50, 1)));
    await act(async () => bar.props.onResponderMove(t(100, 2)));
  };

  it('shows m:ss / m:ss following the finger during a drag', async () => {
    mockStatus = { playing: true, currentTime: 1, duration: 4 };
    await render(<RecordingPlayer compact uri="file:///a.m4a" durationMs={4000} />);
    expect(screen.getByText('0:01 / 0:04')).toBeTruthy();
    await drag();
    expect(screen.getByText('0:02 / 0:04')).toBeTruthy();
  });
});
