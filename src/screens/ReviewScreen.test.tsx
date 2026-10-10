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
  /** The reopened draft's stored emotion. */
  draftEmotion?: string;
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
function Harness({
  transcript = 'I was in a hallway',
  draftId,
  draftEmotion,
  noAudio,
  showFinishLater,
}: Extra) {
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
        ...(draftEmotion ? { emotion: draftEmotion } : {}),
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
      emotionDraft={session.emotionDraft}
      onEmotionDraftChange={dream.setEmotionDraft}
      tags={session.tags}
      onTagsChange={dream.setTags}
      tagDraft={session.tagDraft}
      onTagDraftChange={dream.setTagDraft}
      onEditTranscript={callbacks.onEdit}
      onDone={() => void leave('saved')}
      onFinishLater={() => void leave('draft')}
      showFinishLater={showFinishLater}
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
const emotionInput = () => screen.getByPlaceholderText('Add an emotion...');
const typeEmotion = (text: string) => fireEvent.changeText(emotionInput(), text);
const submitEmotion = async (text: string) => {
  await fireEvent.changeText(emotionInput(), text);
  await fireEvent(emotionInput(), 'submitEditing');
};
const tagInput = () => screen.getByPlaceholderText('Add a tag...');
const submitTag = async (text: string) => {
  await fireEvent.changeText(tagInput(), text);
  await fireEvent(tagInput(), 'submitEditing');
};
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
    expect(screen.getByPlaceholderText('Add an emotion...')).toBeTruthy();
    expect(screen.getByText('+ calm')).toBeTruthy();
    expect(screen.getByText('Edit ›')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Finish later')).toBeTruthy();
    expect(screen.queryByText('Delete and record again')).toBeNull();
  });

  it('hides Finish later when showFinishLater is false, and keeps Done working', async () => {
    await renderReview({ showFinishLater: false });
    expect(screen.queryByText('Finish later')).toBeNull();
    expect(screen.getByText('Done')).toBeTruthy();
    await typeTitle('Hallway');
    await press('Done');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalledWith('saved'));
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
    await fireEvent.press(screen.getByRole('button', { name: /^Edit text/ }));
    expect(callbacks.onEdit).toHaveBeenCalledTimes(1);
  });

  it('announces the text and word count on the card, not just "Edit text"', async () => {
    await renderReview({ transcript: '\n  I was in a hallway\nsecond line' });
    expect(screen.getByLabelText('Edit text. I was in a hallway, 7 words')).toBeTruthy();
  });

  it('announces "No text yet" for an empty card', async () => {
    await renderReview({ transcript: ' ', noAudio: true });
    expect(screen.getByLabelText('Edit text. No text yet, 0 words')).toBeTruthy();
  });

  it('calls onBack from the back arrow', async () => {
    await renderReview();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(callbacks.onBack).toHaveBeenCalledTimes(1);
  });
});

