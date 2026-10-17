/**
 * Runs registered hardwareBackPress handlers the way Android's BackHandler does: newest first,
 * stopping at the first that returns true. NavigationContainer registers a handler of its own that
 * returns false on a single-route stack, so "the last one" is no longer the app's.
 */
export function runBackChain(handlers: readonly (() => boolean | null | undefined)[]): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]()) return true;
  }
  return false;
}
