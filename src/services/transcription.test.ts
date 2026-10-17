import {
  RecordingTranscriptionState,
  transcriptView,
  UNSUPPORTED_TRANSCRIPTION,
} from './transcription';

const none: RecordingTranscriptionState = { status: 'none' };
const running: RecordingTranscriptionState = { status: 'running' };
const failed = (
  code: 'unsupported' | 'busy' | 'permission' | 'no-model' | 'cancelled' | 'failed',
) => ({ status: 'failed', error: { code, message: 'm' } }) as RecordingTranscriptionState;

describe('UNSUPPORTED_TRANSCRIPTION', () => {
  it('cannot transcribe, is idle, and does nothing when called', async () => {
    expect(UNSUPPORTED_TRANSCRIPTION.supported).toBe(false);
    expect(UNSUPPORTED_TRANSCRIPTION.busyId).toBeNull();
    expect(UNSUPPORTED_TRANSCRIPTION.stateOf('any')).toEqual({ status: 'none' });
    await expect(
      UNSUPPORTED_TRANSCRIPTION.start('a', 'file:///a.m4a', 1000),
    ).resolves.toBeUndefined();
    expect(() => UNSUPPORTED_TRANSCRIPTION.cancel('a')).not.toThrow();
  });
});

describe('transcriptView', () => {
  it('shows the text whenever there is some, whatever the run state', () => {
    for (const state of [none, running, failed('failed'), { status: 'ready' } as const]) {
      expect(transcriptView('hello', state, true, false)).toEqual({ kind: 'text' });
      expect(transcriptView('hello', state, false, true)).toEqual({ kind: 'text' });
    }
  });

  it('offers to transcribe when supported with no text (state none, ready or cancelled)', () => {
    expect(transcriptView(undefined, none, true, false)).toEqual({
      kind: 'offer',
      busyElsewhere: false,
    });
    expect(transcriptView(undefined, { status: 'ready' }, true, false).kind).toBe('offer');
    expect(transcriptView(undefined, failed('cancelled'), true, false).kind).toBe('offer');
  });

  it('marks the offer when another note is being transcribed', () => {
    expect(transcriptView(undefined, none, true, true)).toEqual({
      kind: 'offer',
      busyElsewhere: true,
    });
  });

  it('has nothing to show without text when unsupported', () => {
    expect(transcriptView(undefined, none, false, false)).toEqual({ kind: 'none' });
    expect(transcriptView(undefined, failed('cancelled'), false, false)).toEqual({ kind: 'none' });
  });

  it('shows running for this note', () => {
    expect(transcriptView(undefined, running, true, false)).toEqual({ kind: 'running' });
    expect(transcriptView('', running, true, false)).toEqual({ kind: 'running' });
  });

  it('shows the failure with its error, except a cancel', () => {
    const state = failed('permission');
    expect(transcriptView(undefined, state, true, false)).toEqual({
      kind: 'failed',
      error: state.error,
    });
    expect(transcriptView('', state, true, false).kind).toBe('failed');
    expect(transcriptView('', failed('cancelled'), true, false).kind).toBe('empty');
  });

  it('shows empty for a transcript with nothing heard (blank text counts), retry only if supported', () => {
    expect(transcriptView('', none, true, false)).toEqual({ kind: 'empty', canRetry: true });
    expect(transcriptView('  \n ', none, true, false)).toEqual({ kind: 'empty', canRetry: true });
    expect(transcriptView('', none, false, false)).toEqual({ kind: 'empty', canRetry: false });
  });
});
