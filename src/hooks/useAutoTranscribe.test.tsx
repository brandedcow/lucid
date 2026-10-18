import { act, renderHook } from '@testing-library/react-native';
import { createFakeTranscription, FakeTranscription } from '../test/fakeTranscription';
import { SessionRecording } from '../types/recording';
import { useAutoTranscribe } from './useAutoTranscribe';

const rec = (id: string, extra: Partial<SessionRecording> = {}): SessionRecording => ({
  id,
  uri: `file:///cache/${id}.m4a`,
  persisted: false,
  removed: false,
  durationMs: 3000,
  ...extra,
});

type Props = { recordings: SessionRecording[]; recording?: boolean };

let fake: FakeTranscription;
// Pending start promises, resolved by `finish` (a real run resolves when it ends).
let ends: Map<string, () => void>;

// A real-looking start: marks the note running (busy) and ends only when the test says so.
const useRunningStart = () => {
  fake.start.mockImplementation(
    (id) =>
      new Promise<void>((resolve) => {
        fake.setState(id, { status: 'running' });
        ends.set(id, resolve);
      }),
  );
};

const setup = async (initial: Props) => {
  const hook = await renderHook(
    (p: Props) => useAutoTranscribe(p.recordings, fake, p.recording ?? false),
    { initialProps: initial },
  );
  let current = initial;
  return {
    /** Re-renders with changed props (the fake is read fresh on every render). */
    update: async (next: Partial<Props> = {}) => {
      current = { ...current, ...next };
      await hook.rerender(current);
      await act(async () => {});
    },
    unmount: async () => void (await hook.unmount()),
  };
};

const finish = async (id: string) => {
  await act(async () => {
    fake.setState(id, { status: 'ready' });
    ends.get(id)?.();
  });
};

beforeEach(() => {
  fake = createFakeTranscription();
  ends = new Map();
  useRunningStart();
});

