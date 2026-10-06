import { fireEvent, render, screen } from '@testing-library/react-native';
import { formatToday } from '../../utils/format';
import { ListeningView } from './ListeningView';

const props = {
  durationMs: 42000,
  level: 0,
  saving: false,
  onSave: jest.fn(),
};

const hidden = { includeHiddenElements: true };

beforeEach(() => jest.clearAllMocks());

describe('ListeningView', () => {
  it('shows a calm empty state before any text', async () => {
    await render(<ListeningView {...props} transcript="" />);
    expect(screen.getByText('Listening...')).toBeTruthy();
  });

  it('shows status with the time, and the date', async () => {
    await render(<ListeningView {...props} />);
    expect(screen.getByText('Listening · 0:42')).toBeTruthy();
    expect(screen.getByText(formatToday())).toBeTruthy();
  });

  it('shows Paused with the time when paused', async () => {
    await render(<ListeningView {...props} paused />);
    expect(screen.getByText('Paused · 0:42')).toBeTruthy();
    expect(screen.queryByText('Listening · 0:42')).toBeNull();
  });

  it('shows the caption', async () => {
    await render(<ListeningView {...props} />);
    expect(screen.getByText('Audio and transcript are both kept')).toBeTruthy();
  });

  it('renders the transcript words, with a caret while listening', async () => {
    await render(<ListeningView {...props} transcript="I was on a boat" />);
    expect(screen.queryByText('Listening...')).toBeNull();
    expect(screen.getByText('boat', hidden)).toBeTruthy();
    expect(screen.getByText('|', hidden)).toBeTruthy();
  });

  it('has no caret while paused', async () => {
    await render(<ListeningView {...props} paused transcript="I was on a boat" />);
    expect(screen.queryByText('|', hidden)).toBeNull();
  });

  it('renders only the tail of a long transcript', async () => {
    const text = Array.from({ length: 70 }, (_, i) => `w${i}`).join(' ');
    await render(<ListeningView {...props} transcript={text} />);
    expect(screen.queryByText('w0', hidden)).toBeNull();
    expect(screen.queryByText('w19', hidden)).toBeNull();
    expect(screen.getByText('w69', hidden)).toBeTruthy();
    expect(screen.getByText('w20', hidden)).toBeTruthy();
  });

  it('hides the visual tail from screen readers while listening', async () => {
    await render(<ListeningView {...props} transcript="I was on a boat" />);
    expect(screen.queryByText('boat')).toBeNull();
    expect(screen.getByText('boat', hidden)).toBeTruthy();
  });

  it('exposes the full transcript as one element while paused', async () => {
    const text = Array.from({ length: 70 }, (_, i) => `w${i}`).join(' ');
    await render(<ListeningView {...props} paused transcript={text} />);
    expect(screen.getByLabelText(text)).toBeTruthy();
  });

  it('has a Pause button that calls onTogglePause', async () => {
    const onTogglePause = jest.fn();
    await render(<ListeningView {...props} onTogglePause={onTogglePause} />);
    await fireEvent.press(screen.getByLabelText('Pause'));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Resume')).toBeNull();
  });

  it('labels the button Resume while paused', async () => {
    const onTogglePause = jest.fn();
    await render(<ListeningView {...props} paused onTogglePause={onTogglePause} />);
    await fireEvent.press(screen.getByLabelText('Resume'));
    expect(onTogglePause).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Pause')).toBeNull();
  });

  it('disables pause and save while saving', async () => {
    const onTogglePause = jest.fn();
    await render(<ListeningView {...props} saving onTogglePause={onTogglePause} />);
    await fireEvent.press(screen.getByLabelText('Pause'));
    await fireEvent.press(screen.getByText('Saving…'));
    expect(onTogglePause).not.toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('saves when Save dream is pressed', async () => {
    await render(<ListeningView {...props} />);
    await fireEvent.press(screen.getByText('Save dream'));
    expect(props.onSave).toHaveBeenCalled();
  });

  it('shows the debug note only when there is one', async () => {
    await render(<ListeningView {...props} transcriptNote="model missing" />);
    expect(screen.getByText('model missing')).toBeTruthy();
  });

  it('shows no debug line when there is no note', async () => {
    await render(<ListeningView {...props} transcriptNote={null} />);
    expect(screen.queryByText('model missing')).toBeNull();
    expect(screen.queryByText(/missing|error/i)).toBeNull();
  });
});
