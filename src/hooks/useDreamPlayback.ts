import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useState } from 'react';
import { dreamAudioUri } from '../services/dreamStorage';
import { Dream } from '../types/dream';

/** One shared player for the dream list: tap a dream to play, tap again to pause. */
export function useDreamPlayback() {
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const toggle = async (dream: Dream) => {
    const uri = dreamAudioUri(dream);
    if (!uri) return; // Written dreams have no audio.

    if (currentId === dream.id) {
      if (status.playing) {
        player.pause();
        return;
      }
      const finished = status.duration > 0 && status.currentTime >= status.duration - 0.25;
      if (finished) await player.seekTo(0);
      player.play();
      return;
    }

    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    player.replace(uri);
    setCurrentId(dream.id);
    player.play();
  };

  return { toggle, playingId: status.playing ? currentId : null };
}
