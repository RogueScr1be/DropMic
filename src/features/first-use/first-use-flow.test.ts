import { describe, expect, it, jest } from '@jest/globals';

import {
  createCompletionGate,
  firstScreenAfterSplash,
  formatCountdownNumber,
  formatSpeakingTime,
  phaseForRecordingState,
  PREPARATION_COUNTDOWN_MS,
  recoveryPresentationForState,
  recordingStartDecision,
  shouldPlayClack,
} from './first-use-flow';

describe('first-use flow', () => {
  it('formats completion timing and countdown boundaries', () => {
    expect(formatSpeakingTime(30_000)).toBe('00:30');
    expect(formatSpeakingTime(91_200)).toBe('01:31');
    expect(formatCountdownNumber(1_000, 1_000)).toBe(3);
    expect(formatCountdownNumber(1_000, 1_600)).toBe(2);
    expect(formatCountdownNumber(1_000, 1_000 + PREPARATION_COUNTDOWN_MS)).toBe(1);
  });

  it('maps recording states into experience phases', () => {
    expect(phaseForRecordingState('countdown')).toBe('countdown');
    expect(phaseForRecordingState('recording')).toBe('recording');
    expect(phaseForRecordingState('paused')).toBe('recording');
    expect(phaseForRecordingState('completing')).toBe('recording');
    expect(phaseForRecordingState('cancelling')).toBe('recording');
    expect(phaseForRecordingState('completed')).toBe('completion');
    expect(phaseForRecordingState('idle')).toBeNull();
  });

  it('requires only the age gate before the prompt on first use', () => {
    expect(firstScreenAfterSplash(false)).toBe('age_gate');
    expect(firstScreenAfterSplash(true)).toBe('topic_reveal');
  });

  it('fires the Solari completion callback once', () => {
    const onComplete = jest.fn();
    const complete = createCompletionGate(onComplete);

    complete();
    complete();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('supports a sound-disabled path', () => {
    expect(shouldPlayClack(true)).toBe(true);
    expect(shouldPlayClack(false)).toBe(false);
  });

  it('prioritizes retained-take recovery over auth recovery', () => {
    expect(recoveryPresentationForState({
      hasAuthRecovery: true,
      hasHiddenCompletedTake: false,
      hasRetainedCompletedTake: true,
    })).toBe('retained-take');
    expect(recoveryPresentationForState({
      hasAuthRecovery: true,
      hasHiddenCompletedTake: true,
      hasRetainedCompletedTake: false,
    })).toBe('retained-take');
    expect(recoveryPresentationForState({
      hasAuthRecovery: true,
      hasHiddenCompletedTake: false,
      hasRetainedCompletedTake: false,
    })).toBe('auth-recovery');
    expect(recoveryPresentationForState({
      hasAuthRecovery: false,
      hasHiddenCompletedTake: false,
      hasRetainedCompletedTake: false,
    })).toBeNull();
  });

  it('blocks new recording while retained-take hydration is unresolved', () => {
    expect(recordingStartDecision({
      hasRetainedTake: false,
      replaceRetainedTake: false,
      retainedTakeHydrating: true,
    })).toBe('wait-for-retained-take-hydration');
    expect(recordingStartDecision({
      hasRetainedTake: true,
      replaceRetainedTake: false,
      retainedTakeHydrating: false,
    })).toBe('confirm-retained-take-replacement');
    expect(recordingStartDecision({
      hasRetainedTake: true,
      replaceRetainedTake: true,
      retainedTakeHydrating: false,
    })).toBe('start');
    expect(recordingStartDecision({
      hasRetainedTake: false,
      replaceRetainedTake: false,
      retainedTakeHydrating: false,
    })).toBe('start');
  });
});
