import { fireEvent, render, screen } from '@testing-library/react-native';
import { copyText } from '../services/clipboard';
import { EnterLogBar } from './EnterLogBar';
import { NoteBodyInput, clearEnterLog, getEnterLog, refreshEnterLogFlag } from './NoteBodyInput';

jest.mock('../services/clipboard', () => ({ copyText: jest.fn().mockResolvedValue(undefined) }));

const OLD = process.env.EXPO_PUBLIC_ENTER_LOG;
const setFlag = (on: boolean) => {
  if (on) process.env.EXPO_PUBLIC_ENTER_LOG = '1';
  else delete process.env.EXPO_PUBLIC_ENTER_LOG;
  refreshEnterLogFlag();
};

beforeEach(() => {
  jest.clearAllMocks();
  clearEnterLog();
});
afterEach(() => {
  if (OLD === undefined) delete process.env.EXPO_PUBLIC_ENTER_LOG;
  else process.env.EXPO_PUBLIC_ENTER_LOG = OLD;
  refreshEnterLogFlag();
});

describe('EnterLogBar', () => {
  it('renders nothing when the flag is off', async () => {
    setFlag(false);
    await render(<EnterLogBar />);
    expect(screen.queryByTestId('enter-log-bar')).toBeNull();
    expect(screen.queryByText('Copy log')).toBeNull();
  });

  it('shows the count and big non-focusable buttons when the flag is on', async () => {
    setFlag(true);
    await render(<EnterLogBar />);
    expect(screen.getByText('Enter log (0)')).toBeTruthy();
    expect(screen.getByTestId('enter-log-copy').props.focusable).toBe(false);
    expect(screen.getByTestId('enter-log-clear').props.focusable).toBe(false);
  });

  it('counts logged lines, copies the whole log, shows Copied, and Clear empties it', async () => {
    setFlag(true);
    await render(
      <>
        <NoteBodyInput text="- a" onChangeText={() => {}} testID="note-body" />
        <EnterLogBar />
      </>,
    );
    await fireEvent(screen.getByTestId('note-body'), 'keyPress', { nativeEvent: { key: 'Enter' } });
    const lines = getEnterLog();
    expect(lines.length).toBeGreaterThan(0);
    expect(screen.getByText(`Enter log (${lines.length})`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('enter-log-copy'));
    expect(copyText).toHaveBeenCalledWith(lines.join('\n'));
    expect(await screen.findByText('Copied')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('enter-log-clear'));
    expect(getEnterLog()).toEqual([]);
    expect(screen.getByText('Enter log (0)')).toBeTruthy();
  });
});
