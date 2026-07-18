import type { RecordingState } from '@/features/recording/recording-machine';

export type FirstUsePhase =
  | 'splash'
  | 'topic_reveal'
  | 'duration_selection'
  | 'countdown'
  | 'recording'
  | 'completion';

export const SPLASH_DURATION_MS = 900;
export const PREPARATION_COUNTDOWN_MS = 1_800;

export function formatSpeakingTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatCountdownNumber(startedAtMs: number, nowMs: number) {
  const elapsed = Math.max(0, nowMs - startedAtMs);
  return Math.max(1, Math.ceil((PREPARATION_COUNTDOWN_MS - elapsed) / 600));
}

export function phaseForRecordingState(state: RecordingState): FirstUsePhase | null {
  if (state === 'countdown') {
    return 'countdown';
  }
  if (state === 'recording') {
    return 'recording';
  }
  if (state === 'completed') {
    return 'completion';
  }
  return null;
}

export function createCompletionGate(onComplete: () => void) {
  let completed = false;
  return () => {
    if (completed) {
      return;
    }
    completed = true;
    onComplete();
  };
}

export function shouldPlayClack(soundEnabled: boolean) {
  return soundEnabled;
}
