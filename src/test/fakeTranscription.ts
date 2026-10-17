import { RecordingTranscription, RecordingTranscriptionState } from '../services/transcription';

/**
 * A controllable RecordingTranscription for tests (the real hook comes later). It is a plain
 * mutable object: after `setSupported` / `setState` / `emit`, re-render the component under test.
 * `start` and `cancel` are spies and change nothing by themselves.
 */
export type FakeTranscription = RecordingTranscription & {
  start: jest.Mock<Promise<void>, [string, string, number?]>;
  cancel: jest.Mock<void, [string]>;
  setSupported(supported: boolean): void;
  /** Sets the route the sheet shows (null = cannot transcribe). Does not change `supported`. */
  setRoute(route: 'on-device' | 'online' | null): void;
  /** Sets one recording's run state; a running state also marks it busy, any other frees it. */
  setState(id: string, state: RecordingTranscriptionState): void;
  /** The recognizer delivered a result: calls the harness's onResult and marks the run ready. */
  emit(id: string, text: string): void;
};

export function createFakeTranscription(
  onResult: (id: string, text: string) => void = () => {},
  supported = true,
): FakeTranscription {
  const states = new Map<string, RecordingTranscriptionState>();
  const fake: FakeTranscription = {
    supported,
    route: supported ? 'on-device' : null,
    busyId: null,
    stateOf: (id) => states.get(id) ?? { status: 'none' },
    start: jest.fn<Promise<void>, [string, string]>(async () => {}),
    cancel: jest.fn<void, [string]>(),
    setSupported(value) {
      fake.supported = value;
      if (!value) fake.route = null;
      else if (fake.route === null) fake.route = 'on-device';
    },
    setRoute(route) {
      fake.route = route;
    },
    setState(id, state) {
      states.set(id, state);
      if (state.status === 'running') fake.busyId = id;
      else if (fake.busyId === id) fake.busyId = null;
    },
    emit(id, text) {
      fake.setState(id, { status: 'ready' });
      onResult(id, text);
    },
  };
  return fake;
}
