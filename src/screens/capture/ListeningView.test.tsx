import { render, screen } from '@testing-library/react-native';
import { ListeningView } from './ListeningView';

const props = {
  durationMs: 5000,
  level: 0,
  paused: false,
  saving: false,
  onTogglePause: jest.fn(),
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
});
