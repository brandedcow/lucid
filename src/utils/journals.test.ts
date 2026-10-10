import { Alert } from 'react-native';
import { Dream } from '../types/dream';
import { confirmDeleteDream } from './confirmDelete';
import { dreamRow } from './dreamLog';
import {
  BUILT_IN_JOURNALS,
  entriesFor,
  journalById,
  journalCopy,
  journalOf,
  kindOf,
  showsEmotion,
  titleRequired,
} from './journals';
import { DISCARD_CHANGES_MESSAGE } from './sessionNavigation';

describe('journalOf', () => {
  it('defaults an absent journalId to dreams', () => {
    expect(journalOf({})).toBe('dreams');
  });
  it('returns an explicit dreams id', () => {
    expect(journalOf({ journalId: 'dreams' })).toBe('dreams');
  });
  it('returns life', () => {
    expect(journalOf({ journalId: 'life' })).toBe('life');
  });
  it('returns an unknown id as is', () => {
    expect(journalOf({ journalId: 'future' })).toBe('future');
  });
});

const rec = (id: string, journalId?: string) => ({ id, ...(journalId ? { journalId } : {}) });

describe('entriesFor', () => {
  const all = [rec('1'), rec('2', 'dreams'), rec('3', 'life'), rec('4', 'future')];

  it('treats a record without journalId as Dreams', () => {
    expect(entriesFor(all, 'dreams').map((r) => r.id)).toEqual(['1', '2']);
  });
  it('matches by equality and hides unknown journals from the built-ins', () => {
    expect(entriesFor(all, 'life').map((r) => r.id)).toEqual(['3']);
    expect(entriesFor(all, 'future').map((r) => r.id)).toEqual(['4']);
  });
  it('does not change its input', () => {
    entriesFor(all, 'life');
    expect(all).toHaveLength(4);
  });
});

describe('built-in journals', () => {
  it('are Dreams then Life', () => {
    expect(BUILT_IN_JOURNALS).toEqual([
      { id: 'dreams', name: 'Dreams', kind: 'dream' },
      { id: 'life', name: 'Life', kind: 'journal' },
    ]);
  });
  it('journalById finds built-ins and not others; kindOf falls back to dream', () => {
    expect(journalById('life')?.name).toBe('Life');
    expect(journalById('nope')).toBeUndefined();
    expect(kindOf('dreams')).toBe('dream');
    expect(kindOf('life')).toBe('journal');
    expect(kindOf('nope')).toBe('dream');
  });
  it('titleRequired and showsEmotion', () => {
    expect(titleRequired('dream')).toBe(true);
    expect(titleRequired('journal')).toBe(false);
    expect(showsEmotion('dream')).toBe(true);
    expect(showsEmotion('journal')).toBe(true);
  });
});

describe('journalCopy dream values are the strings in use today', () => {
  const c = journalCopy('dream');
  it('match the literals', () => {
    expect(c).toMatchObject({
      captureHeadline: 'What happened in my dream?',
      tips: ['Stay still', 'Work backwards', 'Record the emotion', 'Think in the present tense'],
      skipLabel: 'No dream',
      saveButton: 'Save dream',
      newButton: 'New dream',
      logHeader: 'Dreams',
      searchLabel: 'Search dreams',
      emptyTitle: 'No dreams yet.',
      emptyBody: 'Tap New dream to record one.',
      noMatchTitle: 'No dreams match',
      unreadableLog: 'Your saved dreams could not be read. Your recordings are safe.',
      discardTitle: 'Discard this dream?',
      discardBody: 'Your recording and text will be deleted.',
      discardChangesMessage: 'Your changes to this dream will be lost.',
      deleteTitle: 'Delete this dream?',
      deleteBodyWithAudio:
        "The recording and text will be permanently deleted. This can't be undone.",
      deleteBodyNoAudio: "The text will be permanently deleted. This can't be undone.",
      deleteFailureTitle: 'Could not delete dream',
      deleteFailureUnreadable: 'Your saved dreams could not be read. Nothing was deleted.',
      deleteFailureSafetyCopy:
        'A saved copy of your dreams is damaged, so this dream was not deleted. Nothing was changed.',
      saveFailureTitle: 'Could not save your dream',
      saveFailureMessage: 'Please try again.',
      saveFailureUnreadable:
        'Your saved dreams could not be read, so this dream was not saved. Your recording is still here.',
      datePrefix: 'Dream · ',
      dateFallback: 'Dream',
      titlePlaceholder: 'Name this dream',
      readItBackTextLabel: 'Dream text',
      untitled: 'Untitled dream',
      editLabel: 'Edit dream',
      deleteLabel: 'Delete dream',
      microphoneMessage:
        'Lucid needs the microphone to record your dream. You can allow it in Settings.',
    });
    expect(c.deleteRowLabel('Flying')).toBe('Delete dream: Flying');
  });

  it('agree with the constants the app uses (drift guard)', () => {
    expect(c.discardChangesMessage).toBe(DISCARD_CHANGES_MESSAGE);
    expect(c.untitled).toBe(
      dreamRow({ id: '1', createdAt: 'bad', durationMs: 0, title: '', tags: [] } as Dream).title,
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    confirmDeleteDream({ hasAudio: true, onConfirm: () => {}, onClose: () => {} });
    confirmDeleteDream({ hasAudio: false, onConfirm: () => {}, onClose: () => {} });
    expect(alert.mock.calls[0].slice(0, 2)).toEqual([c.deleteTitle, c.deleteBodyWithAudio]);
    expect(alert.mock.calls[1].slice(0, 2)).toEqual([c.deleteTitle, c.deleteBodyNoAudio]);
    alert.mockRestore();
  });
});

describe('journalCopy life values', () => {
  const c = journalCopy('journal');
  it('match the approved wording', () => {
    expect(c).toMatchObject({
      captureHeadline: 'What happened today?',
      tips: ['Start anywhere', 'Say it as it comes', 'Note how you felt', 'Keep it short or long'],
      skipLabel: null,
      saveButton: 'Save entry',
      newButton: 'New entry',
      logHeader: 'Life',
      discardTitle: 'Discard this entry?',
      deleteTitle: 'Delete this entry?',
      deleteBodyWithAudio:
        "The recording and text will be permanently deleted. This can't be undone.",
      deleteBodyNoAudio: "The text will be permanently deleted. This can't be undone.",
      deleteFailureTitle: 'Could not delete entry',
      datePrefix: 'Life · ',
      dateFallback: 'Life',
      titlePlaceholder: 'Title (optional)',
      untitled: 'Untitled entry',
    });
  });
  it('every Life string is filled in and never says dream', () => {
    for (const [key, value] of Object.entries(c)) {
      if (value === null) continue;
      const text =
        typeof value === 'function'
          ? value('x')
          : typeof value === 'string'
            ? value
            : JSON.stringify(value);
      expect(text.length).toBeGreaterThan(0);
      expect(`${key}: ${text}`).not.toMatch(/dream/i);
    }
  });
});
