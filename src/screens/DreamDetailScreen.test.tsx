import { Alert, AlertButton, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { colors } from '../theme';
import { Dream } from '../types/dream';
import { BUILT_IN_JOURNALS } from '../utils/journals';
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

const mockUri = jest.fn((r: { fileName: string }): string => `file:///dreams/${r.fileName}`);
jest.mock('../services/dreamStorage', () => ({
  recordingUri: (r: { fileName: string }) => mockUri(r),
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
  it('shows "Dream · <date>" centered in the header and the title as a heading', async () => {
    await setup();
    expect(screen.getByText('Dream · Sunday, October 4')).toBeTruthy();
    expect(screen.queryByText(/6:42/)).toBeNull();
    expect(screen.getByRole('header', { name: 'The endless hallway' })).toBeTruthy();
  });

  it('shows the feelings as one accessible group and no tag chips', async () => {
    await setup();
    expect(screen.getByText('Uneasy')).toBeTruthy();
    expect(screen.getByText('Curious')).toBeTruthy();
    expect(screen.queryByText('water')).toBeNull();
    expect(screen.queryByText('stairs')).toBeNull();
    expect(screen.queryByText(/^\+\d/)).toBeNull();
    expect(screen.getByLabelText('Feelings: Uneasy, Curious.')).toBeTruthy();
  });

  it('shows every feeling when there are many', async () => {
    await setup({ ...base, emotion: 'a, b, c, d', tags: [] });
    expect(screen.getByText('D')).toBeTruthy();
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it('highlights #tags in the text and adds no legacy line when they are all in it', async () => {
    await setup({ ...base, transcript: 'Walked by the #water again.', tags: ['water'] });
    const tag = screen.getByText('#water');
    expect(StyleSheet.flatten(tag.props.style)).toMatchObject({
      color: colors.accent,
      fontWeight: '600',
    });
    expect(screen.queryByTestId('legacy-tags')).toBeNull();
  });

  it('shows stored tags missing from the text as a trailing #tag line', async () => {
    await setup({
      ...base,
      transcript: 'Walked by the #water.',
      tags: ['water', "grandmother's house", 'bad dream', '2024'],
    });
    const line = screen.getByTestId('legacy-tags');
    expect(line).toHaveTextContent('#grandmother-s-house #bad-dream');
    expect(screen.getByText('#bad-dream')).toBeTruthy();
    expect(screen.getAllByText('#water')).toHaveLength(1);
  });

  it('shows legacy tags even when the entry has no text', async () => {
    await setup({ ...base, transcript: undefined, tags: ['stairs'] });
    expect(screen.getByTestId('legacy-tags')).toHaveTextContent('#stairs');
    expect(screen.queryByText('No text yet')).toBeNull();
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

  it('shows one labelled player per stored recording, with each length', async () => {
    await setup({
      ...base,
      audioFileName: undefined,
      recordings: [
        { fileName: 'r1.m4a', durationMs: 10000 },
        { fileName: 'r2.m4a', durationMs: 20000 },
        { fileName: 'r3.m4a', durationMs: 30000 },
      ],
    });
    expect(screen.getByLabelText('Play voice note 1 of 3')).toBeTruthy();
    expect(screen.getByLabelText('Play voice note 2 of 3')).toBeTruthy();
    expect(screen.getByLabelText('Play voice note 3 of 3')).toBeTruthy();
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    for (const t of ['0:10', '0:20', '0:30']) expect(screen.getByText(t)).toBeTruthy();
    expect(mockPlayerCreated).toHaveBeenCalledWith('file:///dreams/r1.m4a');
    expect(mockPlayerCreated).toHaveBeenCalledWith('file:///dreams/r3.m4a');
  });

  it('shows the single player with the plain label for one stored recording', async () => {
    await setup({
      ...base,
      audioFileName: undefined,
      recordings: [{ fileName: 'r1.m4a', durationMs: 5000 }],
    });
    expect(screen.getAllByLabelText('Play recording')).toHaveLength(1);
    expect(mockPlayerCreated).toHaveBeenCalledWith('file:///dreams/r1.m4a');
  });

  it('renders each paragraph as its own text', async () => {
    await setup();
    expect(screen.getByText('First paragraph.')).toBeTruthy();
    expect(screen.getByText('Second paragraph.')).toBeTruthy();
    // The matched node is the inner run; the paragraph Text is its parent.
    expect(screen.getByText('First paragraph.').parent?.props.selectable).toBe(true);
  });

  it('renders a single block as one text', async () => {
    await setup({ ...base, transcript: 'Just one block\nwith a line break.' });
    expect(screen.getByText(/Just one block/)).toBeTruthy();
  });

  it('says "No text yet" without a transcript', async () => {
    await setup({ ...base, transcript: undefined, tags: [] });
    expect(screen.getByText('No text yet')).toBeTruthy();
  });

  it('says "No text yet" for a blank transcript', async () => {
    await setup({ ...base, transcript: '   ', tags: [] });
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
    expect(screen.getByText('Dream')).toBeTruthy();
    expect(screen.queryByText(/Invalid/)).toBeNull();
  });

  it('calls onBack and onEdit from labeled buttons', async () => {
    const { onBack, onEdit } = await setup();
    await fireEvent.press(screen.getByLabelText('Back'));
    await fireEvent.press(screen.getByLabelText('More options'));
    await fireEvent.press(screen.getByLabelText('Edit dream'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Edit dream')).toBeNull();
  });

  it('has one "..." button and no standalone Edit or Delete control', async () => {
    await setup();
    expect(screen.getByRole('button', { name: 'More options' })).toBeTruthy();
    expect(screen.queryByLabelText('Edit dream')).toBeNull();
    expect(screen.queryByLabelText('Delete dream')).toBeNull();
    expect(screen.queryByText('Delete dream')).toBeNull();
  });

  it('has no "Also tagged" or "See all"', async () => {
    await setup();
    expect(screen.queryByText(/also tagged|see all/i)).toBeNull();
  });
});

describe('DreamDetailScreen delete', () => {
  const noAudio: Dream = { ...base, audioFileName: undefined, durationMs: 0 };
  const buttons = () => (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
  const press = (text: string) =>
    act(async () => {
      buttons()
        .find((b) => b.text === text)
        ?.onPress?.();
    });
  const ui = (
    dream: Dream,
    onDelete?: () => Promise<void>,
    deleting?: boolean,
    deleteBlocked?: boolean,
  ) => (
    <DreamDetailScreen
      dream={dream}
      onBack={jest.fn()}
      onEdit={jest.fn()}
      onDelete={onDelete}
      deleting={deleting}
      deleteBlocked={deleteBlocked}
    />
  );

  const openMenu = () => fireEvent.press(screen.getByLabelText('More options'));
  const pickDelete = async () => {
    await openMenu();
    await fireEvent.press(screen.getByLabelText('Delete dream'));
  };

  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('has no Delete item without onDelete, only Edit', async () => {
    await render(ui(base));
    await openMenu();
    expect(screen.getByLabelText('Edit dream')).toBeTruthy();
    expect(screen.queryByLabelText('Delete dream')).toBeNull();
  });

  it('shows Delete in the menu with the Edit item, closed until opened', async () => {
    await render(ui(base, jest.fn().mockResolvedValue(undefined)));
    expect(screen.queryByLabelText('Delete dream')).toBeNull();
    await openMenu();
    expect(screen.getByRole('menuitem', { name: 'Delete dream' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Edit dream' })).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('asks first with the audio copy, and Keep deletes nothing', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    await render(ui(base, onDelete));
    await pickDelete();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete this dream?',
      "The recording and text will be permanently deleted. This can't be undone.",
      expect.any(Array),
      expect.anything(),
    );
    const keep = buttons().find((b) => b.text === 'Keep');
    expect(keep?.style).toBe('cancel');
    expect(buttons().find((b) => b.text === 'Delete')?.style).toBe('destructive');
    await press('Keep');
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(screen.queryByLabelText('Delete dream')).toBeNull();
  });

  it('uses the text-only copy without audio', async () => {
    await render(ui(noAudio, jest.fn().mockResolvedValue(undefined)));
    await pickDelete();
    expect(jest.mocked(Alert.alert).mock.calls[0][1]).toBe(
      "The text will be permanently deleted. This can't be undone.",
    );
  });

  it('dismissing the alert deletes nothing and allows another try', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    await render(ui(base, onDelete));
    await pickDelete();
    const options = jest.mocked(Alert.alert).mock.calls[0][3];
    await act(async () => options?.onDismiss?.());
    expect(onDelete).not.toHaveBeenCalled();
    await pickDelete();
    expect(Alert.alert).toHaveBeenCalledTimes(2);
  });

  it('ignores a second pick while the alert is open', async () => {
    await render(ui(base, jest.fn().mockResolvedValue(undefined)));
    await pickDelete();
    await pickDelete();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('releases the player, then calls onDelete exactly once', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    await render(ui(base, onDelete));
    await pickDelete();
    await press('Delete');
    await press('Delete');
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(screen.getByLabelText('More options').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('is disabled, menu closed, and ignores presses while deleting', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    await render(ui(base, onDelete, true));
    expect(screen.getByLabelText('More options').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    await openMenu();
    expect(screen.queryByLabelText('Delete dream')).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('closes an open menu when the parent starts deleting', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    const view = await render(ui(base, onDelete, false));
    await openMenu();
    expect(screen.getByLabelText('Delete dream')).toBeTruthy();
    await view.rerender(ui(base, onDelete, true));
    expect(screen.queryByLabelText('Delete dream')).toBeNull();
    await view.rerender(ui(base, onDelete, false));
    expect(screen.queryByLabelText('Delete dream')).toBeNull();
  });

  it('re-enables the menu and player when onDelete rejects', async () => {
    const onDelete = jest
      .fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue(undefined);
    await render(ui(base, onDelete));
    await pickDelete();
    await press('Delete');
    await act(async () => {});
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(screen.getByLabelText('More options').props.accessibilityState).toMatchObject({
      disabled: false,
    });
    await pickDelete();
    await press('Delete');
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  it('resets when the parent sets deleting back to false', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    const view = await render(ui(base, onDelete, false));
    await pickDelete();
    await press('Delete');
    await view.rerender(ui(base, onDelete, true));
    await view.rerender(ui(base, onDelete, false));
    expect(screen.getByLabelText('Play recording')).toBeTruthy();
    expect(screen.getByLabelText('More options').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  describe('deleteBlocked', () => {
    it('disables Delete and never shows the confirmation', async () => {
      const onDelete = jest.fn().mockResolvedValue(undefined);
      await render(ui(base, onDelete, false, true));
      await openMenu();
      expect(screen.getByLabelText('Delete dream').props.accessibilityState).toMatchObject({
        disabled: true,
      });
      await fireEvent.press(screen.getByLabelText('Delete dream'));
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Edit dream').props.accessibilityState).toMatchObject({
        disabled: false,
      });
      expect(screen.getByLabelText('Play recording')).toBeTruthy();
    });

    it('ignores a confirm on an Alert opened before the block', async () => {
      const onDelete = jest.fn().mockResolvedValue(undefined);
      const view = await render(ui(base, onDelete, false, false));
      await pickDelete();
      await view.rerender(ui(base, onDelete, false, true));
      await press('Delete');
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Play recording')).toBeTruthy();
      expect(screen.getByLabelText('More options').props.accessibilityState).toMatchObject({
        disabled: false,
      });
    });

    it('restores the screen when onDelete rejects, and allows another attempt', async () => {
      const onDelete = jest
        .fn()
        .mockRejectedValueOnce(new Error('delete in progress'))
        .mockResolvedValue(undefined);
      await render(ui(base, onDelete));
      await pickDelete();
      await press('Delete');
      await act(async () => {});
      expect(screen.getByLabelText('Play recording')).toBeTruthy();
      expect(screen.getByLabelText('More options').props.accessibilityState).toMatchObject({
        disabled: false,
      });
      await pickDelete();
      await press('Delete');
      expect(onDelete).toHaveBeenCalledTimes(2);
    });

    it('works again once unblocked', async () => {
      const onDelete = jest.fn().mockResolvedValue(undefined);
      const view = await render(ui(base, onDelete, false, true));
      await view.rerender(ui(base, onDelete, false, false));
      await pickDelete();
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      await press('Delete');
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });
});

describe('DreamDetailScreen for the Life journal', () => {
  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  const life: Dream = { ...base, title: 'A slow Sunday', journalId: 'life' };
  const ui = (dream: Dream) => (
    <DreamDetailScreen
      dream={dream}
      journal={BUILT_IN_JOURNALS[1]}
      onBack={jest.fn()}
      onEdit={jest.fn()}
      onDelete={jest.fn().mockResolvedValue(undefined)}
    />
  );

  it('labels the menu items Edit entry and Delete entry', async () => {
    await render(ui(life));
    await fireEvent.press(screen.getByLabelText('More options'));
    expect(screen.getByRole('menuitem', { name: 'Edit entry' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete entry' })).toBeTruthy();
    expect(screen.queryByLabelText('Delete dream')).toBeNull();
  });

  it('confirms deletion with the entry wording', async () => {
    await render(ui(life));
    await fireEvent.press(screen.getByLabelText('More options'));
    await fireEvent.press(screen.getByLabelText('Delete entry'));
    expect(alertSpy.mock.calls[0][0]).toBe('Delete this entry?');
  });

  it('shows the date in the header but no heading for an untitled finished Life entry, with body and chips', async () => {
    await render(ui({ ...life, title: '' }));
    expect(screen.queryByRole('header', { name: 'Oct 4' })).toBeNull();
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.queryByText('Untitled entry')).toBeNull();
    expect(screen.getByText('Life · Sunday, October 4')).toBeTruthy();
    expect(screen.getByText('First paragraph.')).toBeTruthy();
  });

  it('still shows date and heading for a titled Life entry', async () => {
    await render(ui(life));
    expect(screen.getByRole('header', { name: 'A slow Sunday' })).toBeTruthy();
    expect(screen.getByText('Life · Sunday, October 4')).toBeTruthy();
  });

  it('keeps the date heading for an untitled Dream', async () => {
    await render(
      <DreamDetailScreen
        dream={{ ...base, title: '' }}
        onBack={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByRole('header', { name: 'Oct 4' })).toBeTruthy();
  });
});

describe('DreamDetailScreen recordings', () => {
  it('shows a legacy single-recording entry with one player', async () => {
    await setup({ ...base, recordings: undefined });
    expect(screen.getAllByLabelText('Play recording')).toHaveLength(1);
    expect(mockPlayerCreated).toHaveBeenCalledWith('file:///dreams/a.m4a');
  });

  it('shows no player for an entry with an empty recordings list and no legacy audio', async () => {
    await setup({ ...base, audioFileName: undefined, durationMs: 0, recordings: [] });
    expect(screen.queryByLabelText(/^Play /)).toBeNull();
  });
});
