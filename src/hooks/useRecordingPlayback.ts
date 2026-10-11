import { useEffect } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

/**
 * Playback of one recording: play/pause toggle, position and length. One player per mount. The
 * player stops when the owner unmounts (the card is removed or the page is left).
 * `durationMs` is the known length, used until the player reports its own.
 */
export function useRecordingPlayback(uri: string, durationMs: number) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  useEffect(
    () => () => {
      try {
        player.pause();
      } catch {
        // The player may already be released with its owner.
      }
    },
    [player],
  );

  /** Length in seconds. */
  const total = status.duration > 0 ? status.duration : durationMs / 1000;
  /** Position in seconds. */
  const position = status.currentTime;
  const progress = total > 0 ? Math.min(1, position / total) : 0;

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    if (status.duration > 0 && status.currentTime >= status.duration - 0.25) {
      await player.seekTo(0);
    }
    player.play();
  };

  return { playing: status.playing, position, total, progress, toggle };
}
