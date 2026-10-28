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
    strength: 'You open with a clear point.',
    improvement: 'You can add one concrete example.',
    nextDrill: 'You can answer again with one example and a closing sentence for exactly 60 seconds.',
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
        strength: 'You open with a clear point.',
        improvement: 'You can add one concrete example.',
        nextDrill: 'You can answer again with one example and a closing sentence for exactly 60 seconds.',
      speakerVibe: 'The Storyteller',
    },
  });
  });

  it('classifies an empty or non-text provider message as a response-shape failure', () => {
    expect(parseFeedbackResponse({ choices: [{ finish_reason: 'length', message: { content: null } }] })).toEqual({
      ok: false,
      code: 'invalid_model_response_shape',
      diagnostics: { field: 'response', reason: 'invalid_shape' },
    });
  });

  it('classifies malformed JSON without attempting repair', () => {
    expect(parseFeedbackResponse({ choices: [{ message: { content: '{"clarity":' } }] })).toEqual({
      ok: false,
      code: 'invalid_model_json',
      diagnostics: { field: 'response', reason: 'invalid_json' },
    });
  });

  it('classifies a seven-field schema mismatch without inventing values', () => {
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify({ clarity: 0.8 }) } }] })).toEqual({
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: { field: 'structure', reason: 'missing_field' },
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

  it('accepts structurally valid coaching with discouraged style phrases', () => {
    const content = JSON.parse(validContent) as Record<string, unknown>;
    content.strength = 'You present the main point clearly.';
    content.improvement = 'You demonstrate one useful example.';
    content.nextDrill = 'You imply the next step, then practice one example for exactly 60 seconds.';
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
      ok: true,
    });
  });

  it('rejects coaching that exceeds the word or drill contract', () => {
    const content = JSON.parse(validContent) as Record<string, unknown>;
    content.strength = 'You one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four.';
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
      ok: false,
      code: 'invalid_model_schema',
    });

    content.strength = 'You make one clear point.';
    content.nextDrill = `${Array.from({ length: 29 }, (_, index) => `word${index + 1}`).join(' ')} for exactly 60 seconds.`;
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
      ok: false,
      code: 'invalid_model_schema',
    });

    content.nextDrill = 'You practice one example without naming a timed target.';
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
      ok: false,
      code: 'invalid_model_schema',
    });
  });

  it('accepts any in-range score and rejects invalid score types or ranges', () => {
    const content = JSON.parse(validContent) as Record<string, unknown>;
    content.clarity = 0.83;
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
      ok: true,
    });

    content.clarity = 1.01;
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toEqual({
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: { field: 'clarity', reason: 'out_of_range' },
    });

    content.clarity = '0.8';
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toEqual({
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: { field: 'clarity', reason: 'invalid_type' },
    });
  });

  it('redacts unknown field names and private provider values from diagnostics', () => {
    const content = JSON.parse(validContent) as Record<string, unknown>;
    content.privateTranscriptLeak = 'SENTINEL_PRIVATE_TEXT_71f3';
    const rejected = parseFeedbackResponse({
      choices: [{ message: { content: JSON.stringify(content) } }],
    });

    expect(rejected).toEqual({
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: { field: 'output', reason: 'unexpected_field' },
    });
    expect(JSON.stringify(rejected)).not.toContain('privateTranscriptLeak');
    expect(JSON.stringify(rejected)).not.toContain('SENTINEL_PRIVATE_TEXT_71f3');
  });

  it('reports only allowlisted fields and reason codes for coaching constraints', () => {
    const content = JSON.parse(validContent) as Record<string, unknown>;
    content.strength = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five';
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
      ok: false,
      diagnostics: { field: 'strength', reason: 'word_limit' },
    });

    content.strength = 'A clear opening.';
    content.nextDrill = 'Practice one example without stating the required duration.';
    expect(parseFeedbackResponse({ choices: [{ message: { content: JSON.stringify(content) } }] })).toMatchObject({
      ok: false,
      diagnostics: { field: 'nextDrill', reason: 'duration_required' },
    });
  });
});
