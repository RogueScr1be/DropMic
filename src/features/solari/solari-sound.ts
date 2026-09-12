import { useAudioPlayer } from 'expo-audio';
import { useCallback } from 'react';
import { Platform, Vibration } from 'react-native';

const CLACK_SOUND_SOURCE = require('../../../assets/audio/solari-board-sound.mp3');

function tapHaptic() {
  if (Platform.OS !== 'web') {
    Vibration.vibrate(Platform.OS === 'android' ? 8 : 1);
  }
}

export function useClackSound(enabled: boolean) {
  const player = useAudioPlayer(CLACK_SOUND_SOURCE);

  const playClack = useCallback(() => {
    if (!enabled) {
      return;
    }

    tapHaptic();
    void player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => undefined);
  }, [enabled, player]);

  return playClack;
}
