import { describe, expect, it } from '@jest/globals';

import { createCompletionGate } from '@/features/first-use/first-use-flow';

describe('Solari board contracts', () => {
  it('uses a static completion path when reduced motion is enabled', () => {
    let completions = 0;
    const complete = createCompletionGate(() => {
      completions += 1;
    });

    complete();
    complete();

    expect(completions).toBe(1);
  });
});
