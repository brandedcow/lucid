import {
  BACK_EDGE_DISTANCE,
  BACK_EDGE_ZONE,
  completesBackEdgeSwipe,
  startsBackEdgeSwipe,
} from './edgeSwipe';

describe('edge swipe values', () => {
  it('keeps the numbers copied from the old screens', () => {
    expect(BACK_EDGE_ZONE).toBe(20);
    expect(BACK_EDGE_DISTANCE).toBe(40);
  });
});

describe('back edge swipe', () => {
  it('starts only in the zone, moving right and mostly horizontally', () => {
    expect(startsBackEdgeSwipe({ x0: BACK_EDGE_ZONE, dx: 12, dy: 2 })).toBe(true);
    expect(startsBackEdgeSwipe({ x0: BACK_EDGE_ZONE + 1, dx: 30, dy: 0 })).toBe(false);
    expect(startsBackEdgeSwipe({ x0: 5, dx: 30, dy: 20 })).toBe(false);
  });

  it('uses literal zone, distance and velocity values', () => {
    expect(startsBackEdgeSwipe({ x0: 20, dx: 12, dy: 0 })).toBe(true);
    expect(startsBackEdgeSwipe({ x0: 21, dx: 12, dy: 0 })).toBe(false);
    expect(completesBackEdgeSwipe({ dx: 40, vx: 0 })).toBe(true);
    expect(completesBackEdgeSwipe({ dx: 39, vx: 0 })).toBe(false);
    expect(completesBackEdgeSwipe({ dx: 0, vx: 0.5 })).toBe(true);
    expect(completesBackEdgeSwipe({ dx: 0, vx: 0.49 })).toBe(false);
  });

  it('completes by distance or by speed', () => {
    expect(completesBackEdgeSwipe({ dx: BACK_EDGE_DISTANCE, vx: 0 })).toBe(true);
    expect(completesBackEdgeSwipe({ dx: 5, vx: 0.5 })).toBe(true);
    expect(completesBackEdgeSwipe({ dx: 5, vx: 0.1 })).toBe(false);
  });
});
