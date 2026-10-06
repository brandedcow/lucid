import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ComponentProps, useEffect } from 'react';
import { Alert } from 'react-native';
import { useDreamSession } from '../hooks/useDreamSession';
import { INDEX_UNREADABLE, saveDream } from '../services/dreamStorage';
import { ReviewScreen } from './ReviewScreen';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('../services/dreamStorage', () => ({
  INDEX_UNREADABLE: 'INDEX_UNREADABLE',
  listTags: jest.fn().mockResolvedValue(['water']),
  listEmotions: jest.fn().mockResolvedValue(['calm', 'uneasy']),
  saveDream: jest.fn(),
  dreamAudioUri: jest.fn((d: { audioFileName?: string }) =>
    d.audioFileName ? `file:///docs/dreams/${d.audioFileName}` : null,
  ),
  isIndexUnreadableError: (e: { code?: string } | null) => e?.code === 'INDEX_UNREADABLE',
}));

const save = saveDream as jest.Mock;
const recording = { uri: 'file:///cache/recording.m4a', durationMs: 42_000 };

type Extra = Partial<ComponentProps<typeof ReviewScreen>> & {
  transcript?: string;
  /** Start as a reopened draft with this id. */
  draftId?: string;
  noAudio?: boolean;
};

const callbacks = {
  onLeft: jest.fn(),
  onBack: jest.fn(),
  onEdit: jest.fn(),
};

/**
 * Wires the screen to the real session hook the way App does: Done and Finish later save, and
 * leave only if the save worked.
 */
function Harness({ transcript = 'I was in a hallway', draftId, noAudio }: Extra) {
  const dream = useDreamSession();
  const { session } = dream;
  useEffect(() => {
    if (draftId) {
      dream.openDraft({
        id: draftId,
        createdAt: '2026-10-05T08:00:00.000Z',
        durationMs: noAudio ? 0 : 42_000,
        ...(noAudio ? {} : { audioFileName: `${draftId}.m4a` }),
        title: '',
        tags: [],
        transcript,
        status: 'draft',
      });
    } else if (noAudio) {
      dream.startWriting();
      dream.setTranscript(transcript);
    } else {
      dream.startFromRecording(recording, transcript);
    }
    // Starts the session once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!session) return null;
  const leave = async (status: 'saved' | 'draft') => {
    if (await dream.save(status)) callbacks.onLeft(status);
  };
  return (
    <ReviewScreen
      transcript={session.transcript}
      audio={session.audio}
      durationMs={session.audio?.durationMs ?? 0}
      title={session.title}
      onTitleChange={dream.setTitle}
      emotion={session.emotion}
      onEmotionChange={dream.setEmotion}
      tags={session.tags}
      onTagsChange={dream.setTags}
      tagDraft={session.tagDraft}
      onTagDraftChange={dream.setTagDraft}
      onEditTranscript={callbacks.onEdit}
      onDone={() => void leave('saved')}
      onFinishLater={() => void leave('draft')}
      saving={dream.saving}
      onBack={callbacks.onBack}
      date="Sunday, October 4"
    />
  );
}

async function renderReview(props: Extra = {}) {
  await render(<Harness {...props} />);
  // Wait for the known words to load so later state updates are settled.
  await screen.findByText('+ water');
}

const press = (label: string) => fireEvent.press(screen.getByText(label));
const typeTitle = (text: string) => fireEvent.changeText(screen.getByLabelText('Title'), text);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  save.mockResolvedValue({ id: '77', createdAt: 'c', audioFileName: '77.m4a' });
});
afterEach(() => jest.restoreAllMocks());

