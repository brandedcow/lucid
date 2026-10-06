import { fireEvent, render, screen } from '@testing-library/react-native';
import { ListeningView } from './ListeningView';

const props = {
  durationMs: 5000,
  level: 0,
  saving: false,
  onSave: jest.fn(),
};

describe('ListeningView', () => {
  it('shows a calm empty state before any text', async () => {
    await render(<ListeningView {...props} transcript="" />);
    expect(screen.getByText('Listening...')).toBeTruthy();
  });

  it('shows the live transcript', async () => {
    await render(<ListeningView {...props} transcript="I was on a boat" />);
    expect(screen.getByText('I was on a boat')).toBeTruthy();
    expect(screen.queryByText('Listening...')).toBeNull();
  });

  it('shows the debug note only when there is one', async () => {
    await render(<ListeningView {...props} transcriptNote="model missing" />);
    expect(screen.getByText('model missing')).toBeTruthy();
  });

  it('has no pause button and still saves', async () => {
    await render(<ListeningView {...props} />);
    expect(screen.queryByLabelText('Pause')).toBeNull();
    await fireEvent.press(screen.getByText('Save dream'));
    expect(props.onSave).toHaveBeenCalled();
  });
});
