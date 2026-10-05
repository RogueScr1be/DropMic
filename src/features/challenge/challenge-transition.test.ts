import { describe, expect, it } from '@jest/globals';

import {
  CHALLENGE_TRANSITION_STAGES,
  challengePreparationError,
  isChallengeDestinationCommitted,
  shouldStartChallengePreparation,
} from './challenge-transition';

describe('challenge transition safety', () => {
  it('uses only token-free diagnostic stages', () => {
    expect(CHALLENGE_TRANSITION_STAGES).toEqual([
      'confirmation_pressed',
      'pending_state_saved',
      'root_transition_started',
      'challenge_resolution_started',
      'challenge_resolution_succeeded',
      'destination_committed',
      'transition_failed',
    ]);
    expect(CHALLENGE_TRANSITION_STAGES.join(' ')).not.toMatch(/[a-f0-9]{64}/i);
  });

  it('sanitizes unknown failures without echoing their contents', () => {
    const token = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const message = challengePreparationError(new Error(`failed for ${token}`));

    expect(message).not.toContain(token);
    expect(message).toContain('safely');
  });

  it('commits only after the visible destination is ready', () => {
    expect(isChallengeDestinationCommitted({ status: 'ready' }, 'topic_reveal')).toBe(true);
    expect(isChallengeDestinationCommitted({ status: 'ready' }, 'splash')).toBe(false);
    expect(isChallengeDestinationCommitted({ stage: 'challenge_resolution_started', status: 'preparing' }, 'topic_reveal')).toBe(false);
  });

  it('blocks duplicate preparation while handled or resolving', () => {
    expect(shouldStartChallengePreparation('token', null, null)).toBe(true);
    expect(shouldStartChallengePreparation('token', 'token', null)).toBe(false);
    expect(shouldStartChallengePreparation('token', null, 'token')).toBe(false);
  });
});
