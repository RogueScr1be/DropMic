import { ChallengeServiceError } from './challenge-service';

export const CHALLENGE_TRANSITION_STAGES = [
  'confirmation_pressed',
  'pending_state_saved',
  'root_transition_started',
  'challenge_resolution_started',
  'challenge_resolution_succeeded',
  'destination_committed',
  'transition_failed',
] as const;

export type ChallengeTransitionStage = (typeof CHALLENGE_TRANSITION_STAGES)[number];

export type ChallengePreparationState =
  | { status: 'idle' }
  | { status: 'preparing'; stage: ChallengeTransitionStage }
  | { status: 'ready' }
  | { status: 'error'; message: string; stage: 'transition_failed' };

export function challengePreparationError(reason: unknown) {
  if (reason instanceof ChallengeServiceError) {
    return reason.message;
  }
  return 'This challenge could not be prepared. You can safely return to DropMic and try again.';
}

export function isChallengeDestinationCommitted(
  state: ChallengePreparationState,
  displayedPhase: string,
) {
  return state.status === 'ready' && displayedPhase === 'topic_reveal';
}

export function shouldStartChallengePreparation(
  token: string,
  handledToken: string | null,
  resolvingToken: string | null,
) {
  return Boolean(token) && handledToken !== token && resolvingToken !== token;
}
