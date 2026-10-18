import {
  BACK_EDGE_DISTANCE,
  BACK_EDGE_ZONE,
  DRAWER_EDGE_DISTANCE,
  DRAWER_EDGE_ZONE,
  completesBackEdgeSwipe,
  opensDrawer,
  startsBackEdgeSwipe,
  startsDrawerEdgeSwipe,
} from './edgeSwipe';

describe('edge swipe values', () => {
  it('keeps the numbers copied from the old screens', () => {
    expect(DRAWER_EDGE_ZONE).toBe(20);
    expect(DRAWER_EDGE_DISTANCE).toBe(40);
    expect(BACK_EDGE_ZONE).toBe(20);
    expect(BACK_EDGE_DISTANCE).toBe(40);
  });
});

describe('drawer edge swipe', () => {
  it('starts only in the zone, moving right and mostly horizontally', () => {
    expect(startsDrawerEdgeSwipe({ x0: DRAWER_EDGE_ZONE, dx: 12, dy: 2 })).toBe(true);
    expect(startsDrawerEdgeSwipe({ x0: DRAWER_EDGE_ZONE + 1, dx: 30, dy: 0 })).toBe(false);
    expect(startsDrawerEdgeSwipe({ x0: 5, dx: 10, dy: 0 })).toBe(false);
    expect(startsDrawerEdgeSwipe({ x0: 5, dx: -30, dy: 0 })).toBe(false);
    expect(startsDrawerEdgeSwipe({ x0: 5, dx: 30, dy: 20 })).toBe(false);
  });

  it('uses literal zone and distance values', () => {
    expect(startsDrawerEdgeSwipe({ x0: 20, dx: 12, dy: 0 })).toBe(true);
    expect(startsDrawerEdgeSwipe({ x0: 21, dx: 12, dy: 0 })).toBe(false);
    expect(opensDrawer({ dx: 40 })).toBe(true);
    expect(opensDrawer({ dx: 39 })).toBe(false);
  });

  it('opens at the distance', () => {
    expect(opensDrawer({ dx: DRAWER_EDGE_DISTANCE })).toBe(true);
    expect(opensDrawer({ dx: DRAWER_EDGE_DISTANCE - 1 })).toBe(false);
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
