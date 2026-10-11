import { useEffect, useState } from 'react';
import {
  AccessibilityActionEvent,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  PanResponderInstance,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../theme';

const WAVE_HEIGHT = 32;
/** The touch target is never shorter than this. */
export const SEEK_HIT_HEIGHT = 40;
/** Seconds moved by one accessibility increment / decrement. */
export const SEEK_STEP_SECONDS = 5;

/**
 * Whether a touch that moved (dx, dy) from the bar should become a horizontal scrub. Small or
 * mostly vertical movement is left to the parent so the page keeps scrolling.
 */
export function shouldClaimDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > 4 && Math.abs(dx) >= Math.abs(dy);
}

type Scrub = {
  begin: (fraction: number) => void;
  update: (fraction: number) => void;
  end: (fraction: number) => void;
  cancel: () => void;
};

/** The mutable side of the bar: measured width and the gesture handlers, kept out of render. */
class SeekModel {
  private width = 0;
  private startX = 0;
  readonly responder: PanResponderInstance;

  constructor(
    private scrub: Scrub,
    private disabled: boolean,
  ) {
    this.responder = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        !this.disabled && this.width > 0 && shouldClaimDrag(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        // `dx` counts from the grant, so the position at the grant is the base.
        this.startX = e.nativeEvent.locationX;
        this.scrub.begin(this.fractionAt(this.startX) ?? 0);
      },
      onPanResponderMove: (_e, g) => {
        const f = this.fractionAt(this.startX + g.dx);
        if (f !== null) this.scrub.update(f);
      },
      onPanResponderRelease: (_e, g) => {
        this.scrub.end(this.fractionAt(this.startX + g.dx) ?? 0);
      },
      onPanResponderTerminate: () => this.scrub.cancel(),
    });
  }

  sync(scrub: Scrub, disabled: boolean) {
    this.scrub = scrub;
    this.disabled = disabled;
  }

  setWidth(width: number) {
    this.width = width;
  }

  /** Fraction (0..1) of the bar at x, or null when the bar is not measured yet. */
  fractionAt(x: number): number | null {
    if (!(this.width > 0) || !Number.isFinite(x)) return null;
    return Math.max(0, Math.min(1, x / this.width));
  }
}

type Props = {
  /** Fill, 0..1 (the finger while scrubbing, else playback). */
  progress: number;
  /** Loudness peaks (0..1) for a waveform; null draws the plain 4pt bar. */
  peaks: number[] | null;
  /** A tap: seek to this fraction. */
  onSeek: (fraction: number) => void;
  scrub: Scrub;
  /** Accessibility increment/decrement: move by this many seconds. */
  onStep: (seconds: number) => void;
  disabled?: boolean;
  label: string;
  /** Spoken value, e.g. "0:12 of 0:48". */
  valueText: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A touchable progress display: tap to seek, drag to scrub (preview only, one seek on release).
 * Children are `pointerEvents="none"` so the touch position is always relative to the bar.
 */
export function SeekBar({
  progress,
  peaks,
  onSeek,
  scrub,
  onStep,
  disabled = false,
  label,
  valueText,
  style,
}: Props) {
  // The gesture handlers are created once; the model reads the newest props through `sync`.
  const [model] = useState(() => new SeekModel(scrub, disabled));
  useEffect(() => {
    model.sync(scrub, disabled);
  });

  const onTap = (e: GestureResponderEvent) => {
    if (disabled) return;
    const f = model.fractionAt(e.nativeEvent.locationX);
    if (f !== null) onSeek(f);
  };

  const onAction = (e: AccessibilityActionEvent) => {
    if (disabled) return;
    if (e.nativeEvent.actionName === 'increment') onStep(SEEK_STEP_SECONDS);
    else if (e.nativeEvent.actionName === 'decrement') onStep(-SEEK_STEP_SECONDS);
  };

  return (
    <View
      testID="seek-bar"
      style={[styles.hit, style]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(progress * 100),
        text: valueText,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      {...model.responder.panHandlers}
    >
      <Pressable
        testID="seek-press"
        accessible={false}
        onPress={onTap}
        onLayout={(e: LayoutChangeEvent) => {
          model.setWidth(e.nativeEvent.layout.width);
        }}
        style={styles.press}
      >
        {peaks ? (
          <View style={styles.wave} pointerEvents="none">
            {peaks.map((peak, i) => (
              <View
                key={i}
                testID="wave-bar"
                pointerEvents="none"
                style={[
                  styles.waveBar,
                  { height: Math.max(3, peak * WAVE_HEIGHT) },
                  (i + 0.5) / peaks.length <= progress ? styles.barFilled : styles.barEmpty,
                ]}
              />
            ))}
          </View>
        ) : (
          <View style={styles.bar} pointerEvents="none">
            <View
              testID="progress-fill"
              pointerEvents="none"
              style={[styles.fill, { width: `${progress * 100}%` }]}
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: SEEK_HIT_HEIGHT, justifyContent: 'center' },
  press: { minHeight: SEEK_HIT_HEIGHT, justifyContent: 'center' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: WAVE_HEIGHT },
  waveBar: { flex: 1, borderRadius: 2 },
  barFilled: { backgroundColor: colors.accent },
  barEmpty: { backgroundColor: colors.border },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.accent },
});
