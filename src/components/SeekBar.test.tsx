import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { SEEK_HIT_HEIGHT, SeekBar, shouldClaimDrag } from './SeekBar';

describe('shouldClaimDrag', () => {
  it('claims a horizontal drag', () => {
    expect(shouldClaimDrag(20, 3)).toBe(true);
    expect(shouldClaimDrag(-20, 20)).toBe(true);
  });
  it('does not claim a vertical drag', () => {
    expect(shouldClaimDrag(3, 20)).toBe(false);
  });
  it('does not claim a small movement', () => {
    expect(shouldClaimDrag(3, 0)).toBe(false);
    expect(shouldClaimDrag(0, 0)).toBe(false);
  });
});

const makeScrub = () => ({
  begin: jest.fn(),
  update: jest.fn(),
  end: jest.fn(),
  cancel: jest.fn(),
});

/** A touch history for one finger that went down at pageX0 and is now at pageX (same y). */
let clock = 0;
let lastX: number | null = null;
const touch = (locationX: number, pageX0: number, pageX: number, pageY = 0) => {
  clock += 1;
  const previous = lastX ?? pageX0;
  lastX = pageX;
  return {
    nativeEvent: {
      locationX,
      touches: [{}],
      changedTouches: [{}],
      timestamp: clock,
    },
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
          currentPageY: pageY,
          currentTimeStamp: clock,
          previousPageX: previous,
          previousPageY: 0,
          previousTimeStamp: clock - 1,
        },
      ],
    },
  };
};

const setup = async (props: Partial<React.ComponentProps<typeof SeekBar>> = {}) => {
  lastX = null;
  const scrub = makeScrub();
  const onSeek = jest.fn();
  const onStep = jest.fn();
  await render(
    <SeekBar
      progress={0.25}
      peaks={null}
      onSeek={onSeek}
      scrub={scrub}
      onStep={onStep}
      label="Recording position"
      valueText="0:12 of 0:48"
      {...props}
    />,
  );
  await fireEvent(screen.getByTestId('seek-press'), 'layout', {
    nativeEvent: { layout: { width: 200, height: 40 } },
  });
  return { scrub, onSeek, onStep, bar: screen.getByTestId('seek-bar') };
};

