import {
  DISCARD_CHANGES_DISCARD,
  DISCARD_CHANGES_KEEP,
  DISCARD_CHANGES_MESSAGE,
  DISCARD_CHANGES_TITLE,
  LEAVE_ENTRY_DISCARD,
  LEAVE_ENTRY_KEEP,
  LEAVE_ENTRY_MESSAGE,
  LEAVE_ENTRY_SAVE_DRAFT,
  LEAVE_ENTRY_TITLE,
  discardChangesMessage,
  leavesWithoutPrompt,
  BACK_EDGE_DISTANCE,
  BACK_EDGE_VELOCITY,
  BACK_EDGE_ZONE,
  completesBackEdgeSwipe,
  startsBackEdgeSwipe,
  type LeaveInput,
} from './sessionNavigation';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

describe('confirmation strings', () => {
  it('exports the discard-changes strings', () => {
    expect(DISCARD_CHANGES_TITLE).toBe('Discard changes?');
    expect(DISCARD_CHANGES_MESSAGE).toBe('Your changes to this dream will be lost.');
    expect(DISCARD_CHANGES_KEEP).toBe('Keep editing');
    expect(DISCARD_CHANGES_DISCARD).toBe('Discard');
  });
  it('exports the add-entry leave prompt strings', () => {
    expect(LEAVE_ENTRY_TITLE).toBe('Save a draft?');
    expect(LEAVE_ENTRY_MESSAGE).toBe('Keep what you wrote to finish later, or discard it.');
    expect(LEAVE_ENTRY_SAVE_DRAFT).toBe('Save draft');
    expect(LEAVE_ENTRY_DISCARD).toBe('Discard');
    expect(LEAVE_ENTRY_KEEP).toBe('Keep writing');
  });
});

describe('discardChangesMessage', () => {
  it('is journal-aware and Dreams keeps the existing wording', () => {
    expect(discardChangesMessage('dream')).toBe(DISCARD_CHANGES_MESSAGE);
    expect(discardChangesMessage('journal')).toBe('Your changes to this entry will be lost.');
    expect(discardChangesMessage('journal')).not.toMatch(/dream/i);
  });
});

describe('leavesWithoutPrompt', () => {
  const idle: LeaveInput = {
    origin: 'new',
    hasContent: false,
    hasEdits: false,
    pendingAudioRemoval: false,
    recording: false,
    saving: false,
    deleting: false,
  };
  it.each([
    ['an empty new page', {}, true],
    ['an empty launch page (a new entry)', { origin: 'new' }, true],
    ['a new page with something typed or recorded', { hasContent: true }, false],
    ['a new page with only a closed stored recording', { pendingAudioRemoval: true }, false],
    ['a draft with content', { origin: 'draft', hasContent: true }, false],
    ['a draft with nothing left on it', { origin: 'draft' }, true],
    [
      'a draft with a closed stored recording only',
      { origin: 'draft', pendingAudioRemoval: true },
      false,
    ],
    ['an unchanged edit', { origin: 'edit', hasContent: true }, true],
    ['a changed edit', { origin: 'edit', hasContent: true, hasEdits: true }, false],
    ['a changed edit, whatever its content', { origin: 'edit', hasEdits: true }, false],
    ['a running recorder on an empty page', { recording: true }, false],
    ['a running recorder on an unchanged edit', { origin: 'edit', recording: true }, false],
    ['a save in flight on an empty page', { saving: true }, false],
    ['a save in flight on an unchanged edit', { origin: 'edit', saving: true }, false],
    ['a delete in flight', { origin: 'edit', deleting: true }, false],
    ['a delete in flight on an empty page', { deleting: true }, false],
  ] as [string, Partial<LeaveInput>, boolean][])('%s -> %s', (_name, patch, expected) => {
    expect(leavesWithoutPrompt({ ...idle, ...patch })).toBe(expected);
  });
});

describe('startsBackEdgeSwipe', () => {
  const ok = { x0: 5, dx: 20, dy: 3 };
  it('starts for a mostly horizontal rightward drag from the edge zone', () => {
    expect(startsBackEdgeSwipe(ok)).toBe(true);
    expect(startsBackEdgeSwipe({ ...ok, x0: BACK_EDGE_ZONE })).toBe(true);
  });
  it.each([
    ['starts outside the zone', { x0: BACK_EDGE_ZONE + 1 }],
    ['starts well inside the page', { x0: 40 }],
    ['has not moved past the threshold', { dx: 10 }],
    ['goes left', { dx: -30 }],
    ['is vertical', { dx: 20, dy: 40 }],
    ['is only 1.5:1 horizontal', { dx: 30, dy: 20 }],
  ])('does not start when it %s', (_n, patch) => {
    expect(startsBackEdgeSwipe({ ...ok, ...patch })).toBe(false);
  });
});

describe('completesBackEdgeSwipe', () => {
  it('completes by distance or by velocity', () => {
    expect(completesBackEdgeSwipe({ dx: BACK_EDGE_DISTANCE, vx: 0 })).toBe(true);
    expect(completesBackEdgeSwipe({ dx: 15, vx: BACK_EDGE_VELOCITY })).toBe(true);
  });
  it('does not complete a short slow drag (an early lift)', () => {
    expect(
      completesBackEdgeSwipe({ dx: BACK_EDGE_DISTANCE - 1, vx: BACK_EDGE_VELOCITY - 0.1 }),
    ).toBe(false);
  });
});
