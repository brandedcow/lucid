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

  it('shows each emotion entry capitalized, in a multi-emotion list', async () => {
    const d = dream({ title: 'Flying', emotion: 'calm, a bit uneasy' });
    await setup([d]);
    expect(
      await screen.findByText('Tuesday, October 6 · 8:30 AM · Calm, A bit uneasy'),
    ).toBeTruthy();
    expect(d.emotion).toBe('calm, a bit uneasy');
  });

  it('composes a draft line from the status, date, emotion and tags', async () => {
    await setup([
      dream({ status: 'draft', title: 'Half', emotion: 'calm, uneasy', tags: ['sky', 'water'] }),
    ]);
    expect(
      await screen.findByText(
        'Not finished · Tuesday, October 6 · 8:30 AM · Calm, Uneasy · sky · water',
      ),
    ).toBeTruthy();
  });

  it('keeps the date in the line of a written dream that has a title', async () => {
    await setup([written({ title: 'Written', transcript: 'one two' })]);
    expect(await screen.findByText('Written')).toBeTruthy();
    expect(screen.getByText('Tuesday, October 6 · 8:30 AM')).toBeTruthy();
  });

  it('keeps the play button of a draft with audio separate from the open area', async () => {
    const d = dream({ status: 'draft', title: 'Half a dream' });
    const { onOpenDraft } = await setup([d]);
    const play = await screen.findByLabelText('Play dream');
    // The labeled row Pressable must not be an ancestor, or screen readers would hide the button.
    let node = play.parent;
    while (node) {
      expect(node.props.accessibilityLabel).not.toBe('Not finished: Half a dream');
      node = node.parent;
    }
    await fireEvent.press(play);
    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(onOpenDraft).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Not finished: Half a dream'));
    expect(onOpenDraft).toHaveBeenCalledWith(d);
  });

  it('opens a written draft from its glyph too, since the glyph is part of the tap area', async () => {
    const d = written({ status: 'draft', title: 'Written draft', transcript: 'one' });
    const { onOpenDraft } = await setup([d]);
    await fireEvent.press(await screen.findByText('⌨'));
    expect(onOpenDraft).toHaveBeenCalledWith(d);
  });

  it('cuts a long draft title by code point, never leaving half an emoji', async () => {
    const line = `${'x'.repeat(59)}😀${'y'.repeat(10)}`;
    await setup([dream({ status: 'draft', transcript: line })]);
    const expected = `${'x'.repeat(59)}😀…`;
    expect(await screen.findByText(expected)).toBeTruthy();
    // No lone surrogate anywhere in the shown title.
    expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(expected)).toBe(false);
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
