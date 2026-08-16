import {
  parseFeedbackResponse,
  parseQuickReadResult,
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
});

describe('Quick Read provider response boundary', () => {
  const validContent = JSON.stringify({
    clarity: 0.8,
    structure: 0.7,
    specificity: 0.6,
    concision: 0.9,
    strength: 'A clear opening.',
    improvement: 'Add one concrete example.',
    nextDrill: 'Answer again with one example and a closing sentence.',
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
        nextDrill: 'Answer again with one example and a closing sentence.',
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
});