describe('ReviewScreen layout', () => {
  it('shows the header date, labels, card, emotion chips, tag chips and both buttons', async () => {
    await renderReview();
    expect(screen.getByText('Dream · Sunday, October 4')).toBeTruthy();
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByPlaceholderText('Name this dream')).toBeTruthy();
    expect(screen.getByText('How did it feel?')).toBeTruthy();
    expect(screen.getAllByText('Optional')).toHaveLength(2);
    expect(screen.getByText('Tags')).toBeTruthy();
    expect(screen.getByPlaceholderText('Add a tag...')).toBeTruthy();
    expect(screen.getByText('+ water')).toBeTruthy();
    expect(screen.getByText('Calm')).toBeTruthy();
    expect(screen.getByText('Edit ›')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Finish later')).toBeTruthy();
    expect(screen.queryByText('Delete and record again')).toBeNull();
  });

  it('focuses the title only while it is empty', async () => {
    await renderReview();
    expect(screen.getByLabelText('Title').props.autoFocus).toBe(true);
    await typeTitle('Hallway');
    expect(screen.getByLabelText('Title').props.autoFocus).toBe(false);
  });

  it('previews the first 3 lines with duration and word count, and a mic icon for audio', async () => {
    await renderReview({ transcript: 'one two three' });
    expect(screen.getByText('one two three').props.numberOfLines).toBe(3);
    expect(screen.getByText('0:42 · 3 words')).toBeTruthy();
    // MicIcon is drawn with Views, so its presence is checked through the meta row sibling count.
    const metaLeft = screen.getByText('0:42 · 3 words').parent!;
    expect(metaLeft.children.length).toBe(2);
  });

  it('uses the singular for one word and shows no mic icon or duration without audio', async () => {
    await renderReview({ transcript: 'hello', noAudio: true });
    const meta = screen.getByText('1 word');
    expect(meta.parent!.children.length).toBe(1);
  });

  it('shows "No text yet" for an empty transcript', async () => {
    await renderReview({ transcript: '  ', noAudio: true });
    expect(screen.getByText('No text yet')).toBeTruthy();
    expect(screen.getByText('0 words')).toBeTruthy();
  });

  it('opens Edit when the whole card is tapped', async () => {
    await renderReview();
    await fireEvent.press(screen.getByLabelText('Edit text'));
    expect(callbacks.onEdit).toHaveBeenCalledTimes(1);
  });

  it('calls onBack from the back arrow', async () => {
    await renderReview();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewScreen emotion and tags', () => {
  it('appends a tapped chip in lowercase, and removes it on a second tap', async () => {
    await renderReview();
    await press('Calm');
    expect(screen.getByLabelText('How did it feel?').props.value).toBe('calm');
    await press('Uneasy');
    expect(screen.getByLabelText('How did it feel?').props.value).toBe('calm, uneasy');
    await press('Calm');
    expect(screen.getByLabelText('How did it feel?').props.value).toBe('uneasy');
  });

  it('accepts free text and offers no preset feelings', async () => {
    await renderReview();
    expect(screen.queryByText('Afraid')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('How did it feel?'), 'a bit wistful');
    expect(screen.getByLabelText('How did it feel?').props.value).toBe('a bit wistful');
  });

  it('adds a suggested tag with one tap and lets it be removed', async () => {
    await renderReview();
    await press('+ water');
    expect(screen.getByLabelText('Remove tag water')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove tag water'));
    expect(screen.queryByLabelText('Remove tag water')).toBeNull();
  });
});

describe('ReviewScreen saving', () => {
  it('disables Done until there is a title', async () => {
    await renderReview();
    await press('Done');
    expect(save).not.toHaveBeenCalled();
    await typeTitle('   ');
    await press('Done');
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Done').parent?.props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await typeTitle('Hallway');
    expect(screen.getByText('Done').parent?.props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('Done saves everything, including a pending tag, as a finished dream', async () => {
    await renderReview();
    await typeTitle('Flooded hallway');
    await fireEvent.changeText(screen.getByLabelText('How did it feel?'), 'uneasy');
    await fireEvent.changeText(screen.getByPlaceholderText('Add a tag...'), 'Falling');
    await press('Done');

    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalledWith('saved'));
    expect(save).toHaveBeenCalledWith({
      recordingUri: recording.uri,
      durationMs: 42_000,
      details: {
        title: 'Flooded hallway',
        emotion: 'uneasy',
        tags: ['falling'],
        transcript: 'I was in a hallway',
      },
      status: 'saved',
    });
  });

  it('saves a written dream with duration 0 and no recordingUri or id', async () => {
    await renderReview({ noAudio: true });
    await typeTitle('Hallway');
    await press('Done');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({
      durationMs: 0,
      details: { title: 'Hallway', emotion: '', tags: [], transcript: 'I was in a hallway' },
      status: 'saved',
    });
    expect(save.mock.calls[0][0]).not.toHaveProperty('recordingUri');
    expect(save.mock.calls[0][0]).not.toHaveProperty('id');
  });

  it('a reopened draft saves with its id and never re-sends the stored audio', async () => {
    await renderReview({ draftId: '12' });
    await typeTitle('Hallway');
    await press('Done');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalled());
    const arg = save.mock.calls[0][0];
    expect(arg.id).toBe('12');
    expect(arg).not.toHaveProperty('recordingUri');
    expect(arg.status).toBe('saved');
  });

  it('Finish later saves a draft without a title', async () => {
    await renderReview();
    await press('Finish later');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalledWith('draft'));
    expect(save).toHaveBeenCalledWith({
      recordingUri: recording.uri,
      durationMs: 42_000,
      details: { title: '', emotion: '', tags: [], transcript: 'I was in a hallway' },
      status: 'draft',
    });
  });

  it('Finish later saves nothing when there is nothing to keep, and still leaves', async () => {
    await renderReview({ transcript: '', noAudio: true });
    await press('Finish later');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalledWith('draft'));
    expect(save).not.toHaveBeenCalled();
  });

  it('calls saveDream once when Done is tapped twice', async () => {
    await renderReview();
    await typeTitle('Hallway');
    let resolve: (v: unknown) => void = () => {};
    save.mockReturnValue(new Promise((r) => (resolve = r)));
    await press('Done');
    await press('Saving…');
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ id: '77', createdAt: 'c' }));
    expect(callbacks.onLeft).toHaveBeenCalledTimes(1);
  });

  it('blocks Back, Done and Finish later while saving', async () => {
    await renderReview();
    await typeTitle('Hallway');
    let resolve: (v: unknown) => void = () => {};
    save.mockReturnValue(new Promise((r) => (resolve = r)));
    await press('Done');
    expect(screen.getByText('Saving…')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    await press('Finish later');
    expect(callbacks.onBack).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ id: '77', createdAt: 'c' }));
  });

  it('keeps the screen and everything typed when saving fails, with the generic message', async () => {
    await renderReview();
    await typeTitle('Hallway');
    save.mockRejectedValue(new Error('disk full'));
    await press('Done');
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not save your dream', 'Please try again.'),
    );
    expect(callbacks.onLeft).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title').props.value).toBe('Hallway');
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('shows a specific message when the saved dreams cannot be read', async () => {
    await renderReview();
    await typeTitle('Hallway');
    save.mockRejectedValue(Object.assign(new Error('x'), { code: INDEX_UNREADABLE }));
    await press('Done');
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not save your dream',
        'Your saved dreams could not be read, so this dream was not saved. Your recording is still here.',
      ),
    );
    expect(callbacks.onLeft).not.toHaveBeenCalled();
  });
});

describe('ReviewScreen pending tag text', () => {
  it('lives in the session, so it is still there after the screen is shown again', async () => {
    const view = await render(<Harness />);
    await screen.findByText('+ water');
    await fireEvent.changeText(screen.getByPlaceholderText('Add a tag...'), 'fall');
    // Review -> Edit -> Review remounts the screen but keeps the session above it.
    await view.rerender(<Harness />);
    expect(screen.getByPlaceholderText('Add a tag...').props.value).toBe('fall');
  });
});
