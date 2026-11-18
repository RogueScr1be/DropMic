import { describe, expect, it } from '@jest/globals';

import { buildShareCardText, shareCardIsPrivateSafe } from './share-service';

describe('share card privacy contract', () => {
  it('shares prompt and optional result data without transcript or identifiers', () => {
    const text = buildShareCardText({
      prompt: 'Tell a story about a small risk you took.',
      challengeUrl: 'https://dropmic.example/challenge/opaque-token',
      dropScore: 84,
    });
    expect(text).not.toContain('Vibe');
    expect(text).toContain('Drop Score: 84%');
    expect(text).toContain('Your turn: take the prompt.');
    expect(text).not.toContain('I scored');
    expect(shareCardIsPrivateSafe(text)).toBe(true);
    expect(shareCardIsPrivateSafe(`${text}\ntranscript: private`)).toBe(false);
  });

  it('does not invent a score when Quick Read is absent', () => {
    const text = buildShareCardText({ prompt: 'What changed your mind?', challengeUrl: 'micdrop://challenge/opaque-token' });
    expect(text).not.toContain('Score');
    expect(text).toContain('Your turn: take the prompt.');
  });
});
