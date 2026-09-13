import { setAudioModeAsync, setIsAudioActiveAsync, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';

const CLACK_SOUND_SOURCE = require('../../../assets/audio/solari-board-sound.m4a');
const CLACK_DURATION_MS = 950;
let audioModePromise: Promise<void> | null = null;

function ensureSolariAudioMode() {
  audioModePromise ??= setIsAudioActiveAsync(true)
    .then(() =>
      setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: 'mixWithOthers',
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      }),
    )
    .catch(() => {
      audioModePromise = null;
    });
  return audioModePromise;
}

export function tapSolariHaptic() {
  if (Platform.OS !== 'web') {
    Vibration.vibrate(Platform.OS === 'android' ? 8 : 1);
  }
}

export function useClackSound(enabled: boolean) {
  const player = useAudioPlayer(CLACK_SOUND_SOURCE);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopClack = useCallback(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    try {
      player.pause();
      void player.seekTo(0).catch(() => undefined);
    } catch {
      // Best effort only: reveal audio should never block the board.
    }
  }, [player]);

  const playClack = useCallback(() => {
    if (!enabled) {
      return;
    }

    stopClack();
    void ensureSolariAudioMode()
      .then(() => player.seekTo(0).catch(() => undefined))
      .then(() => {
        player.play();
        stopTimer.current = setTimeout(stopClack, CLACK_DURATION_MS);
      })
      .catch(() => undefined);
  }, [enabled, player, stopClack]);

  useEffect(() => stopClack, [stopClack]);

  return playClack;
}
