import { LAUNCH_CAP_MS, noteLaunchTarget } from './noteLaunch';

const base = { ready: true, indexStatus: 'ok' as const, autoOpen: true, done: false };

describe('noteLaunchTarget', () => {
  it('opens a new note when ready, enabled, not done and the index is readable', () => {
    expect(noteLaunchTarget(base)).toBe('newNote');
  });

  it('shows the list when not ready', () => {
    expect(noteLaunchTarget({ ...base, ready: false })).toBe('list');
  });

  it('shows the list when the setting is off', () => {
    expect(noteLaunchTarget({ ...base, autoOpen: false })).toBe('list');
  });

  it('shows the list when today is already done', () => {
    expect(noteLaunchTarget({ ...base, done: true })).toBe('list');
  });

  it('shows the list when the index is unreadable', () => {
    expect(noteLaunchTarget({ ...base, indexStatus: 'unreadable' })).toBe('list');
  });

  it('covers the whole matrix: only one combination opens a note', () => {
    const bools = [true, false];
    const opens: string[] = [];
    for (const ready of bools)
      for (const autoOpen of bools)
        for (const done of bools)
          for (const indexStatus of ['ok', 'unreadable'] as const)
            if (noteLaunchTarget({ ready, autoOpen, done, indexStatus }) === 'newNote')
              opens.push(`${ready}/${autoOpen}/${done}/${indexStatus}`);
    expect(opens).toEqual(['true/true/false/ok']);
  });

  it('exports the 1000 ms launch cap', () => {
    expect(LAUNCH_CAP_MS).toBe(1000);
  });
});
