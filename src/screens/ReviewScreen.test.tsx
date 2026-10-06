import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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

const recording = { uri: 'file:///cache/recording.m4a', durationMs: 42_000 };

async function renderReview() {
  const onSaved = jest.fn();
  const onRerecord = jest.fn();
  await render(<ReviewScreen recording={recording} onSaved={onSaved} onRerecord={onRerecord} />);
  // Wait for the known-tag suggestions to load so later state updates are settled.
  await screen.findByText('water');
  return { onSaved, onRerecord };
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
    expect(saveDream).toHaveBeenCalledWith(recording.uri, recording.durationMs, {
      title: 'Flooded hallway',
      emotion: 'uneasy',
      tags: ['falling'],
    });
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
