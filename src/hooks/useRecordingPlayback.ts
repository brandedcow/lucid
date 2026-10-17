import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

/**
 * One recording plays at a time, app-wide: the pause function of whichever player last started.
 * Each card keeps its own player (no shared `player.replace`, which is unverified on device).
 */
let activePause: (() => void) | null = null;
let backgroundWatch: { remove: () => void } | null = null;

/** Playback stops when the app leaves the foreground (watched while something is registered). */
function register(pause: () => void) {
  activePause = pause;
  backgroundWatch ??= AppState.addEventListener('change', (state) => {
    if (state !== 'active') stopAllPlayback();
  });
}

/** Pauses whichever recording is playing (a recording is starting, or a card is going away). */
export function stopAllPlayback() {
  const pause = activePause;
  activePause = null;
  backgroundWatch?.remove();
  backgroundWatch = null;
  try {
    pause?.();
  } catch {
    // The player may already be released with its owner.
  }
}

/**
 * Playback of one recording: play/pause toggle, position and length. One player per mount. The
 * player stops when the owner unmounts (the card is removed or the page is left).
 * `durationMs` is the known length, used until the player reports its own.
 * `options.updateInterval` (ms) asks the player for finer position updates; only the expanded
 * voice note view uses it. Left out, the player's default applies.
 */
export function useRecordingPlayback(
  uri: string,
  durationMs: number,
  disabled = false,
  options: { updateInterval?: number } = {},
) {
  const { updateInterval } = options;
  const player = useAudioPlayer(
    uri,
    updateInterval !== undefined && updateInterval > 0 ? { updateInterval } : undefined,
  );
  const status = useAudioPlayerStatus(player);

  const pauseMine = useRef(() => {});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    pauseMine.current = () => player.pause();
    return () => {
      mounted.current = false;
      if (activePause === pauseMine.current) activePause = null;
      try {
        player.pause();
      } catch {
        // The player may already be released with its owner.
      }
    };
  }, [player]);

  /** Length in seconds. */
  const total = status.duration > 0 ? status.duration : durationMs / 1000;
  /** Position in seconds. */
  const position = status.currentTime;
  const progress = total > 0 ? Math.min(1, position / total) : 0;

  // A recording that finished by itself no longer counts as the active one.
  const finished =
    !status.playing && status.duration > 0 && status.currentTime >= status.duration - 0.05;
  useEffect(() => {
    if (finished && activePause === pauseMine.current) {
      activePause = null;
      backgroundWatch?.remove();
      backgroundWatch = null;
    }
  }, [finished]);

  /** Begins playback (pausing any other card). `restartAtEnd`: from the end, start over. */
  const startPlayback = async (restartAtEnd: boolean) => {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (!mounted.current) return;
    if (restartAtEnd && status.duration > 0 && status.currentTime >= status.duration - 0.25) {
      await player.seekTo(0);
      if (!mounted.current) return;
    }
    // Starting here pauses any other card that is playing.
    if (activePause && activePause !== pauseMine.current) stopAllPlayback();
    register(pauseMine.current);
    applyRate();
    player.play();
  };

  // Playback speed. The chosen rate is applied again whenever playback starts: iOS may reset it.
  const rateRef = useRef<number | null>(null);
  const [rate, setRateState] = useState(1);
  const applyRate = () => {
    if (rateRef.current === null) return;
    try {
      player.setPlaybackRate(rateRef.current, 'high');
    } catch {
      // The player may already be released with its owner.
    }
  };
  /** Sets the playback speed (1 = normal) with pitch correction. Ignores non-positive or non-finite values. */
  const setRate = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    rateRef.current = value;
    setRateState(value);
    applyRate();
  };

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // No playback while a recording is in progress.
    if (disabled) return;
    await startPlayback(true);
  };

  // Seeking. Before the player knows its length the wanted spot waits in `pendingFraction`.
  const [pendingFraction, setPendingFraction] = useState<number | null>(null);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  const wanted = useRef<number | null>(null);
  const wasPlaying = useRef(false);
  const dragging = useRef(false);

  const seekFraction = (fraction: number, length: number) => {
    const target = Math.max(0, Math.min(fraction * length, length - 0.05));
    Promise.resolve(player.seekTo(Math.max(0, target))).catch(() => {});
  };

  /** Seeks to a fraction (0..1) of the recording. Never starts or registers playback. */
  const seekTo = (fraction: number) => {
    if (disabled || !(total > 0)) return;
    const f = Math.max(0, Math.min(1, fraction));
    if (status.duration > 0) {
      wanted.current = null;
      seekFraction(f, status.duration);
    } else {
      wanted.current = f;
      setPendingFraction(f);
    }
  };

  const duration = status.duration;
  useEffect(() => {
    if (wanted.current !== null && duration > 0) {
      seekFraction(wanted.current, duration);
      wanted.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  const scrubbing = scrubFraction !== null;
  /** Progress to draw: the finger while scrubbing, a seek waiting for the length, else playback. */
  const displayProgress =
    scrubFraction ?? (status.duration > 0 ? null : pendingFraction) ?? progress;
  const displayPosition = displayProgress * total;

  /** Moves the position by a number of seconds (accessibility steps). */
  const seekBy = (seconds: number) => {
    if (!(total > 0)) return;
    const now = displayProgress * total;
    seekTo((now + seconds) / total);
  };

  /** Skips forward (or back, when negative) by seconds, clamped to the recording. */
  const skip = (seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    seekBy(seconds);
  };

  const scrub = {
    /** Finger down on the bar: pauses a playing note and previews locally. */
    begin: (fraction: number) => {
      if (disabled) return;
      dragging.current = true;
      wasPlaying.current = status.playing;
      if (status.playing) player.pause();
      setScrubFraction(Math.max(0, Math.min(1, fraction)));
    },
    update: (fraction: number) => {
      setScrubFraction((cur) => (cur === null ? cur : Math.max(0, Math.min(1, fraction))));
    },
    /** Finger up: one seek, then resume if it was playing. */
    end: (fraction: number) => {
      if (!dragging.current) return;
      dragging.current = false;
      const resume = wasPlaying.current;
      wasPlaying.current = false;
      setScrubFraction(null);
      seekTo(fraction);
      if (resume && !disabled && mounted.current) void startPlayback(false);
    },
    /** The gesture was taken away: no seek, resume if it was playing. */
    cancel: () => {
      if (!dragging.current) return;
      dragging.current = false;
      const resume = wasPlaying.current;
      wasPlaying.current = false;
      setScrubFraction(null);
      if (resume && !disabled && mounted.current) void startPlayback(false);
    },
  };
  return {
    playing: status.playing,
    position,
    total,
    progress,
    toggle,
    seekTo,
    seekBy,
    skip,
    rate,
    setRate,
    scrub,
    scrubbing,
    displayProgress,
    displayPosition,
  };
}
