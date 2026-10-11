import { useEffect, useRef } from 'react';
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
 */
export function useRecordingPlayback(uri: string, durationMs: number, disabled = false) {
  const player = useAudioPlayer(uri);
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

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // No playback while a recording is in progress.
    if (disabled) return;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (!mounted.current) return;
    if (status.duration > 0 && status.currentTime >= status.duration - 0.25) {
      await player.seekTo(0);
      if (!mounted.current) return;
    }
    // Starting here pauses any other card that is playing.
    if (activePause && activePause !== pauseMine.current) stopAllPlayback();
    register(pauseMine.current);
    player.play();
  };

  return { playing: status.playing, position, total, progress, toggle };
}
