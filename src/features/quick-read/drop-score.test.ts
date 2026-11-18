import { describe, expect, it } from '@jest/globals';

import { calculateDropScore } from './drop-score';

describe('Drop Score', () => {
  it('averages the four persisted scores into a whole percentage', () => {
    expect(calculateDropScore({ clarity: 0.8, structure: 0.7, specificity: 0.6, concision: 0.9 })).toBe(75);
  });

  it('rounds half values up at the boundaries', () => {
    expect(calculateDropScore({ clarity: 0, structure: 0, specificity: 0, concision: 0.02 })).toBe(1);
    expect(calculateDropScore({ clarity: 1, structure: 1, specificity: 1, concision: 1 })).toBe(100);
  });

  it('calculates from the 16 raw criterion points instead of averaging rounded tiles', () => {
    const rubricScores = Object.fromEntries([
      'main_message', 'task_alignment', 'understandable_meaning', 'internal_consistency',
      'orientation', 'progression', 'connections', 'completion',
      'concrete_detail', 'support', 'explanation', 'sufficient_development',
      'relevant_content', 'repetition', 'economy_of_wording', 'focus',
    ].map((id, index) => [id, index < 11 ? 1 : 0]));
    expect(calculateDropScore({ clarity: 0, structure: 0, specificity: 0, concision: 0, rubricScores })).toBe(34);
  });

  it('withholds an overall score when the task was not met', () => {
    expect(calculateDropScore({ clarity: 1, structure: 1, specificity: 1, concision: 1, taskMet: false })).toBeNull();
  });
});
