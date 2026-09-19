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
});
