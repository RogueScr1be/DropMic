import { describe, expect, it } from '@jest/globals';

import { buildShareCardText, shareCardIsPrivateSafe } from './share-service';

describe('share card privacy contract', () => {
  it('shares prompt and optional result data without transcript or identifiers', () => {
    const text = buildShareCardText({
      prompt: 'Tell a story about a small risk you took.',
      challengeUrl: 'https://dropmic.example/challenge/opaque-token',
      speakerVibe: 'Clear and warm',
      dropScore: 84,
    });
    expect(text).toContain('Speaker Vibe: Clear and warm');
    expect(text).toContain('Drop Score: 84%');
    expect(shareCardIsPrivateSafe(text)).toBe(true);
    expect(shareCardIsPrivateSafe(`${text}\ntranscript: private`)).toBe(false);
  });

  it('does not invent a score or vibe when Quick Read is absent', () => {
    const text = buildShareCardText({ prompt: 'What changed your mind?', challengeUrl: 'micdrop://challenge/opaque-token' });
    expect(text).not.toContain('Score');
    expect(text).not.toContain('Vibe');
  });
});
