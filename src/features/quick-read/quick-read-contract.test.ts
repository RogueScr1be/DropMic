import {
  parseFeedbackResponse,
  parseQuickReadResult,
  SPEAKER_VIBES,
} from '../../../supabase/functions/_shared/quick-read-contract';
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

  it('keeps legacy results valid without fabricating a missing vibe', () => {
    const result = parseQuickReadResult({
      clarity: 0.8,
      structure: 0.7,
      specificity: 0.6,
      concision: 0.9,
      strength: 'A clear opening.',
      improvement: 'Add one concrete example.',
      nextDrill: 'Answer again with one example and a closing sentence.',
    });

    expect(result?.speakerVibe).toBeUndefined();
  });
});

describe('Quick Read provider response boundary', () => {
  const validContent = JSON.stringify({
    clarity: 0.8,
    structure: 0.7,
    specificity: 0.6,
    concision: 0.9,
    strength: 'A clear opening.',
    improvement: 'Add one concrete example.',
    nextDrill: 'Answer again with one example and a closing sentence for exactly 60 seconds.',
    speaker_vibe: 'The Storyteller',
  });

  it('accepts a Chat Completions structured response without exposing provider content', () => {
    expect(parseFeedbackResponse({ choices: [{ finish_reason: 'stop', message: { content: validContent } }] })).toEqual({
      ok: true,
      result: {
        clarity: 0.8,
        structure: 0.7,
        specificity: 0.6,
        concision: 0.9,
      strength: 'A clear opening.',
      improvement: 'Add one concrete example.',
      nextDrill: 'Answer again with one example and a closing sentence for exactly 60 seconds.',
      speakerVibe: 'The Storyteller',
    },
  });
  });

  it('classifies an empty or non-text provider message as a response-shape failure', () => {
    expect(parseFeedbackResponse({ choices: [{ finish_reason: 'length', message: { content: null } }] })).toEqual({
      ok: false,
      code: 'invalid_model_response_shape',
      diagnostics: {
        finishReason: 'length',
        messagePresent: true,
        contentType: 'object',
        contentLength: null,
        refusalPresent: false,
      },
    });
  });

  it('classifies malformed JSON without attempting repair', () => {
    expect(parseFeedbackResponse({ choices: [{ message: { content: '{"clarity":' } }] })).toEqual({
      ok: false,
      code: 'invalid_model_json',
      diagnostics: { contentLength: 11 },
    });
  });

  it('classifies a seven-field schema mismatch without inventing values', () => {
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify({ clarity: 0.8 }) } }] })).toEqual({
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: { keys: ['clarity'] },
    });
  });

  it('rejects an unknown speaker vibe at the provider boundary', () => {
    const content = JSON.parse(validContent) as Record<string, unknown>;
    content.speaker_vibe = 'The Improviser';
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
      ok: false,
      code: 'invalid_model_schema',
    });
  });

  it('accepts every approved speaker vibe', () => {
    for (const speakerVibe of SPEAKER_VIBES) {
      const content = JSON.parse(validContent) as Record<string, unknown>;
      content.speaker_vibe = speakerVibe;
      expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
        ok: true,
        result: { speakerVibe },
      });
    }
  });

  it('rejects coaching that exceeds the new sentence or drill contract', () => {
    const content = JSON.parse(validContent) as Record<string, unknown>;
    content.strength = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty one.';
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
      ok: false,
      code: 'invalid_model_schema',
    });
  });
});
