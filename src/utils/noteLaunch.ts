/** How long the cold start waits for the stores before opening a new note anyway. */
export const LAUNCH_CAP_MS = 1000;

export type NoteLaunchInput = {
  /** Every store the decision needs has loaded. */
  ready: boolean;
  indexStatus: 'ok' | 'unreadable';
  /** The "Open a new note on launch" setting. */
  autoOpen: boolean;
  /** `dayDone(all, doneDate, todayKey)`: today is already settled. */
  done: boolean;
};

/**
 * Where a cold start lands. A new note opens only when everything has loaded, the setting is on,
 * today is not settled and the notes index is readable (an unreadable index never gets a launch
 * note, because it could not be saved). Otherwise the note list shows.
 */
export function noteLaunchTarget(input: NoteLaunchInput): 'list' | 'newNote' {
  const { ready, indexStatus, autoOpen, done } = input;
  return ready && autoOpen && !done && indexStatus === 'ok' ? 'newNote' : 'list';
}
