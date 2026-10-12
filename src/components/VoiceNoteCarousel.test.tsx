import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors } from '../theme';
import {
  CAROUSEL_GAP,
  CAROUSEL_PEEK,
  CarouselNote,
  VoiceNoteCarousel,
  pageAt,
} from './VoiceNoteCarousel';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
}));

const note = (n: number): CarouselNote => ({
  id: `r${n}`,
  uri: `file:///${n}.m4a`,
  durationMs: n * 1000,
  waveform: [0.2, 0.8],
});
const notes = (n: number) => Array.from({ length: n }, (_v, i) => note(i + 1));
const WIDTH = 360;
const HIDDEN = { includeHiddenElements: true };

const layout = () =>
  fireEvent(screen.getByTestId('voice-note-carousel'), 'layout', {
    nativeEvent: { layout: { width: WIDTH, height: 100 } },
  });
const settle = (x: number) =>
  fireEvent(screen.getByTestId('voice-note-carousel').children[0] as never, 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x, y: 0 } },
  });
const widths = () =>
  screen.getAllByTestId('voice-note-page').map((p) => StyleSheet.flatten(p.props.style).width);
const dotsOn = () =>
  screen
    .getAllByTestId('voice-note-dot', HIDDEN)
    .map((d) => StyleSheet.flatten(d.props.style).backgroundColor === colors.accent);
const scroller = () =>
  screen.getByTestId('voice-note-carousel').children[0] as unknown as {
    props: Record<string, unknown>;
  };

beforeEach(() => jest.clearAllMocks());

describe('pageAt', () => {
  it('rounds the offset to the nearest page and stays in range', () => {
    expect(pageAt(0, 300, 3)).toBe(0);
    expect(pageAt(140, 300, 3)).toBe(0);
    expect(pageAt(160, 300, 3)).toBe(1);
    expect(pageAt(9999, 300, 3)).toBe(2);
    expect(pageAt(-50, 300, 3)).toBe(0);
    expect(pageAt(100, 0, 3)).toBe(0);
  });
});

describe('VoiceNoteCarousel', () => {
  it('one note: full width, no peek, no dots, no horizontal scrolling', async () => {
    await render(<VoiceNoteCarousel notes={notes(1)} />);
    await layout();
    expect(widths()).toEqual([WIDTH]);
    expect(screen.queryByTestId('voice-note-dots', HIDDEN)).toBeNull();
    expect(scroller().props.scrollEnabled).toBe(false);
  });

  it('several notes: each card is narrower by the peek so the next one shows', async () => {
    await render(<VoiceNoteCarousel notes={notes(3)} />);
    await layout();
    expect(widths()).toEqual([WIDTH - CAROUSEL_PEEK, WIDTH - CAROUSEL_PEEK, WIDTH - CAROUSEL_PEEK]);
    expect(scroller().props.scrollEnabled).toBe(true);
    expect(scroller().props.snapToInterval).toBe(WIDTH - CAROUSEL_PEEK + CAROUSEL_GAP);
  });

  it('shows one dot per note, decorative for screen readers, and the dots follow the page', async () => {
    await render(<VoiceNoteCarousel notes={notes(3)} />);
    await layout();
    const dots = screen.getByTestId('voice-note-dots', HIDDEN);
    expect(dots.props.importantForAccessibility).toBe('no');
    expect(screen.getAllByTestId('voice-note-dot', HIDDEN)).toHaveLength(3);
    expect(dotsOn()).toEqual([true, false, false]);
    await settle(WIDTH - CAROUSEL_PEEK + CAROUSEL_GAP);
    expect(dotsOn()).toEqual([false, true, false]);
    await settle(2 * (WIDTH - CAROUSEL_PEEK + CAROUSEL_GAP));
    expect(dotsOn()).toEqual([false, false, true]);
    await settle(0);
    expect(dotsOn()).toEqual([true, false, false]);
  });

  it('labels each card by place and keeps play, remove and open per note', async () => {
    const onRemove = jest.fn();
    const onOpen = jest.fn();
    await render(<VoiceNoteCarousel notes={notes(3)} onRemove={onRemove} onOpen={onOpen} />);
    await layout();
    expect(screen.getByLabelText('Play voice note 2 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open voice note 2 of 3'));
    expect(onOpen).toHaveBeenCalledWith('r2');
    await fireEvent.press(screen.getByLabelText('Remove voice note 3 of 3'));
    expect(onRemove).toHaveBeenCalledWith('r3');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Play voice note 1 of 3'));
    });
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('has no seek bar on any card', async () => {
    await render(<VoiceNoteCarousel notes={notes(3)} />);
    expect(screen.queryByTestId('seek-bar')).toBeNull();
  });

  it('a removed card keeps the row on the nearest page, and a restored one is scrolled to', async () => {
    const view = await render(<VoiceNoteCarousel notes={notes(3)} />);
    await layout();
    const interval = WIDTH - CAROUSEL_PEEK + CAROUSEL_GAP;
    await settle(2 * interval);
    expect(dotsOn()).toEqual([false, false, true]);
    await view.rerender(<VoiceNoteCarousel notes={notes(2)} />);
    expect(dotsOn()).toEqual([false, true]);
    await view.rerender(<VoiceNoteCarousel notes={notes(3)} />);
    expect(screen.getAllByTestId('voice-note-dot', HIDDEN)).toHaveLength(3);
    expect(dotsOn()).toEqual([false, false, true]);
  });

  it('removing the first card of three keeps the page index in range', async () => {
    const view = await render(<VoiceNoteCarousel notes={notes(3)} />);
    await layout();
    await view.rerender(<VoiceNoteCarousel notes={notes(3).slice(1)} />);
    expect(dotsOn()).toEqual([true, false]);
    await view.rerender(<VoiceNoteCarousel notes={notes(3).slice(2)} />);
    expect(screen.queryByTestId('voice-note-dots', HIDDEN)).toBeNull();
  });

  it('keeps a card mounted (and so playing) when another is added', async () => {
    const view = await render(<VoiceNoteCarousel notes={notes(1)} />);
    await layout();
    mockPlayer.pause.mockClear();
    await view.rerender(<VoiceNoteCarousel notes={notes(2)} />);
    expect(mockPlayer.pause).not.toHaveBeenCalled();
  });
});
