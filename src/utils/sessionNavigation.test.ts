import { Session } from '../hooks/useDreamSession';
import {
  DISCARD_CHANGES_DISCARD,
  DISCARD_CHANGES_KEEP,
  DISCARD_CHANGES_MESSAGE,
  DISCARD_CHANGES_TITLE,
  backTarget,
  discardChangesMessage,
  hasAtStake,
  hasEdits,
  hasSomethingToKeep,
  readItBackBack,
  reviewBack,
} from './sessionNavigation';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const base: Session = {
  origin: 'capture',
  journalId: 'dreams',
  transcript: '',
  title: '',
  emotion: '',
  emotionDraft: '',
  tags: [],
  tagDraft: '',
  passedThroughReadItBack: false,
};
const audio = { uri: 'u', durationMs: 1, persisted: false };

describe('hasAtStake', () => {
  it('is true with a recording or non-blank text', () => {
    expect(hasAtStake({ ...base, audio })).toBe(true);
    expect(hasAtStake({ ...base, origin: 'write', transcript: 'hi' })).toBe(true);
  });
  it('is false for empty or blank text without audio', () => {
    expect(hasAtStake({ ...base, origin: 'write' })).toBe(false);
    expect(hasAtStake({ ...base, origin: 'write', transcript: '  \n ' })).toBe(false);
  });
});

describe('hasSomethingToKeep', () => {
  it('is false for an empty or blank session', () => {
    expect(hasSomethingToKeep({ ...base, origin: 'write' })).toBe(false);
    expect(
      hasSomethingToKeep({
        ...base,
        transcript: ' ',
        title: ' ',
        emotion: ' ',
        tagDraft: ' ',
        emotionDraft: ' ',
      }),
    ).toBe(false);
  });
  it('is true for audio, text, a title, an emotion, a tag or pending tag text', () => {
    expect(hasSomethingToKeep({ ...base, audio })).toBe(true);
    expect(hasSomethingToKeep({ ...base, transcript: 'x' })).toBe(true);
    expect(hasSomethingToKeep({ ...base, title: 'x' })).toBe(true);
    expect(hasSomethingToKeep({ ...base, emotion: 'x' })).toBe(true);
    expect(hasSomethingToKeep({ ...base, tags: ['x'] })).toBe(true);
    expect(hasSomethingToKeep({ ...base, tagDraft: 'x' })).toBe(true);
    expect(hasSomethingToKeep({ ...base, emotionDraft: 'x' })).toBe(true);
  });
});

describe('readItBackBack', () => {
  it('confirms a discard for a recording', () => {
    expect(readItBackBack({ ...base, audio }, false)).toBe('confirmDiscard');
  });
  it('confirms a discard for written text', () => {
    expect(readItBackBack({ ...base, origin: 'write', transcript: 'x' }, false)).toBe(
      'confirmDiscard',
    );
  });
  it('goes straight to capture when nothing is at stake', () => {
    expect(readItBackBack({ ...base, origin: 'write' }, false)).toBe('capture');
  });
  it('returns to Review without confirmation when opened via Edit', () => {
    expect(readItBackBack({ ...base, audio, passedThroughReadItBack: true }, true)).toBe('review');
  });
  it('sends a reopened draft to the list', () => {
    expect(readItBackBack({ ...base, origin: 'draft' }, false)).toBe('list');
  });
});

describe('reviewBack', () => {
  it('goes to Read it back for a new dream', () => {
    expect(reviewBack(base)).toBe('readItBack');
    expect(reviewBack({ ...base, origin: 'write' })).toBe('readItBack');
  });
  it('leaves a reopened draft to the list', () => {
    expect(reviewBack({ ...base, origin: 'draft' })).toBe('draftToList');
  });
  it('is blocked while a save is in flight, for any origin', () => {
    expect(reviewBack(base, true)).toBe('blocked');
    expect(reviewBack({ ...base, origin: 'draft' }, true)).toBe('blocked');
  });
});

