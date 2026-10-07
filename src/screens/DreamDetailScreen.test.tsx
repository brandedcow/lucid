import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dream } from '../types/dream';
import { DreamDetailScreen } from './DreamDetailScreen';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
const mockPlayerCreated = jest.fn();

jest.mock('expo-audio', () => ({
  useAudioPlayer: (uri: string) => {
    mockPlayerCreated(uri);
    return mockPlayer;
  },
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
}));

const mockUri = jest.fn((d: { audioFileName?: string }): string | null =>
  d.audioFileName ? `file:///dreams/${d.audioFileName}` : null,
);
jest.mock('../services/dreamStorage', () => ({
  dreamAudioUri: (d: { audioFileName?: string }) => mockUri(d),
}));

// A local-time ISO string so the date line is stable in any timezone.
const CREATED = new Date(2026, 9, 4, 6, 42).toISOString();

const base: Dream = {
  id: 'a',
  createdAt: CREATED,
  durationMs: 68000,
  audioFileName: 'a.m4a',
  title: 'The endless hallway',
  emotion: 'uneasy, curious',
  tags: ['water', "grandmother's house", 'stairs'],
  transcript: 'First paragraph.\n\nSecond paragraph.',
};

const setup = async (dream: Dream = base) => {
  const onBack = jest.fn();
  const onEdit = jest.fn();
  await render(<DreamDetailScreen dream={dream} onBack={onBack} onEdit={onEdit} />);
  return { onBack, onEdit };
};

beforeEach(() => {
  mockPlayerCreated.mockClear();
  mockUri.mockClear();
});

describe('DreamDetailScreen', () => {
  it('shows the date line and title as a header', async () => {
    await setup();
    expect(screen.getByText('Sunday, October 4 · 6:42 AM')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'The endless hallway' })).toBeTruthy();
  });

  it('shows all chips, emotions first, as one accessible group', async () => {
    await setup();
    expect(screen.getByText('Uneasy')).toBeTruthy();
    expect(screen.getByText('Curious')).toBeTruthy();
    expect(screen.getByText('water')).toBeTruthy();
    expect(screen.getByText("grandmother's house")).toBeTruthy();
    expect(screen.getByText('stairs')).toBeTruthy();
    expect(screen.queryByText(/^\+\d/)).toBeNull();
    expect(screen.getByLabelText(/Feelings: Uneasy, Curious\. Tags: water/)).toBeTruthy();
  });

  it('shows every chip when there are many', async () => {
    const tags = Array.from({ length: 12 }, (_, i) => `tag${i}`);
    await setup({ ...base, emotion: 'a, b, c, d', tags });
    for (const t of tags) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getByText('D')).toBeTruthy();
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it('renders no chips when there are none', async () => {
    await setup({ ...base, emotion: undefined, tags: [] });
    expect(screen.queryByTestId('dream-chips')).toBeNull();
  });

  it('shows the compact player for a dream with audio', async () => {
    await setup();
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(screen.getByText('1:08')).toBeTruthy();
    expect(mockPlayerCreated).toHaveBeenCalledWith('file:///dreams/a.m4a');
  });

  it('resets the player between dreams', async () => {
    await setup();
    const other: Dream = { ...base, id: 'b', audioFileName: 'b.m4a' };
    await screen.rerender(
      <DreamDetailScreen dream={other} onBack={jest.fn()} onEdit={jest.fn()} />,
    );
    expect(mockPlayerCreated).toHaveBeenCalledWith('file:///dreams/b.m4a');
    expect(screen.getAllByLabelText('Play recording')).toHaveLength(1);
  });

  it('shows no player for a dream without audio', async () => {
    await setup({ ...base, audioFileName: undefined, durationMs: 0 });
    expect(screen.queryByLabelText('Play recording')).toBeNull();
  });

  it('shows no player when the audio uri resolves to null', async () => {
    mockUri.mockReturnValueOnce(null);
    await setup();
    expect(screen.queryByLabelText('Play recording')).toBeNull();
  });

  it('renders each paragraph as its own text', async () => {
    await setup();
    expect(screen.getByText('First paragraph.')).toBeTruthy();
    expect(screen.getByText('Second paragraph.')).toBeTruthy();
    expect(screen.getByText('First paragraph.').props.selectable).toBe(true);
  });

  it('renders a single block as one text', async () => {
    await setup({ ...base, transcript: 'Just one block\nwith a line break.' });
    expect(screen.getByText(/Just one block/)).toBeTruthy();
  });

  it('says "No text yet" without a transcript', async () => {
    await setup({ ...base, transcript: undefined });
    expect(screen.getByText('No text yet')).toBeTruthy();
  });

  it('says "No text yet" for a blank transcript', async () => {
    await setup({ ...base, transcript: '   ' });
    expect(screen.getByText('No text yet')).toBeTruthy();
  });

  it('uses the short date as the title of an untitled legacy dream', async () => {
    await setup({ ...base, title: '' });
    expect(screen.getByRole('header').props.children).toMatch(/^[A-Z][a-z]{2} \d{1,2}/);
  });

  it('renders a very long title and transcript', async () => {
    const title = 'word '.repeat(80).trim();
    const transcript = 'Long paragraph text. '.repeat(500).trim();
    await setup({ ...base, title, transcript });
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
    expect(screen.getByText(transcript)).toBeTruthy();
  });

  it('renders a draft without crashing', async () => {
    await setup({
      ...base,
      status: 'draft',
      title: '',
      transcript: undefined,
      emotion: undefined,
      tags: [],
    });
    expect(screen.getByText('Untitled dream')).toBeTruthy();
    expect(screen.getByText('No text yet')).toBeTruthy();
  });

  it('survives an invalid date', async () => {
    await setup({ ...base, createdAt: 'nonsense' });
    expect(screen.getByText('The endless hallway')).toBeTruthy();
    expect(screen.queryByText(/ · /)).toBeNull();
  });

  it('calls onBack and onEdit from labeled buttons', async () => {
    const { onBack, onEdit } = await setup();
    await fireEvent.press(screen.getByLabelText('Back'));
    await fireEvent.press(screen.getByLabelText('Edit dream'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('has no delete, "Also tagged" or "See all"', async () => {
    await setup();
    expect(screen.queryByText(/delete|also tagged|see all/i)).toBeNull();
  });
});
