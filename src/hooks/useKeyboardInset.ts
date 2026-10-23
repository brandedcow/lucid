import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, useWindowDimensions } from 'react-native';

export type KeyboardInset = {
  /** The on-screen keyboard is open. */
  visible: boolean;
  /** Its height in points, 0 when closed. */
  height: number;
  /**
   * The last non-zero keyboard height seen in the current orientation (0 if none yet). Survives the
   * keyboard closing and the hook remounting, so a fresh screen can size a panel to the keyboard.
   */
  lastHeight: number;
};

type Orientation = 'portrait' | 'landscape';
type Shown = { visible: boolean; height: number };

const memory: Record<Orientation, number> = { portrait: 0, landscape: 0 };

function currentOrientation(): Orientation {
  const { width, height } = Dimensions.get('window');
  return width > height ? 'landscape' : 'portrait';
}

function remember(height: number): void {
  if (height > 0) memory[currentOrientation()] = height;
}

/** Test helper: forgets every remembered keyboard height. */
export function resetKeyboardHeightMemory(): void {
  memory.portrait = 0;
  memory.landscape = 0;
}

const CLOSED: Shown = { visible: false, height: 0 };

/**
 * Tracks the software keyboard. Android uses the "Did" events (the only ones it emits); iOS uses
 * the "Will" events so the state moves with the animation. With edge-to-edge on Android the window
 * no longer resizes for the keyboard, so the page has to lift its bottom bar by this height itself.
 */
export function useKeyboardInset(): KeyboardInset {
  const [inset, setInset] = useState<Shown>(() => {
    const metrics = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
    if (!metrics) return CLOSED;
    remember(metrics.height);
    return { visible: true, height: metrics.height };
  });
  useWindowDimensions(); // re-render on rotation so lastHeight follows the orientation

  useEffect(() => {
    const [showEvent, hideEvent] =
      Platform.OS === 'ios'
        ? (['keyboardWillShow', 'keyboardWillHide'] as const)
        : (['keyboardDidShow', 'keyboardDidHide'] as const);
    const show = Keyboard.addListener(showEvent, (e) => {
      remember(e.endCoordinates.height);
      setInset({ visible: true, height: e.endCoordinates.height });
    });
    const hide = Keyboard.addListener(hideEvent, () => setInset(CLOSED));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { ...inset, lastHeight: memory[currentOrientation()] };
}