describe('hasEdits', () => {
  const baseline = { title: 'Hall', emotion: 'Calm', tags: ['a', 'b'], transcript: 'text' };
  const edit: Session = {
    ...base,
    origin: 'edit',
    title: 'Hall',
    emotion: 'Calm',
    tags: ['a', 'b'],
    transcript: 'text',
    baseline,
  };
  it('is false when nothing changed or there is no baseline', () => {
    expect(hasEdits(edit)).toBe(false);
    expect(hasEdits({ ...edit, baseline: undefined, title: 'other' })).toBe(false);
  });
  it('ignores whitespace-only changes to title, transcript and emotion', () => {
    expect(hasEdits({ ...edit, title: '  Hall ', transcript: 'text\n', emotion: ' Calm' })).toBe(
      false,
    );
  });
  it('counts real changes, including case in emotion (no folding)', () => {
    expect(hasEdits({ ...edit, title: 'Hall 2' })).toBe(true);
    expect(hasEdits({ ...edit, transcript: 'text more' })).toBe(true);
    expect(hasEdits({ ...edit, emotion: 'calm' })).toBe(true);
    expect(hasEdits({ ...edit, emotion: '' })).toBe(true);
  });
  it('counts tags added, removed or reordered', () => {
    expect(hasEdits({ ...edit, tags: ['a', 'b', 'c'] })).toBe(true);
    expect(hasEdits({ ...edit, tags: ['a'] })).toBe(true);
    expect(hasEdits({ ...edit, tags: ['b', 'a'] })).toBe(true);
  });
  it('counts pending tag text but not blank tag text', () => {
    expect(hasEdits({ ...edit, tagDraft: 'x' })).toBe(true);
    expect(hasEdits({ ...edit, tagDraft: '  ' })).toBe(false);
  });
  it('counts pending emotion text but not blank emotion text', () => {
    expect(hasEdits({ ...edit, emotionDraft: 'x' })).toBe(true);
    expect(hasEdits({ ...edit, emotionDraft: '  ' })).toBe(false);
  });
});

describe('edit origin navigation', () => {
  const edit: Session = { ...base, origin: 'edit', audio: { ...audio, persisted: true } };
  it('reviewBack gives editBack, still blocked while saving', () => {
    expect(reviewBack(edit)).toBe('editBack');
    expect(reviewBack(edit, true)).toBe('blocked');
  });
  it('Read it back always returns to Review, with or without audio or text', () => {
    expect(readItBackBack(edit, false)).toBe('review');
    expect(readItBackBack(edit, true)).toBe('review');
    expect(readItBackBack({ ...edit, audio: undefined, transcript: 'x' }, false)).toBe('review');
  });
  it('exports the discard confirmation strings', () => {
    expect(DISCARD_CHANGES_TITLE).toBe('Discard changes?');
    expect(DISCARD_CHANGES_MESSAGE).toBe('Your changes to this dream will be lost.');
    expect(DISCARD_CHANGES_KEEP).toBe('Keep editing');
    expect(DISCARD_CHANGES_DISCARD).toBe('Discard');
  });
});

describe('discardChangesMessage', () => {
  it('is journal-aware and Dreams keeps the existing wording', () => {
    expect(discardChangesMessage('dream')).toBe(DISCARD_CHANGES_MESSAGE);
    expect(discardChangesMessage('journal')).toBe('Your changes to this entry will be lost.');
    expect(discardChangesMessage('journal')).not.toMatch(/dream/i);
  });
});

describe('hasSomethingToKeep for an untitled Life entry', () => {
  it('does not depend on a title: text alone is something to keep', () => {
    expect(hasSomethingToKeep({ ...base, journalId: 'life', transcript: 'x' })).toBe(true);
    expect(hasSomethingToKeep({ ...base, journalId: 'life' })).toBe(false);
  });
});

