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
  backTarget,
  discardChangesMessage,
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

describe('backTarget', () => {
  it('Today exits, Settings goes to Today', () => {
    expect(backTarget({ screen: 'today', journalId: 'dreams' })).toEqual({ to: 'exit' });
    expect(backTarget({ screen: 'settings', journalId: 'dreams' })).toEqual({ to: 'today' });
  });
  it('a log closes its search first, otherwise goes to Today', () => {
    expect(backTarget({ screen: 'log', journalId: 'life', searchOpen: true })).toEqual({
      to: 'closeSearch',
    });
    expect(backTarget({ screen: 'log', journalId: 'life' })).toEqual({ to: 'today' });
  });
  it('Search goes to Today', () => {
    expect(backTarget({ screen: 'search', journalId: 'dreams' })).toEqual({ to: 'today' });
  });
  it('the add-entry page keeps its own chain, whatever journal it holds', () => {
    // The page decides in App (`backFromAdd`): leave prompts, recording discard, No dream.
    expect(backTarget({ screen: 'add', journalId: 'dreams' })).toEqual({ to: 'chain' });
    expect(backTarget({ screen: 'add', journalId: 'life' })).toEqual({ to: 'chain' });
  });
  it('ignores Back on the add-entry page while its entry is being deleted', () => {
    expect(backTarget({ screen: 'add', journalId: 'dreams', entryDeleting: true })).toEqual({
      to: 'none',
    });
    expect(backTarget({ screen: 'add', journalId: 'dreams', entryDeleting: false })).toEqual({
      to: 'chain',
    });
  });
  it('entryDeleting changes nothing on other screens', () => {
    expect(backTarget({ screen: 'log', journalId: 'dreams', entryDeleting: true })).toEqual({
      to: 'today',
    });
  });
});