describe('useAutoTranscribe', () => {
  it('starts a new recording once with auto: true', async () => {
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a')] });
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.start).toHaveBeenCalledWith('a', 'file:///cache/a.m4a', 3000, { auto: true });
    // More renders do not start it again.
    await h.update({ recordings: [rec('a')] });
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('never starts notes that were there at mount', async () => {
    const h = await setup({ recordings: [rec('old', { persisted: true })] });
    await h.update({ recordings: [rec('old', { persisted: true })] });
    expect(fake.start).not.toHaveBeenCalled();
  });

  it('runs two quick recordings one after another, none dropped', async () => {
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a')] });
    await h.update({ recordings: [rec('a'), rec('b')] });
    expect(fake.start).toHaveBeenCalledTimes(1);
    await finish('a');
    await h.update({ recordings: [rec('a', { voiceTranscript: 'x' }), rec('b')] });
    expect(fake.start).toHaveBeenCalledTimes(2);
    expect(fake.start).toHaveBeenLastCalledWith('b', 'file:///cache/b.m4a', 3000, { auto: true });
  });

  it('does not start the next job during the first one (busyId stays set)', async () => {
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a'), rec('b'), rec('c')] });
    await h.update();
    await h.update();
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('waits for a manual run and continues afterwards', async () => {
    const h = await setup({ recordings: [rec('m', { persisted: true })] });
    fake.setState('m', { status: 'running' });
    await h.update({ recordings: [rec('m', { persisted: true }), rec('a')] });
    expect(fake.start).not.toHaveBeenCalled();
    fake.setState('m', { status: 'ready' });
    await h.update();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.start.mock.calls[0][0]).toBe('a');
  });

  it('waits while a start has not set busyId yet (permission pre-check), then moves on', async () => {
    // The start neither sets busyId nor settles for now: the second job must not start.
    let settle = () => {};
    fake.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a'), rec('b')] });
    await h.update();
    expect(fake.start).toHaveBeenCalledTimes(1);
    // It skipped silently (no busyId ever): the job is dropped and the next one starts.
    await act(async () => settle());
    expect(fake.start).toHaveBeenCalledTimes(2);
    expect(fake.start.mock.calls[1][0]).toBe('b');
  });

  it('does not retry a job whose start skipped silently', async () => {
    fake.start.mockImplementation(async () => {});
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a')] });
    await h.update();
    await h.update();
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('skips a removed note', async () => {
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a'), rec('b')] });
    await h.update({ recordings: [rec('a'), rec('b', { removed: true })] });
    await finish('a');
    await h.update({
      recordings: [rec('a', { voiceTranscript: 'x' }), rec('b', { removed: true })],
    });
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('skips a note that already has a transcript, also an empty one', async () => {
    const h = await setup({ recordings: [] });
    await h.update({
      recordings: [rec('a', { voiceTranscript: '' }), rec('b', { voiceTranscript: 'hi' })],
    });
    expect(fake.start).not.toHaveBeenCalled();
  });

  it('skips when transcription is unsupported', async () => {
    fake.setSupported(false);
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a')] });
    expect(fake.start).not.toHaveBeenCalled();
  });

  it('never auto-starts on the online route', async () => {
    fake.setRoute('online');
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a')] });
    expect(fake.start).not.toHaveBeenCalled();
  });

  it('opening the recording panel cancels, requeues at the front, and restarts after it closes', async () => {
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a'), rec('b')] });
    expect(fake.start).toHaveBeenCalledTimes(1);
    await h.update({ recording: true });
    expect(fake.cancelAll).toHaveBeenCalledTimes(1);
    // The hook cancels the run: busy ends, its start settles.
    await finish('a');
    await h.update();
    expect(fake.start).toHaveBeenCalledTimes(1);
    await h.update({ recording: false });
    expect(fake.start).toHaveBeenCalledTimes(2);
    // 'a' (the cancelled job) is first again, before 'b'.
    expect(fake.start.mock.calls[1][0]).toBe('a');
    await finish('a');
    await h.update({ recordings: [rec('a', { voiceTranscript: 'x' }), rec('b')] });
    expect(fake.start.mock.calls[2][0]).toBe('b');
  });

  it('starts nothing while recording and a new note waits until it stops', async () => {
    const h = await setup({ recordings: [], recording: true });
    await h.update({ recordings: [rec('a')] });
    await h.update();
    expect(fake.start).not.toHaveBeenCalled();
    await h.update({ recording: false });
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('falls back to cancel(busyId) when there is no cancelAll', async () => {
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a')] });
    (fake as { cancelAll?: unknown }).cancelAll = undefined;
    await h.update({ recording: true });
    expect(fake.cancel).toHaveBeenCalledWith('a');
  });

  it('unmount clears the queue: nothing starts afterwards', async () => {
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a'), rec('b')] });
    await h.unmount();
    await finish('a');
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('drops a note recorded while unsupported and does not revive it; a later note still starts', async () => {
    fake.setRoute(null);
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a')] });
    expect(fake.start).not.toHaveBeenCalled();
    fake.setSupported(true);
    await h.update({ recordings: [rec('a')] });
    expect(fake.start).not.toHaveBeenCalled();
    await h.update({ recordings: [rec('a'), rec('b')] });
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(fake.start.mock.calls[0][0]).toBe('b');
  });

  it('holds the next job while a start is unsettled, across new recordings arrays', async () => {
    let settle = () => {};
    fake.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const h = await setup({ recordings: [] });
    await h.update({ recordings: [rec('a')] });
    expect(fake.start).toHaveBeenCalledTimes(1);
    await h.update({ recordings: [rec('a'), rec('b')] });
    await h.update({ recordings: [rec('a'), rec('b')] });
    expect(fake.start).toHaveBeenCalledTimes(1);
    await act(async () => settle());
    expect(fake.start).toHaveBeenCalledTimes(2);
    expect(fake.start.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });
});
