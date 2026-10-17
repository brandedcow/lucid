import { renderHook } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { useKeyboardInset } from './useKeyboardInset';

const originalOS = Platform.OS;
const setOS = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};

let emit: ReturnType<typeof fakeKeyboard>['emit'];
beforeEach(() => {
  ({ emit } = fakeKeyboard());
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
  jest.restoreAllMocks();
});

describe('useKeyboardInset', () => {
  describe('on Android', () => {
    beforeEach(() => setOS('android'));

    it('starts closed', async () => {
      const { result } = await renderHook(() => useKeyboardInset());
      expect(result.current).toEqual({ visible: false, height: 0 });
    });

    it('follows keyboardDidShow, a height change, and keyboardDidHide', async () => {
      const { result } = await renderHook(() => useKeyboardInset());
      await emit('keyboardDidShow', 300);
      expect(result.current).toEqual({ visible: true, height: 300 });
      await emit('keyboardDidShow', 340);
      expect(result.current).toEqual({ visible: true, height: 340 });
      await emit('keyboardDidHide');
      expect(result.current).toEqual({ visible: false, height: 0 });
    });

    it('ignores the iOS events', async () => {
      const { result } = await renderHook(() => useKeyboardInset());
      await emit('keyboardWillShow', 300);
      expect(result.current.visible).toBe(false);
    });
  });

  describe('on iOS', () => {
    beforeEach(() => setOS('ios'));

    it('follows keyboardWillShow and keyboardWillHide', async () => {
      const { result } = await renderHook(() => useKeyboardInset());
      await emit('keyboardWillShow', 336);
      expect(result.current).toEqual({ visible: true, height: 336 });
      await emit('keyboardWillHide');
      expect(result.current).toEqual({ visible: false, height: 0 });
    });

    it('ignores the Android events', async () => {
      const { result } = await renderHook(() => useKeyboardInset());
      await emit('keyboardDidShow', 300);
      expect(result.current.visible).toBe(false);
    });
  });

  it('starts open when the keyboard is already showing', async () => {
    setOS('android');
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    jest
      .spyOn(Keyboard, 'metrics')
      .mockReturnValue({ height: 280, screenX: 0, screenY: 520, width: 390 });
    const { result } = await renderHook(() => useKeyboardInset());
    expect(result.current).toEqual({ visible: true, height: 280 });
  });

  it('removes both listeners on unmount, and stops reacting', async () => {
    setOS('android');
    const kb = fakeKeyboard();
    const { result, unmount } = await renderHook(() => useKeyboardInset());
    await unmount();
    expect(kb.remove).toHaveBeenCalledTimes(2);
    await kb.emit('keyboardDidShow', 300);
    expect(result.current.visible).toBe(false);
  });
});
