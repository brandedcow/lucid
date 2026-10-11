import { caretTopAtBodyEnd, offsetToRevealCaret } from './caretScroll';

const base = { lineHeight: 26, margin: 26, viewportHeight: 400, scrollY: 0 };

describe('offsetToRevealCaret', () => {
  it('returns null when the caret is inside the band', () => {
    expect(offsetToRevealCaret({ ...base, caretTop: 200 })).toBeNull();
  });

  it('scrolls down so the line plus margin sits at the bottom', () => {
    // bottom = 500 + 26 + 26 = 552; 552 - 400 = 152
    expect(offsetToRevealCaret({ ...base, caretTop: 500 })).toBe(152);
  });

  it('scrolls up when the caret is above the band', () => {
    expect(offsetToRevealCaret({ ...base, scrollY: 300, caretTop: 280 })).toBe(254);
  });

  it('never goes below 0', () => {
    expect(offsetToRevealCaret({ ...base, scrollY: 50, caretTop: 10 })).toBe(0);
  });

  it('returns null while the viewport is unmeasured', () => {
    expect(offsetToRevealCaret({ ...base, viewportHeight: 0, caretTop: 900 })).toBeNull();
  });

  it('keeps the line top when the band is smaller than a line plus margins', () => {
    expect(offsetToRevealCaret({ ...base, viewportHeight: 40, caretTop: 500 })).toBe(474);
  });

  it('treats the exact band edge as visible', () => {
    expect(offsetToRevealCaret({ ...base, caretTop: 348 })).toBeNull();
    expect(offsetToRevealCaret({ ...base, caretTop: 349 })).toBe(1);
  });
});

describe('caretTopAtBodyEnd', () => {
  it('is the top of the body last line', () => {
    expect(caretTopAtBodyEnd({ y: 120, height: 300 }, 26)).toBe(394);
  });
});