describe('SeekBar', () => {
  it('has at least a 40pt hit area and ignores child touches', async () => {
    const { bar } = await setup({ peaks: [0.5, 0.5] });
    expect(SEEK_HIT_HEIGHT).toBeGreaterThanOrEqual(40);
    expect(bar.props.style).toBeTruthy();
    for (const b of screen.getAllByTestId('wave-bar')) expect(b.props.pointerEvents).toBe('none');
  });

  it('a tap seeks to the touched fraction', async () => {
    const { onSeek } = await setup();
    await fireEvent.press(screen.getByTestId('seek-press'), { nativeEvent: { locationX: 50 } });
    expect(onSeek).toHaveBeenCalledWith(0.25);
    await fireEvent.press(screen.getByTestId('seek-press'), { nativeEvent: { locationX: 200 } });
    expect(onSeek).toHaveBeenLastCalledWith(1);
  });

  it('a tap before the width is measured is safe', async () => {
    const onSeek = jest.fn();
    await render(
      <SeekBar
        progress={0}
        peaks={null}
        onSeek={onSeek}
        scrub={makeScrub()}
        onStep={jest.fn()}
        label="x"
        valueText="y"
      />,
    );
    await fireEvent.press(screen.getByTestId('seek-press'), { nativeEvent: { locationX: 50 } });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('a horizontal drag begins, updates and ends the scrub', async () => {
    const { bar, scrub } = await setup();
    const h = bar.props;
    expect(h.onMoveShouldSetResponderCapture(touch(60, 50, 60))).toBe(true);
    await act(async () => h.onResponderGrant(touch(60, 50, 60)));
    expect(scrub.begin).toHaveBeenCalledWith(0.3);
    await act(async () => h.onResponderMove(touch(100, 50, 100)));
    expect(scrub.update).toHaveBeenLastCalledWith(0.5);
    await act(async () => h.onResponderMove(touch(400, 50, 400)));
    expect(scrub.update).toHaveBeenLastCalledWith(1);
    await act(async () => h.onResponderMove(touch(100, 50, 100)));
    await act(async () => h.onResponderRelease(touch(100, 50, 100)));
    expect(scrub.end).toHaveBeenCalledWith(0.5);
    expect(h.onResponderTerminationRequest()).toBe(false);
  });

  it('a vertical move is not claimed', async () => {
    const { bar } = await setup();
    expect(bar.props.onMoveShouldSetResponderCapture(touch(50, 50, 52, 30))).toBe(false);
  });

  it('a terminated drag cancels', async () => {
    const { bar, scrub } = await setup();
    await act(async () => bar.props.onResponderGrant(touch(60, 50, 60)));
    await act(async () => bar.props.onResponderTerminate(touch(60, 50, 60)));
    expect(scrub.cancel).toHaveBeenCalled();
    expect(scrub.end).not.toHaveBeenCalled();
  });

  it('a disabled bar claims nothing and ignores taps', async () => {
    const { bar, onSeek } = await setup({ disabled: true });
    expect(bar.props.onMoveShouldSetResponderCapture(touch(60, 50, 60))).toBe(false);
    await fireEvent.press(screen.getByTestId('seek-press'), { nativeEvent: { locationX: 50 } });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('is adjustable with a value text and steps by 5 seconds', async () => {
    const { bar, onStep } = await setup();
    expect(bar.props.accessibilityRole).toBe('adjustable');
    expect(bar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 25,
      text: '0:12 of 0:48',
    });
    await act(async () =>
      bar.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }),
    );
    expect(onStep).toHaveBeenLastCalledWith(5);
    await act(async () =>
      bar.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }),
    );
    expect(onStep).toHaveBeenLastCalledWith(-5);
  });

  describe('waveHeight', () => {
    const flat = (el: { props: { style?: unknown } }) =>
      Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean)) as Record<
        string,
        unknown
      >;
    const PEAKS = [1, 0.5, 0.25];

    it('defaults to 40pt hit and press areas with bars up to 32', async () => {
      const { bar } = await setup({ peaks: PEAKS });
      expect(flat(bar).height).toBe(40);
      expect(flat(screen.getByTestId('seek-press')).height).toBe(40);
      const heights = screen.getAllByTestId('wave-bar').map((b) => flat(b).height);
      expect(heights).toEqual([32, 16, 8]);
    });

    it('96 gives bars up to 96 and a 96pt hit and press area (a tap anywhere over the wave seeks)', async () => {
      const { bar, onSeek } = await setup({ peaks: PEAKS, waveHeight: 96 });
      expect(flat(bar).height).toBe(96);
      expect(flat(screen.getByTestId('seek-press')).height).toBe(96);
      expect(screen.getAllByTestId('wave-bar').map((b) => flat(b).height)).toEqual([96, 48, 24]);
      // The press element is what is tapped, so the whole 96pt is the target.
      await fireEvent.press(screen.getByTestId('seek-press'), { nativeEvent: { locationX: 100 } });
      expect(onSeek).toHaveBeenCalledWith(0.5);
    });

    it('a small waveHeight keeps the 40pt minimum hit area', async () => {
      const { bar } = await setup({ peaks: PEAKS, waveHeight: 20 });
      expect(flat(bar).height).toBe(40);
      expect(flat(screen.getByTestId('seek-press')).height).toBe(40);
      expect(screen.getAllByTestId('wave-bar').map((b) => flat(b).height)).toEqual([20, 10, 5]);
    });

    it('children sit in the press area, ignore touches and change nothing about tap or scrub', async () => {
      const { bar, onSeek, scrub } = await setup({
        waveHeight: 96,
        children: <View testID="playhead-child" />,
      });
      const child = screen.getByTestId('playhead-child');
      expect(screen.getByTestId('seek-press')).toContainElement(child);
      expect(child.parent?.props.pointerEvents).toBe('none');
      await fireEvent.press(screen.getByTestId('seek-press'), { nativeEvent: { locationX: 50 } });
      expect(onSeek).toHaveBeenCalledWith(0.25);
      await act(async () => bar.props.onResponderGrant(touch(60, 50, 60)));
      expect(scrub.begin).toHaveBeenCalledWith(0.3);
    });

    it('has identical accessibility with and without waveHeight', async () => {
      const a11y = (el: { props: Record<string, unknown> }) => ({
        role: el.props.accessibilityRole,
        label: el.props.accessibilityLabel,
        value: el.props.accessibilityValue,
        actions: el.props.accessibilityActions,
        state: el.props.accessibilityState,
      });
      const { bar } = await setup();
      const before = a11y(bar);
      await screen.unmount();
      const { bar: tall } = await setup({ waveHeight: 96 });
      expect(a11y(tall)).toEqual(before);
    });
  });
});