describe('ReviewScreen emotion and tags', () => {
  it('creates an emotion with Enter, shows it as a chip below the field and clears the field', async () => {
    await renderReview();
    await submitEmotion('  Wistful ');
    expect(screen.getByText('Wistful')).toBeTruthy();
    expect(emotionInput().props.value).toBe('');
    expect(emotionInput().props.submitBehavior).toBe('submit');
    const tree = JSON.stringify(screen.toJSON());
    const inputAt = tree.indexOf('Add an emotion...');
    const chipAt = tree.indexOf('Remove emotion wistful');
    expect(inputAt).toBeGreaterThan(-1);
    expect(chipAt).toBeGreaterThan(inputAt);
  });

  it('keeps a multi-word emotion as one chip', async () => {
    await renderReview();
    await submitEmotion('a bit wistful');
    expect(screen.getByText('A bit wistful')).toBeTruthy();
  });

  it('creates several emotions from comma or semicolon separated text', async () => {
    await renderReview();
    await typeEmotion('Wistful, a bit odd; tired');
    expect(screen.getByText('Wistful')).toBeTruthy();
    expect(screen.getByText('A bit odd')).toBeTruthy();
    expect(screen.getByText('Tired')).toBeTruthy();
    expect(emotionInput().props.value).toBe('');
  });

  it('finishes an emotion when a comma is typed', async () => {
    await renderReview();
    await typeEmotion('wistful,');
    expect(screen.getByText('Wistful')).toBeTruthy();
    expect(emotionInput().props.value).toBe('');
  });

  it('ignores empty text and duplicates', async () => {
    await renderReview();
    await submitEmotion('   ');
    expect(screen.queryByLabelText(/^Remove emotion/)).toBeNull();
    await submitEmotion('Odd');
    await submitEmotion('odd');
    await submitEmotion('ODD, odd');
    expect(screen.getAllByLabelText(/^Remove emotion/)).toHaveLength(1);
  });

  it('adds a suggested emotion with one tap, hides it from the suggestions and lets it be removed', async () => {
    await renderReview();
    expect(screen.queryByText('Afraid')).toBeNull();
    await press('+ calm');
    expect(screen.getByText('Calm')).toBeTruthy();
    expect(screen.queryByText('+ calm')).toBeNull();
    expect(screen.getByText('+ uneasy')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove emotion calm'));
    expect(screen.queryByLabelText('Remove emotion calm')).toBeNull();
    expect(screen.getByText('+ calm')).toBeTruthy();
  });

  it('narrows the suggestions to what is being typed', async () => {
    await renderReview();
    await typeEmotion('un');
    expect(screen.getByText('+ uneasy')).toBeTruthy();
    expect(screen.queryByText('+ calm')).toBeNull();
  });

  it('shows a stored free-text emotion as chips, one per comma or semicolon part', async () => {
    await renderReview({ draftId: '12', draftEmotion: 'a bit uneasy, calm' });
    expect(screen.getByText('A bit uneasy')).toBeTruthy();
    expect(screen.getByText('Calm')).toBeTruthy();
  });

  it('keeps the other stored emotions when one is removed or added', async () => {
    await renderReview({ draftId: '12', draftEmotion: 'a bit uneasy, calm' });
    await fireEvent.press(screen.getByLabelText('Remove emotion calm'));
    await submitEmotion('Joy');
    await typeTitle('Hallway');
    await press('Done');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalled());
    expect(save.mock.calls[0][0].details.emotion).toBe('a bit uneasy, joy');
  });

  it('saves the emotions lowercase and joined with a comma and a space', async () => {
    await renderReview();
    await submitEmotion('Calm');
    await submitEmotion('A bit Uneasy');
    await typeTitle('Hallway');
    await press('Done');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalled());
    expect(save.mock.calls[0][0].details.emotion).toBe('calm, a bit uneasy');
  });

  it('creates a tag with Enter, keeps the keyboard open and clears the field, with the input above the chips above the suggestions', async () => {
    await renderReview();
    await submitTag('  #Falling ');
    expect(screen.getByLabelText('Remove tag falling')).toBeTruthy();
    expect(tagInput().props.value).toBe('');
    expect(tagInput().props.submitBehavior).toBe('submit');
    expect(tagInput().props.returnKeyType).toBe('done');
    expect(tagInput().props.autoCapitalize).toBe('none');
    expect(tagInput().props.autoCorrect).toBe(false);
    const tree = JSON.stringify(screen.toJSON());
    const inputAt = tree.indexOf('Add a tag...');
    const chipAt = tree.indexOf('Remove tag falling');
    const suggestionAt = tree.indexOf('Add tag water');
    expect(inputAt).toBeGreaterThan(-1);
    expect(chipAt).toBeGreaterThan(inputAt);
    expect(suggestionAt).toBeGreaterThan(chipAt);
  });

  it('finishes a tag when a comma is typed and ignores empty text and duplicates', async () => {
    await renderReview();
    await fireEvent.changeText(tagInput(), 'flying home,');
    expect(screen.getByLabelText('Remove tag flying home')).toBeTruthy();
    expect(tagInput().props.value).toBe('');
    await submitTag('   ');
    await submitTag('Flying Home');
    expect(screen.getAllByLabelText(/^Remove tag/)).toHaveLength(1);
  });

  it('adds a suggested tag with one tap and lets it be removed', async () => {
    await renderReview();
    expect(screen.getByLabelText('Add tag water')).toBeTruthy();
    await press('+ water');
    expect(screen.queryByText('+ water')).toBeNull();
    expect(screen.getByLabelText('Remove tag water')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove tag water'));
    expect(screen.queryByLabelText('Remove tag water')).toBeNull();
    expect(screen.getByText('+ water')).toBeTruthy();
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
    await typeEmotion('Uneasy');
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
      journalId: 'dreams',
      requireTitle: true,
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
      journalId: 'dreams',
      requireTitle: true,
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

  it('Done saves a pending emotion together with the chips already added', async () => {
    await renderReview();
    await submitEmotion('calm');
    await typeEmotion('Wistful');
    await typeTitle('Hallway');
    await press('Done');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalledWith('saved'));
    expect(save.mock.calls[0][0].details.emotion).toBe('calm, wistful');
  });

  it('Finish later saves a pending emotion in the draft', async () => {
    await renderReview();
    await typeEmotion('Wistful');
    await press('Finish later');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalledWith('draft'));
    expect(save.mock.calls[0][0].details.emotion).toBe('wistful');
  });

  it('Finish later keeps a pending emotion even in an otherwise empty written dream', async () => {
    await renderReview({ transcript: '', noAudio: true });
    await typeEmotion('Wistful');
    await press('Finish later');
    await waitFor(() => expect(callbacks.onLeft).toHaveBeenCalledWith('draft'));
    expect(save.mock.calls[0][0].details.emotion).toBe('wistful');
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
      journalId: 'dreams',
      requireTitle: true,
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

  it('locks the card and every field while a save is in flight', async () => {
    await renderReview();
    await typeTitle('Hallway');
    let resolve: (v: unknown) => void = () => {};
    save.mockReturnValue(new Promise((r) => (resolve = r)));
    await press('Done');
    expect(screen.getByLabelText('Title').props.editable).toBe(false);
    expect(screen.getByLabelText('How did it feel?').props.editable).toBe(false);
    expect(tagInput().props.editable).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: /^Edit text/ }));
    expect(callbacks.onEdit).not.toHaveBeenCalled();
    // Chips and tag controls ignore touches too.
    await press('+ calm');
    expect(screen.queryByLabelText('Remove emotion calm')).toBeNull();
    await press('+ water');
    expect(screen.queryByLabelText('Remove tag water')).toBeNull();
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

describe('ReviewScreen pending emotion text', () => {
  it('lives in the session, so text and chips are still there after the screen is shown again', async () => {
    const view = await render(<Harness />);
    await screen.findByText('+ water');
    await submitEmotion('Calm');
    await typeEmotion('wist');
    // Review -> Edit -> Review remounts the screen but keeps the session above it.
    await view.rerender(<Harness />);
    expect(emotionInput().props.value).toBe('wist');
    expect(screen.getByLabelText('Remove emotion calm')).toBeTruthy();
  });
});