describe('backTarget', () => {
  it('Dreams capture with no flowReturn counts as No dream when idle, asks when busy', () => {
    expect(backTarget({ screen: 'capture', journalId: 'dreams' })).toEqual({ to: 'noDream' });
    expect(backTarget({ screen: 'capture', journalId: 'dreams', captureBusy: true })).toEqual({
      to: 'confirmLeave',
    });
  });
  it('Life capture goes to the Life log, and asks while recording', () => {
    expect(backTarget({ screen: 'capture', journalId: 'life' })).toEqual({
      to: 'log',
      journalId: 'life',
    });
    expect(backTarget({ screen: 'capture', journalId: 'life', captureBusy: true })).toEqual({
      to: 'confirmLeave',
    });
  });
  it('Journals home goes to Today', () => {
    expect(backTarget({ screen: 'journals', journalId: 'dreams' })).toEqual({ to: 'today' });
  });
  it('Today exits, Settings goes to Today', () => {
    expect(backTarget({ screen: 'today', journalId: 'dreams' })).toEqual({ to: 'exit' });
    expect(backTarget({ screen: 'settings', journalId: 'dreams' })).toEqual({ to: 'today' });
  });
  it('the launch Dreams capture is No dream when idle and asks when busy, whatever flowReturn says', () => {
    for (const flowReturn of [undefined, 'today', 'log'] as const) {
      expect(
        backTarget({ screen: 'capture', journalId: 'dreams', captureLaunch: true, flowReturn }),
      ).toEqual({ to: 'noDream' });
      expect(
        backTarget({
          screen: 'capture',
          journalId: 'dreams',
          captureLaunch: true,
          flowReturn,
          captureBusy: true,
        }),
      ).toEqual({ to: 'confirmLeave' });
    }
  });
  it('a non-launch Dreams capture returns to Today or the Dreams log', () => {
    expect(backTarget({ screen: 'capture', journalId: 'dreams', flowReturn: 'today' })).toEqual({
      to: 'today',
    });
    expect(backTarget({ screen: 'capture', journalId: 'dreams', flowReturn: 'log' })).toEqual({
      to: 'log',
      journalId: 'dreams',
    });
  });
  it('a non-launch Dreams capture asks while recording', () => {
    expect(
      backTarget({
        screen: 'capture',
        journalId: 'dreams',
        flowReturn: 'today',
        captureBusy: true,
      }),
    ).toEqual({ to: 'confirmLeave' });
    expect(
      backTarget({ screen: 'capture', journalId: 'dreams', flowReturn: 'log', captureBusy: true }),
    ).toEqual({ to: 'confirmLeave' });
  });
  it('Life capture returns to Today when opened from Today, else to its log', () => {
    expect(backTarget({ screen: 'capture', journalId: 'life', flowReturn: 'today' })).toEqual({
      to: 'today',
    });
    expect(backTarget({ screen: 'capture', journalId: 'life', flowReturn: 'log' })).toEqual({
      to: 'log',
      journalId: 'life',
    });
    expect(
      backTarget({ screen: 'capture', journalId: 'life', flowReturn: 'today', captureBusy: true }),
    ).toEqual({ to: 'confirmLeave' });
  });
  it('no capture case exits the app', () => {
    for (const journalId of ['dreams', 'life'] as const) {
      for (const flowReturn of [undefined, 'today', 'log'] as const) {
        for (const captureLaunch of [false, true]) {
          for (const captureBusy of [false, true]) {
            expect(
              backTarget({ screen: 'capture', journalId, flowReturn, captureLaunch, captureBusy }),
            ).not.toEqual({ to: 'exit' });
          }
        }
      }
    }
  });
  it('a log closes its search first, otherwise goes to Journals home', () => {
    expect(backTarget({ screen: 'log', journalId: 'life', searchOpen: true })).toEqual({
      to: 'closeSearch',
    });
    expect(backTarget({ screen: 'log', journalId: 'life' })).toEqual({ to: 'journals' });
  });
  it('Search goes to Journals home', () => {
    expect(backTarget({ screen: 'search', journalId: 'dreams' })).toEqual({ to: 'journals' });
  });
  it('a detail goes back to its source', () => {
    expect(backTarget({ screen: 'detail', journalId: 'life', detailFrom: 'log' })).toEqual({
      to: 'log',
      journalId: 'life',
    });
    expect(backTarget({ screen: 'detail', journalId: 'dreams' })).toEqual({
      to: 'log',
      journalId: 'dreams',
    });
    expect(backTarget({ screen: 'detail', journalId: 'life', detailFrom: 'search' })).toEqual({
      to: 'search',
    });
  });
  it('a detail opened from Today goes back to Today', () => {
    expect(backTarget({ screen: 'detail', journalId: 'life', detailFrom: 'today' })).toEqual({
      to: 'today',
    });
    expect(backTarget({ screen: 'detail', journalId: 'dreams', detailFrom: 'today' })).toEqual({
      to: 'today',
    });
  });
  it('a detail does nothing while its delete is in flight', () => {
    expect(
      backTarget({
        screen: 'detail',
        journalId: 'life',
        detailFrom: 'search',
        detailDeleting: true,
      }),
    ).toEqual({ to: 'none' });
    expect(
      backTarget({
        screen: 'detail',
        journalId: 'life',
        detailFrom: 'today',
        detailDeleting: true,
      }),
    ).toEqual({ to: 'none' });
  });
  it('Read it back and Review keep their own chains', () => {
    expect(backTarget({ screen: 'readItBack', journalId: 'life' })).toEqual({ to: 'chain' });
    expect(backTarget({ screen: 'review', journalId: 'dreams' })).toEqual({ to: 'chain' });
    // The add-entry page decides in App (`backFromAdd`).
    expect(backTarget({ screen: 'add', journalId: 'dreams' })).toEqual({ to: 'chain' });
  });
});
