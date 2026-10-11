import { BODY_MIN, MIN_CARD_AREA, layoutBudget } from './entryLayout';

const base = { container: 600, dateAndTitle: 120, panel: 0, naturalNotes: 0 };

describe('layoutBudget', () => {
  it('does not cap one note', () => {
    expect(layoutBudget({ ...base, naturalNotes: 56 })).toBe(56);
  });

  it('is 0 with no notes', () => {
    expect(layoutBudget(base)).toBe(0);
  });

  it('caps five notes at 25% of the container', () => {
    expect(layoutBudget({ ...base, naturalNotes: 5 * 56 + 4 * 8 })).toBe(150);
  });

  it('shrinks the cap with the container (keyboard open)', () => {
    const natural = 5 * 56 + 4 * 8;
    expect(layoutBudget({ ...base, container: 400, naturalNotes: natural })).toBe(100);
  });

  it('always shows at least one card', () => {
    expect(layoutBudget({ ...base, container: 200, naturalNotes: 320 })).toBe(MIN_CARD_AREA);
  });

  it('keeps the body minimum when room is tight', () => {
    // 25% would be 175; room is 700 - 400 - 96 = 204 > 175, so the cap wins
    expect(layoutBudget({ container: 700, dateAndTitle: 400, panel: 0, naturalNotes: 320 })).toBe(
      175,
    );
    // room = 700 - 480 - 96 = 124 < 175
    expect(layoutBudget({ container: 700, dateAndTitle: 480, panel: 0, naturalNotes: 320 })).toBe(
      124,
    );
    expect(BODY_MIN).toBe(96);
  });

  it('counts the pinned panel in the budget', () => {
    const natural = 320;
    const noPanel = layoutBudget({
      container: 700,
      dateAndTitle: 400,
      panel: 0,
      naturalNotes: natural,
    });
    const withPanel = layoutBudget({
      container: 700,
      dateAndTitle: 400,
      panel: 100,
      naturalNotes: natural,
    });
    expect(noPanel).toBe(175);
    expect(withPanel).toBe(104);
  });

  it('shrinks toward one card, not zero, in a tiny container', () => {
    expect(layoutBudget({ container: 250, dateAndTitle: 200, panel: 80, naturalNotes: 320 })).toBe(
      MIN_CARD_AREA,
    );
  });

  it('falls back to the natural height when the container is unmeasured', () => {
    expect(layoutBudget({ ...base, container: 0, naturalNotes: 320 })).toBe(320);
    expect(layoutBudget({ ...base, container: NaN, naturalNotes: 320 })).toBe(320);
  });

  it('is safe with a bad natural height', () => {
    expect(layoutBudget({ ...base, naturalNotes: NaN })).toBe(0);
    expect(layoutBudget({ ...base, naturalNotes: -5 })).toBe(0);
  });
});
