import { parseQuickReadResult } from '../../../supabase/functions/_shared/quick-read-contract';
import { describe, expect, it } from '@jest/globals';

describe('Quick Read result contract', () => {
  it('accepts the exact structured result shape', () => {
    expect(
      parseQuickReadResult({
        clarity: 0.8,
        structure: 0.7,
        specificity: 0.6,
        concision: 0.9,
        strength: 'A clear opening.',
        improvement: 'Add one concrete example.',
        nextDrill: 'Answer again with one example and a closing sentence.',
      }),
    ).toEqual({
      clarity: 0.8,
      structure: 0.7,
      specificity: 0.6,
      concision: 0.9,
      strength: 'A clear opening.',
      improvement: 'Add one concrete example.',
      nextDrill: 'Answer again with one example and a closing sentence.',
    });
  });

  it('rejects missing, out-of-range, or arbitrary model fields', () => {
    expect(parseQuickReadResult({ clarity: 1 })).toBeNull();
    expect(
      parseQuickReadResult({
        clarity: 1.2,
        structure: 0.7,
        specificity: 0.6,
        concision: 0.9,
        strength: 'A',
        improvement: 'B',
        nextDrill: 'C',
      }),
    ).toBeNull();
    expect(
      parseQuickReadResult({
        clarity: 0.8,
        structure: 0.7,
        specificity: 0.6,
        concision: 0.9,
        strength: 'A',
        improvement: 'B',
        nextDrill: 'C',
        transcript: 'must never be accepted as feedback',
      }),
    ).toBeNull();
  });
});
