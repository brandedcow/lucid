import { NoteResumeInput, shouldResumeNewDay } from './noteResume';

const base: NoteResumeInput = {
  token: 1,
  consumedToken: 0,
  launchDecided: true,
  loaded: true,
  indexStatus: 'ok',
  autoOpen: true,
  done: false,
  sessionOpen: false,
  busy: false,
  trashBusy: false,
  onEditor: false,
  navReady: true,
};

describe('shouldResumeNewDay', () => {
  it('resumes when every condition holds', () => {
    expect(shouldResumeNewDay(base)).toBe(true);
  });

  it.each<[string, Partial<NoteResumeInput>]>([
    ['token already consumed', { token: 1, consumedToken: 1 }],
    ['token older than consumed', { token: 1, consumedToken: 2 }],
    ['no token yet', { token: 0, consumedToken: 0 }],
    ['launch not decided', { launchDecided: false }],
    ['notes not loaded', { loaded: false }],
    ['index unreadable', { indexStatus: 'unreadable' }],
    ['auto-open off', { autoOpen: false }],
    ['today done', { done: true }],
    ['a session is open', { sessionOpen: true }],
    ['leave or delete running', { busy: true }],
    ['trash operation open', { trashBusy: true }],
    ['already on the editor', { onEditor: true }],
    ['navigation not ready', { navReady: false }],
  ])('does not resume: %s', (_name, flip) => {
    expect(shouldResumeNewDay({ ...base, ...flip })).toBe(false);
  });

  it('resumes for a token newer than the consumed one by more than one', () => {
    expect(shouldResumeNewDay({ ...base, token: 5, consumedToken: 2 })).toBe(true);
  });
});
