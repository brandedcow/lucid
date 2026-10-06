import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ComponentProps, useState } from 'react';
import { Alert, AlertButton } from 'react-native';
import { discardRecording, saveDream } from '../services/dreamStorage';
import { ReviewScreen } from './ReviewScreen';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, currentTime: 0, duration: 0 }),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('../services/dreamStorage', () => ({
  listTags: jest.fn().mockResolvedValue(['water']),
  saveDream: jest.fn().mockResolvedValue({}),
  discardRecording: jest.fn(),
}));

const recording = { uri: 'file:///cache/recording.m4a', durationMs: 42_000, persisted: false };

type Overrides = Partial<ComponentProps<typeof ReviewScreen>>;

/** Holds title/emotion/tags the way the session does, so the controlled fields work. */
function Harness(props: Overrides) {
  const [title, setTitle] = useState('');
  const [emotion, setEmotion] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  return (
    <ReviewScreen
      transcript="I was in a hallway"
      audio={recording}
      durationMs={recording.durationMs}
      title={title}
      onTitleChange={setTitle}
      emotion={emotion}
      onEmotionChange={setEmotion}
      tags={tags}
      onTagsChange={setTags}
      onEditTranscript={jest.fn()}
      onDone={jest.fn()}
      onBack={jest.fn()}
      onRerecord={jest.fn()}
      {...props}
    />
  );
}

async function renderReview(overrides: Overrides = {}) {
  const onDone = jest.fn();
  const onRerecord = jest.fn();
  await render(<Harness onDone={onDone} onRerecord={onRerecord} {...overrides} />);
  // Wait for the known-tag suggestions to load so later state updates are settled.
  await screen.findByText('water');
  return { onSaved: onDone, onRerecord };
}

beforeEach(() => jest.clearAllMocks());

describe('ReviewScreen', () => {
  it('focuses the title field on entry', async () => {
    await renderReview();
    expect(screen.getByLabelText('Title').props.autoFocus).toBe(true);
  });

  it('will not save without a title', async () => {
    const { onSaved } = await renderReview();

    await fireEvent.press(screen.getByText('Save dream'));
    expect(saveDream).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Title'), '   ');
    await fireEvent.press(screen.getByText('Save dream'));
    expect(saveDream).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('saves the title, emotion and a tag that was typed but not confirmed', async () => {
    const { onSaved } = await renderReview();

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Flooded hallway');
    await fireEvent.changeText(
      screen.getByPlaceholderText('How did it feel? (optional)'),
      'uneasy',
    );
    await fireEvent.changeText(screen.getByPlaceholderText('Add a tag'), 'Falling');
    await fireEvent.press(screen.getByText('Save dream'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveDream).toHaveBeenCalledWith({
      recordingUri: recording.uri,
      durationMs: recording.durationMs,
      details: {
        title: 'Flooded hallway',
        emotion: 'uneasy',
        tags: ['falling'],
        transcript: 'I was in a hallway',
      },
      status: 'saved',
    });
  });

  it('saves a written dream with no audio, duration 0 and no recording', async () => {
    const { onSaved } = await renderReview({ audio: undefined, durationMs: 0 });
    expect(screen.queryByLabelText('Play recording')).toBeNull();
    expect(screen.queryByText('Delete and record again')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Hallway');
    await fireEvent.press(screen.getByText('Save dream'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveDream).toHaveBeenCalledWith({
      durationMs: 0,
      details: { title: 'Hallway', emotion: '', tags: [], transcript: 'I was in a hallway' },
      status: 'saved',
    });
    expect((saveDream as jest.Mock).mock.calls[0][0]).not.toHaveProperty('recordingUri');
  });

  it('does not offer to delete, or re-send, a draft audio that is already stored', async () => {
    const stored = { ...recording, uri: 'file:///docs/dreams/1.m4a', persisted: true };
    await renderReview({ audio: stored });
    expect(screen.queryByText('Delete and record again')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Title'), 'Hallway');
    await fireEvent.press(screen.getByText('Save dream'));
    await waitFor(() => expect(saveDream).toHaveBeenCalled());
    expect((saveDream as jest.Mock).mock.calls[0][0]).not.toHaveProperty('recordingUri');
  });

  it('calls onBack and onEditTranscript from the top bar', async () => {
    const onBack = jest.fn();
    const onEditTranscript = jest.fn();
    await renderReview({ onBack, onEditTranscript });
    await fireEvent.press(screen.getByLabelText('Back'));
    await fireEvent.press(screen.getByText('Edit text'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onEditTranscript).toHaveBeenCalledTimes(1);
  });

  it('adds a suggested tag with one tap and lets it be removed', async () => {
    await renderReview();

    await fireEvent.press(screen.getByText('water'));
    expect(screen.getByLabelText('Remove tag water')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Remove tag water'));
    expect(screen.queryByLabelText('Remove tag water')).toBeNull();
  });

  it('deletes the recording and returns to capture after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { onRerecord } = await renderReview();

    await fireEvent.press(screen.getByText('Delete and record again'));
    expect(discardRecording).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0][2] as AlertButton[];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();

    expect(discardRecording).toHaveBeenCalledWith(recording.uri);
    expect(onRerecord).toHaveBeenCalled();
  });

  it('keeps the recording if the delete is cancelled', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { onRerecord } = await renderReview();

    await fireEvent.press(screen.getByText('Delete and record again'));

    const buttons = alert.mock.calls[0][2] as AlertButton[];
    expect(buttons.find((b) => b.style === 'cancel')?.onPress).toBeUndefined();
    expect(discardRecording).not.toHaveBeenCalled();
    expect(onRerecord).not.toHaveBeenCalled();
  });
});
