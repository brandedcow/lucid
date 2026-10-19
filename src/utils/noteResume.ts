export type NoteResumeInput = {
  /** `resumeNewDayToken` from `useToday`; it rises when the app returns on a new day. */
  token: number;
  /** The highest token already handled (a token is consumed once, even when blocked). */
  consumedToken: number;
  /** The cold-start launch decision has been made. */
  launchDecided: boolean;
  /** The notes have loaded. */
  loaded: boolean;
  indexStatus: 'ok' | 'unreadable';
  /** The "Open a new note on launch" setting. */
  autoOpen: boolean;
  /** `dayDone(all, doneDate, todayKey)`: today is already settled. */
  done: boolean;
  /** A note is open in the editor session. */
  sessionOpen: boolean;
  /** A leave or delete is running. */
  busy: boolean;
  /** A trash operation or its confirm is open. */
  trashBusy: boolean;
  /** The current route is `Editor`. */
  onEditor: boolean;
  /** The navigation container is ready. */
  navReady: boolean;
};

/**
 * Whether returning on a new day should push a new launch note over the current screen. True only
 * for a fresh token, after the launch is decided, with readable loaded notes, the setting on,
 * today not settled, and nothing in the way (no open note, no running operation, not already on
 * the editor, navigation ready).
 */
export function shouldResumeNewDay(input: NoteResumeInput): boolean {
  return (
    input.token > input.consumedToken &&
    input.launchDecided &&
    input.loaded &&
    input.indexStatus === 'ok' &&
    input.autoOpen &&
    !input.done &&
    !input.sessionOpen &&
    !input.busy &&
    !input.trashBusy &&
    !input.onEditor &&
    input.navReady
  );
}
