import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Waveform } from '../../components/Waveform';
import { fadeTail } from '../../utils/fadeTail';
import { formatToday } from '../../utils/format';
import { ListeningView } from './ListeningView';

jest.mock('../../components/Waveform', () => ({ Waveform: jest.fn(() => null) }));
const mockWaveform = Waveform as unknown as jest.Mock;

const props = {
  durationMs: 42000,
  level: 0,
  saving: false,
  paused: false,
  onTogglePause: jest.fn(),
  onSave: jest.fn(),
};

const hidden = { includeHiddenElements: true };

beforeEach(() => jest.clearAllMocks());

describe('ListeningView', () => {
  it('shows a calm empty state before any text', async () => {
    await render(<ListeningView {...props} transcript="" />);
    expect(screen.getByText('Listening...')).toBeTruthy();
  });

  it('says Paused in the body, and never Listening, while paused with no transcript', async () => {
    await render(<ListeningView {...props} paused transcript="" />);
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByText('Paused · 0:42')).toBeTruthy();
    expect(screen.queryByText(/Listening/, hidden)).toBeNull();
    expect(screen.queryByLabelText(/Listening/, hidden)).toBeNull();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });

  it('still shows the empty state when not paused and the transcript is empty', async () => {
    await render(<ListeningView {...props} paused={false} transcript="" />);
    expect(screen.getByText('Listening...')).toBeTruthy();
  });

  it('shows the transcript while paused with text', async () => {
    await render(<ListeningView {...props} paused transcript="I was on a boat" />);
    expect(screen.getByLabelText('I was on a boat')).toBeTruthy();
    expect(screen.queryByText(/Listening/, hidden)).toBeNull();
    expect(screen.queryByLabelText(/Listening/, hidden)).toBeNull();
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

  it('keeps a static caret while paused', async () => {
    await render(<ListeningView {...props} paused transcript="I was on a boat" />);
    expect(screen.getByText('|', hidden)).toBeTruthy();
  });

  it('joins words with single spaces and no trailing space before the caret', async () => {
    await render(<ListeningView {...props} transcript={'  one   two\nthree '} />);
    expect(screen.getByText('one two three|', hidden)).toBeTruthy();
  });

  it('colours each word with a solid colour from fadeTail and never uses opacity', async () => {
    const text = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ');
    await render(<ListeningView {...props} transcript={text} />);
    const spans = screen.getAllByText(/^w\d+ ?$/, hidden);
    const expected = fadeTail(text);
    expect(spans).toHaveLength(25);
    const styles = spans.map((s) => StyleSheet.flatten(s.props.style));
    styles.forEach((st, i) => {
      expect(st.color).toBe(expected[i].color);
      expect(st.opacity).toBeUndefined();
    });
    expect(new Set(styles.map((st) => st.color)).size).toBeGreaterThanOrEqual(3);
  });

  it('renders only the tail of a long transcript', async () => {
    const text = Array.from({ length: 70 }, (_, i) => `w${i}`).join(' ');
    await render(<ListeningView {...props} transcript={text} />);
    expect(screen.queryByText('w0', hidden)).toBeNull();
    expect(screen.queryByText('w9', hidden)).toBeNull();
    expect(screen.getByText('w69', hidden)).toBeTruthy();
    expect(screen.getByText('w10', hidden)).toBeTruthy();
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

  it('enables the pause button when not saving', async () => {
    await render(<ListeningView {...props} />);
    expect(screen.getByLabelText('Pause').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('keeps the waveform active while listening and flat while paused', async () => {
    const lastProps = () => mockWaveform.mock.calls[mockWaveform.mock.calls.length - 1][0];
    const view = await render(<ListeningView {...props} level={0.7} />);
    expect(lastProps()).toEqual({ level: 0.7, active: true });
    await view.rerender(<ListeningView {...props} level={0.7} paused />);
    expect(lastProps()).toEqual({ level: 0, active: false });
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
