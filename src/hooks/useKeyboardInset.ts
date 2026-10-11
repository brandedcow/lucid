import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export type KeyboardInset = {
  /** The on-screen keyboard is open. */
  visible: boolean;
  /** Its height in points, 0 when closed. */
  height: number;
};

const CLOSED: KeyboardInset = { visible: false, height: 0 };

/**
 * Tracks the software keyboard. Android uses the "Did" events (the only ones it emits); iOS uses
 * the "Will" events so the state moves with the animation. With edge-to-edge on Android the window
 * no longer resizes for the keyboard, so the page has to lift its bottom bar by this height itself.
 */
export function useKeyboardInset(): KeyboardInset {
  const [inset, setInset] = useState<KeyboardInset>(() => {
    const metrics = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
    return metrics ? { visible: true, height: metrics.height } : CLOSED;
  });

  useEffect(() => {
    const [showEvent, hideEvent] =
      Platform.OS === 'ios'
        ? (['keyboardWillShow', 'keyboardWillHide'] as const)
        : (['keyboardDidShow', 'keyboardDidHide'] as const);
    const show = Keyboard.addListener(showEvent, (e) =>
      setInset({ visible: true, height: e.endCoordinates.height }),
    );
    const hide = Keyboard.addListener(hideEvent, () => setInset(CLOSED));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}
