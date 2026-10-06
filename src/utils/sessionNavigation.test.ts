import { Session } from '../hooks/useDreamSession';
import { hasAtStake, readItBackBack, reviewBack } from './sessionNavigation';

jest.mock('expo-file-system', () => jest.requireActual('../test/fakeFileSystem'));

const base: Session = {
  origin: 'capture',
  transcript: '',
  title: '',
  emotion: '',
  tags: [],
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
});
