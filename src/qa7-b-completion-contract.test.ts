import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const source = readFileSync('src/app/index.tsx', 'utf8');
const markSource = readFileSync('src/features/completion/CompletionMark.tsx', 'utf8');

describe('QA7-B completion contracts', () => {
  it('triggers the bell only after persistence confirmation for a live attempt', () => {
    const confirmation = 'dispatch({ type: \'PERSISTENCE_CONFIRMED\', completedAtMs: completedAtMsForAttempt });';
    const bell = 'playCompletionBell(savedAttempt.clientAttemptId);';

    expect(source).toContain('const playCompletionBell = useCompletionBell();');
    expect(source.split(confirmation).slice(1).filter((chunk) => chunk.trimStart().startsWith(bell))).toHaveLength(2);
    expect(source).not.toContain('playCompletionBell(attempt.clientAttemptId);');
  });

  it('keeps the check animation expressive in full motion and immediate in reduced motion', () => {
    expect(markSource).toContain('Animated.timing(checkOpacity, { delay: 70, duration: 150, toValue: 1');
    expect(markSource).toContain('Animated.timing(checkScale, { delay: 70, duration: 150, toValue: 1');
    expect(markSource).toContain('checkScale.setValue(1);');
    expect(markSource).toContain('!reducedMotion && { opacity: checkOpacity, transform: [{ scale: checkScale }] }');
    expect(markSource).not.toContain('Animated.spring');
  });

  it('does not couple recovery, close, or retained playback paths to the bell', () => {
    expect(source).not.toContain('showRetainedCompletedTake(savedAttempt');
    expect(source).not.toContain('closeCompletedTake();\n        playCompletionBell');
    expect(source).toContain('audio.play(recordingUri)');
  });
});
