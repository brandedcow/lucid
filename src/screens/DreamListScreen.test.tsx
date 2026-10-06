import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dream } from '../types/dream';
import { DreamListScreen } from './DreamListScreen';

const mockToggle = jest.fn();
jest.mock('../hooks/useDreamPlayback', () => ({
  useDreamPlayback: () => ({ playingId: null, toggle: mockToggle }),
}));

const mockList = jest.fn();
const mockStatus = jest.fn();
jest.mock('../services/dreamStorage', () => ({
  listDreams: () => mockList(),
  getIndexStatus: () => mockStatus(),
}));

const dream = (over: Partial<Dream> = {}): Dream => ({
  id: 'd1',
  createdAt: '2026-10-06T08:30:00',
  durationMs: 65000,
  audioFileName: 'a.m4a',
  title: '',
  tags: [],
  ...over,
});

const written = (over: Partial<Dream> = {}): Dream =>
  dream({ audioFileName: undefined, durationMs: 0, ...over });

async function setup(dreams: Dream[], status: 'ok' | 'unreadable' = 'ok') {
  mockList.mockResolvedValue(dreams);
  mockStatus.mockResolvedValue(status);
  const onOpenDraft = jest.fn();
  await render(<DreamListScreen onRecord={jest.fn()} onOpenDraft={onOpenDraft} />);
  await screen.findByText('Record a dream');
  return { onOpenDraft };
}

beforeEach(() => jest.clearAllMocks());

describe('DreamListScreen', () => {
  it('renders a legacy dream with the date as its title and the duration', async () => {
    await setup([dream()]);
    expect(await screen.findByText('Tuesday, October 6 · 8:30 AM')).toBeTruthy();
    expect(screen.getByText('1:05')).toBeTruthy();
    expect(screen.getByLabelText('Play dream')).toBeTruthy();
    expect(screen.queryByText(/Not finished/)).toBeNull();
  });

  it('keeps a finished dream with audio and a transcript as before, not tappable', async () => {
    const { onOpenDraft } = await setup([
      dream({ title: 'Flying', transcript: 'I was flying', tags: ['sky'] }),
    ]);
    expect(await screen.findByText('Flying')).toBeTruthy();
    expect(screen.getByText('Tuesday, October 6 · 8:30 AM · sky')).toBeTruthy();
    expect(screen.queryByLabelText(/Not finished/)).toBeNull();
    await fireEvent.press(screen.getByText('Flying'));
    expect(onOpenDraft).not.toHaveBeenCalled();
  });

  it('shows a draft as Not finished and opens it on tap', async () => {
    const d = dream({ status: 'draft', title: 'Half a dream' });
    const { onOpenDraft } = await setup([d]);
    expect(await screen.findByText(/^Not finished · /)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Not finished: Half a dream'));
    expect(onOpenDraft).toHaveBeenCalledWith(d);
  });

  it('titles a draft by title, then transcript first line (truncated), then date', async () => {
    await setup([
      dream({ id: 'a', createdAt: '2026-10-06T10:00:00', status: 'draft', title: 'Named' }),
      dream({
        id: 'b',
        createdAt: '2026-10-06T09:00:00',
        status: 'draft',
        transcript: `\n  ${'x'.repeat(80)}\nsecond line`,
      }),
      dream({ id: 'c', createdAt: '2026-10-06T08:00:00', status: 'draft' }),
    ]);
    expect(await screen.findByText('Named')).toBeTruthy();
    expect(screen.getByText(`${'x'.repeat(60)}…`)).toBeTruthy();
    expect(screen.queryByText(/second line/)).toBeNull();
    expect(screen.getByText('Tuesday, October 6 · 8:00 AM')).toBeTruthy();
    expect(screen.getByText('Not finished')).toBeTruthy();
  });

  it('shows a word count and a glyph, with no play button, for a dream without audio', async () => {
    await setup([
      written({
        id: 'a',
        createdAt: '2026-10-06T10:00:00',
        title: 'Written',
        transcript: 'one two three',
      }),
      written({ id: 'b', createdAt: '2026-10-06T09:00:00', title: 'Tiny', transcript: 'one' }),
      written({ id: 'c', createdAt: '2026-10-06T08:00:00', title: 'Empty' }),
    ]);
    expect(await screen.findByText('3 words')).toBeTruthy();
    expect(screen.getByText('1 word')).toBeTruthy();
    expect(screen.getAllByText('⌨')).toHaveLength(3);
    expect(screen.queryByLabelText('Play dream')).toBeNull();
    expect(screen.queryByText('0:00')).toBeNull();
    expect(screen.queryByText('0 words')).toBeNull();
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it('plays a dream with audio through the playback hook', async () => {
    await setup([dream()]);
    await fireEvent.press(await screen.findByLabelText('Play dream'));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the emotion capitalized without changing the stored value', async () => {
    const d = dream({ title: 'Flying', emotion: 'joyful' });
    await setup([d]);
    expect(await screen.findByText('Tuesday, October 6 · 8:30 AM · Joyful')).toBeTruthy();
    expect(d.emotion).toBe('joyful');
  });

  it('keeps drafts and finished dreams mixed in the order given (newest first)', async () => {
    await setup([
      dream({ id: 'a', createdAt: '2026-10-06T10:00:00', title: 'First' }),
      dream({ id: 'b', createdAt: '2026-10-06T09:00:00', status: 'draft', title: 'Second' }),
      dream({ id: 'c', createdAt: '2026-10-06T08:00:00', title: 'Third' }),
    ]);
    const order = (await screen.findAllByText(/^(First|Second|Third)$/)).map(
      (n) => n.props.children as string,
    );
    expect(order).toEqual(['First', 'Second', 'Third']);
  });

  it('shows the usual empty state when there are no dreams and the index is fine', async () => {
    await setup([]);
    expect(await screen.findByText('No dreams saved yet.')).toBeTruthy();
  });

  it('says the dreams could not be read when the index is unreadable', async () => {
    await setup([], 'unreadable');
    expect(
      await screen.findByText('Your saved dreams could not be read. Your recordings are safe.'),
    ).toBeTruthy();
    expect(screen.queryByText('No dreams saved yet.')).toBeNull();
  });
});
