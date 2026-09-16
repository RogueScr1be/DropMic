import { setAudioModeAsync, setIsAudioActiveAsync, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useMemo } from 'react';

export const COMPLETION_BELL_SOURCE = require('../../../assets/audio/completion bell.mp3');

export type CompletionBellPlayer = {
  pause: () => void;
  play: () => void;
  remove: () => void;
  seekTo: (seconds: number) => Promise<void>;
};

type CompletionAudioMode = () => Promise<void>;

let audioModePromise: Promise<void> | null = null;

function ensureCompletionAudioMode() {
  audioModePromise ??= setIsAudioActiveAsync(true)
    .then(() => setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: 'mixWithOthers',
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }))
    .catch(() => {
      audioModePromise = null;
    });
  return audioModePromise;
}

export function createCompletionBellController(
  player: CompletionBellPlayer,
  prepareAudioMode: CompletionAudioMode = ensureCompletionAudioMode,
) {
  const playedAttemptIds = new Set<string>();
  let disposed = false;

  return {
    playOnce(attemptId: string) {
      if (disposed || playedAttemptIds.has(attemptId)) {
        return Promise.resolve(false);
      }
      playedAttemptIds.add(attemptId);

      return prepareAudioMode()
        .catch(() => undefined)
        .then(() => player.seekTo(0))
        .then(() => {
          if (disposed) {
            return false;
          }
          player.play();
          return true;
        })
        .catch(() => false);
    },
    cleanup() {
      if (disposed) {
        return;
      }
      disposed = true;
      try {
        player.pause();
      } catch {
        // Best effort only: bell cleanup must never affect completion state.
      }
      try {
        player.remove();
      } catch {
        // Best effort only: bell cleanup must never affect completion state.
      }
    },
  };
}

export function useCompletionBell() {
  const player = useAudioPlayer(COMPLETION_BELL_SOURCE);
  const controller = useMemo(() => createCompletionBellController(player), [player]);

  useEffect(() => () => controller.cleanup(), [controller]);

  return useCallback((attemptId: string) => {
    void controller.playOnce(attemptId);
  }, [controller]);
}
