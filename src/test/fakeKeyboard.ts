import { Keyboard } from 'react-native';
import { act } from '@testing-library/react-native';

type Handler = (e: unknown) => void;

/**
 * Captures Keyboard.addListener subscriptions so a test can fire keyboard events. Call in a
 * beforeEach; the spies are undone by jest.restoreAllMocks (or restoreMocks).
 */
export function fakeKeyboard() {
  const handlers = new Map<string, Set<Handler>>();
  const remove = jest.fn();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, fn: Handler) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(fn);
    return {
      remove: () => {
        remove();
        handlers.get(event)?.delete(fn);
      },
    };
  }) as never);
  return {
    remove,
    emit: (event: string, height = 0) =>
      act(() => {
        const e = { endCoordinates: { height, screenY: 800 - height } };
        handlers.get(event)?.forEach((fn) => fn(e));
      }),
  };
}
