export type PanelOS = 'ios' | 'android';

/** PROVISIONAL: panel content height when no keyboard height has been seen yet. */
export const PANEL_FALLBACK_HEIGHT: Record<PanelOS, number> = { ios: 260, android: 250 };
/** PROVISIONAL: the panel never gets smaller than this. */
export const PANEL_MIN_HEIGHT = 200;
/** PROVISIONAL: the panel never takes more than this share of the window. */
export const PANEL_MAX_FRACTION = 0.5;

type Input = {
  /** Last keyboard height seen (`useKeyboardInset().lastHeight`), 0 or less when unknown. */
  remembered: number;
  windowHeight: number;
  /** Bottom safe-area inset. */
  bottomInset: number;
  os: PanelOS;
};

/**
 * Height of the list-controls panel content so it matches the keyboard it replaces. The iOS
 * keyboard height includes the home-indicator area, which the panel's own bottom padding adds
 * back, so it is subtracted here; on Android the dock padding adds the inset on top of the
 * remembered height. Clamped to [PANEL_MIN_HEIGHT, floor(windowHeight * PANEL_MAX_FRACTION)].
 */
export function panelContentHeight({ remembered, windowHeight, bottomInset, os }: Input): number {
  const base =
    remembered > 0
      ? os === 'ios'
        ? remembered - bottomInset
        : remembered
      : PANEL_FALLBACK_HEIGHT[os];
  const max = Math.floor(windowHeight * PANEL_MAX_FRACTION);
  return Math.max(PANEL_MIN_HEIGHT, Math.min(max, base));
}
