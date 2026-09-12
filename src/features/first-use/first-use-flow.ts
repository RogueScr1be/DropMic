import type { RecordingState } from '@/features/recording/recording-machine';

export type FirstUsePhase =
  | 'splash'
  | 'age_gate'
  | 'topic_reveal'
  | 'duration_selection'
  | 'countdown'
  | 'recording'
  | 'completion';

export const SPLASH_DURATION_MS = 900;
export const PREPARATION_COUNTDOWN_MS = 1_800;

export function firstScreenAfterSplash(ageGateAccepted: boolean) : FirstUsePhase {
  return ageGateAccepted ? 'topic_reveal' : 'age_gate';
}

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
  if (state === 'recording' || state === 'paused' || state === 'completing' || state === 'cancelling') {
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

export function shouldAnimateSolari(reducedMotion: boolean) {
  return !reducedMotion;
}

export type RecoveryPresentation = 'retained-take' | 'auth-recovery' | null;

export function recoveryPresentationForState({
  hasAuthRecovery,
  hasHiddenCompletedTake,
  hasRetainedCompletedTake,
}: {
  hasAuthRecovery: boolean;
  hasHiddenCompletedTake: boolean;
  hasRetainedCompletedTake: boolean;
}): RecoveryPresentation {
  if (hasHiddenCompletedTake || hasRetainedCompletedTake) {
    return 'retained-take';
  }
  return hasAuthRecovery ? 'auth-recovery' : null;
}

export type RecordingStartDecision = 'start' | 'wait-for-retained-take-hydration' | 'confirm-retained-take-replacement';

export function recordingStartDecision({
  hasRetainedTake,
  replaceRetainedTake,
  retainedTakeHydrating,
}: {
  hasRetainedTake: boolean;
  replaceRetainedTake: boolean;
  retainedTakeHydrating: boolean;
}): RecordingStartDecision {
  if (retainedTakeHydrating) {
    return 'wait-for-retained-take-hydration';
  }
  if (hasRetainedTake && !replaceRetainedTake) {
    return 'confirm-retained-take-replacement';
  }
  return 'start';
}
