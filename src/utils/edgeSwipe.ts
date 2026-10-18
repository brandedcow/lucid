/**
 * Left-edge swipe predicates for the new note screens. Copies of the ones in `TodayScreen` and
 * `sessionNavigation` (which chunk 8 deletes); the new code imports these instead.
 */

/** A drag counts as the drawer edge swipe only when it starts this close to the left edge. */
export const DRAWER_EDGE_ZONE = 20;
/** How far right the drawer edge drag must travel before it opens the drawer. */
export const DRAWER_EDGE_DISTANCE = 40;

/** Whether a moving touch is the drawer edge swipe: started in the edge zone and mostly horizontal. */
export function startsDrawerEdgeSwipe(g: { x0: number; dx: number; dy: number }): boolean {
  return g.x0 <= DRAWER_EDGE_ZONE && g.dx > 10 && g.dx > Math.abs(g.dy) * 2;
}

/** Whether a finished edge swipe went far enough to open the drawer. */
export function opensDrawer(g: { dx: number }): boolean {
  return g.dx >= DRAWER_EDGE_DISTANCE;
}

/** The left-edge zone (points) where the app's own back swipe may start on a page that asks. */
export const BACK_EDGE_ZONE = 20;
/** How far (points) that swipe must travel to count. */
export const BACK_EDGE_DISTANCE = 40;
/** Or how fast (points per ms) it must be moving on release. */
export const BACK_EDGE_VELOCITY = 0.5;

/** Whether a moving touch is the back edge swipe: started in the edge zone, mostly horizontal. */
export function startsBackEdgeSwipe(g: { x0: number; dx: number; dy: number }): boolean {
  return g.x0 <= BACK_EDGE_ZONE && g.dx > 10 && g.dx > Math.abs(g.dy) * 2;
}

/** Whether a released back edge swipe went far or fast enough. */
export function completesBackEdgeSwipe(g: { dx: number; vx: number }): boolean {
  return g.dx >= BACK_EDGE_DISTANCE || g.vx >= BACK_EDGE_VELOCITY;
}
