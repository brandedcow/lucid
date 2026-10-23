import { renderHook } from '@testing-library/react-native';
import { Dimensions, Keyboard, Platform } from 'react-native';
import { fakeKeyboard } from '../test/fakeKeyboard';
import { resetKeyboardHeightMemory, useKeyboardInset } from './useKeyboardInset';

const originalOS = Platform.OS;
const setOS = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};

let emit: ReturnType<typeof fakeKeyboard>['emit'];
beforeEach(() => {
  resetKeyboardHeightMemory();
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
      expect(result.current).toMatchObject({ visible: false, height: 0 });
    });

    it('follows keyboardDidShow, a height change, and keyboardDidHide', async () => {
      const { result } = await renderHook(() => useKeyboardInset());
      await emit('keyboardDidShow', 300);
      expect(result.current).toMatchObject({ visible: true, height: 300 });
      await emit('keyboardDidShow', 340);
      expect(result.current).toMatchObject({ visible: true, height: 340 });
      await emit('keyboardDidHide');
      expect(result.current).toMatchObject({ visible: false, height: 0 });
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
      expect(result.current).toMatchObject({ visible: true, height: 336 });
      await emit('keyboardWillHide');
      expect(result.current).toMatchObject({ visible: false, height: 0 });
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
    expect(result.current).toMatchObject({ visible: true, height: 280 });
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

  describe('lastHeight', () => {
    beforeEach(() => setOS('android'));

    it('is 0 before any keyboard, then the last non-zero height, kept after hide', async () => {
      const { result } = await renderHook(() => useKeyboardInset());
      expect(result.current.lastHeight).toBe(0);
      await emit('keyboardDidShow', 300);
      expect(result.current.lastHeight).toBe(300);
      await emit('keyboardDidShow', 340);
      await emit('keyboardDidHide');
      expect(result.current).toEqual({ visible: false, height: 0, lastHeight: 340 });
    });

    it('is known to a freshly mounted hook', async () => {
      const first = await renderHook(() => useKeyboardInset());
      await emit('keyboardDidShow', 310);
      await first.unmount();
      const second = await renderHook(() => useKeyboardInset());
      expect(second.result.current).toEqual({ visible: false, height: 0, lastHeight: 310 });
    });

    it('is seeded from Keyboard.metrics() when the keyboard is already open', async () => {
      jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
      jest
        .spyOn(Keyboard, 'metrics')
        .mockReturnValue({ height: 280, screenX: 0, screenY: 520, width: 390 });
      const first = await renderHook(() => useKeyboardInset());
      expect(first.result.current.lastHeight).toBe(280);
      await first.unmount();
      jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
      const second = await renderHook(() => useKeyboardInset());
      expect(second.result.current.lastHeight).toBe(280);
    });

    it('is forgotten by the reset helper', async () => {
      const { result } = await renderHook(() => useKeyboardInset());
      await emit('keyboardDidShow', 300);
      resetKeyboardHeightMemory();
      const fresh = await renderHook(() => useKeyboardInset());
      expect(fresh.result.current.lastHeight).toBe(0);
      expect(result.current).toBeDefined();
    });

    it('is remembered per orientation', async () => {
      const dims = jest.spyOn(Dimensions, 'get');
      dims.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
      const portrait = await renderHook(() => useKeyboardInset());
      await emit('keyboardDidShow', 300);
      expect(portrait.result.current.lastHeight).toBe(300);
      await portrait.unmount();
      dims.mockReturnValue({ width: 844, height: 390, scale: 3, fontScale: 1 });
      const landscape = await renderHook(() => useKeyboardInset());
      expect(landscape.result.current.lastHeight).toBe(0);
      await emit('keyboardDidShow', 200);
      expect(landscape.result.current.lastHeight).toBe(200);
      await landscape.unmount();
      dims.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
      const again = await renderHook(() => useKeyboardInset());
      expect(again.result.current.lastHeight).toBe(300);
    });
  });
});
