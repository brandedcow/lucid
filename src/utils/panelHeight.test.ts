import { PANEL_FALLBACK_HEIGHT, panelContentHeight } from './panelHeight';

const base = { windowHeight: 844, bottomInset: 34 };

describe('panelContentHeight', () => {
  it('subtracts the bottom inset on iOS', () => {
    expect(panelContentHeight({ ...base, remembered: 328, os: 'ios' })).toBe(294);
  });

  it('uses the remembered height as is on Android', () => {
    expect(panelContentHeight({ ...base, remembered: 300, os: 'android' })).toBe(300);
  });

  it('falls back when nothing is remembered', () => {
    expect(panelContentHeight({ ...base, remembered: 0, os: 'ios' })).toBe(
      PANEL_FALLBACK_HEIGHT.ios,
    );
    expect(panelContentHeight({ ...base, remembered: 0, os: 'android' })).toBe(
      PANEL_FALLBACK_HEIGHT.android,
    );
  });

  it('clamps to the minimum', () => {
    expect(panelContentHeight({ ...base, remembered: 150, os: 'android' })).toBe(200);
    expect(panelContentHeight({ ...base, remembered: 220, os: 'ios' })).toBe(200);
  });

  it('clamps to half the window, floored', () => {
    expect(panelContentHeight({ ...base, remembered: 600, os: 'android' })).toBe(422);
    expect(
      panelContentHeight({ windowHeight: 845, bottomInset: 0, remembered: 900, os: 'ios' }),
    ).toBe(422);
  });

  it('prefers the minimum when the window is tiny', () => {
    expect(
      panelContentHeight({ windowHeight: 300, bottomInset: 0, remembered: 250, os: 'ios' }),
    ).toBe(200);
  });
});
