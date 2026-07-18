import { describe, expect, it, jest } from '@jest/globals';

import {
  createCompletionGate,
  formatCountdownNumber,
  formatSpeakingTime,
  phaseForRecordingState,
  PREPARATION_COUNTDOWN_MS,
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
    expect(phaseForRecordingState('completed')).toBe('completion');
    expect(phaseForRecordingState('idle')).toBeNull();
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
});
