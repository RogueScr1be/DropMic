import { describe, expect, it } from '@jest/globals';

import {
  parseFeedbackResponse,
  parseQuickReadResult,
  shapeQuickReadResponse,
} from '../../../supabase/functions/_shared/quick-read-contract';
import {
  RUBRIC_ANCHORS,
  RUBRIC_CRITERION_IDS,
  RUBRIC_DRILLS,
  summarizeRubric,
  type RubricAssessment,
} from '../../../supabase/functions/_shared/dropmic-rubric';

const transcript = 'My main idea is school should start later because tired students cannot focus.';

function validAssessment(): RubricAssessment {
  return Object.fromEntries(RUBRIC_CRITERION_IDS.map((id) => [id, {
    score: 2,
    evidence: transcript,
    rationale: 'You connect your recommendation to a reason the listener can follow.',
    reasonCode: 'none',
  }])) as RubricAssessment;
}

function providerResponse(criteria: Record<string, unknown>) {
  const providerCriteria = Object.fromEntries(Object.entries(criteria).map(([id, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [id, value];
    const { reasonCode: _reasonCode, ...judgment } = value as Record<string, unknown>;
    return [id, judgment];
  }));
  return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ criteria: providerCriteria }) } }] };
}

function providerResponseWithReasonCodes(criteria: Record<string, unknown>) {
  return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ criteria }) } }] };
}

describe('DropMic rubric contract', () => {
  it('defines 16 anchored checks across the four equal dimensions', () => {
    expect(RUBRIC_CRITERION_IDS).toHaveLength(16);
    expect(Object.values(RUBRIC_ANCHORS)).toHaveLength(16);
  });

  it('converts legacy stored results without exposing old style labels', () => {
    const result = parseQuickReadResult({
      clarity: 0.8,
      structure: 0.7,
      specificity: 0.6,
      concision: 0.9,
      strength: 'A clear opening.',
      improvement: 'Add one concrete example.',
      nextDrill: 'Answer again with one example and a closing sentence.',
      speaker_vibe: 'The Explorer',
    });
    expect(result).toEqual({
      clarity: 0.8,
      structure: 0.7,
      specificity: 0.6,
      concision: 0.9,
      strength: 'A clear opening.',
      improvement: 'Add one concrete example.',
      nextDrill: 'Answer again with one example and a closing sentence.',
    });
  });

  it('scores each criterion from exact transcript evidence and derives dimensions in code', () => {
    const parsed = parseFeedbackResponse(providerResponse(validAssessment()), transcript);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result).toMatchObject({
      clarity: 1,
      structure: 1,
      specificity: 1,
      concision: 1,
      rubricVersion: 'dropmic-message-v1',
      taskMet: true,
      strength: 'You connect your recommendation to a reason the listener can follow.',
      nextDrill: expect.stringContaining('60 seconds'),
    });
    expect(parsed.result.rubricScores).toBeDefined();
    expect(Object.keys(parsed.evidence)).toHaveLength(16);
    expect(parsed.evidence.main_message.reasonCode).toBe('none');
  });

  it('derives each evidence reason code from the server rubric anchor and score', () => {
    const criteria = validAssessment();
    criteria.relevant_content = { score: 0, evidence: transcript, rationale: 'You move to a detail that does not serve the point.', reasonCode: 'none' };
    criteria.support = { score: 1, evidence: transcript, rationale: 'You give a reason, but it needs more explanation.', reasonCode: 'none' };
    const parsed = parseFeedbackResponse(providerResponse(criteria), transcript);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.evidence.relevant_content.reasonCode).toBe('content_off_topic');
    expect(parsed.evidence.support.reasonCode).toBe('support_incomplete');
  });

  it('rejects provider-authored reason codes as unexpected fields', () => {
    const criteria = Object.fromEntries(RUBRIC_CRITERION_IDS.map((id) => [id, {
      score: 2,
      evidence: transcript,
      rationale: 'You connect your recommendation to a reason the listener can follow.',
      reasonCode: 'none',
    }]));
    expect(parseFeedbackResponse(providerResponseWithReasonCodes(criteria), transcript)).toMatchObject({
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: { field: 'main_message', reason: 'unexpected_field' },
    });
  });

  it('keeps every deterministic Drop Drill within the server coaching word limit', () => {
    const countWords = (value: string) => value.trim().split(/\s+/u).length;
    for (const id of RUBRIC_CRITERION_IDS) {
      const assessment = validAssessment();
      assessment[id] = {
        score: 0,
        evidence: transcript,
        rationale: 'You do not show this behavior in the response.',
        reasonCode: RUBRIC_ANCHORS[id].reasons[0],
      };
      const summary = summarizeRubric(assessment);
      expect(summary.nextDrill).toBe(RUBRIC_DRILLS[id]);
      expect(countWords(summary.nextDrill)).toBeLessThanOrEqual(28);
    }
    expect(countWords(summarizeRubric(validAssessment()).nextDrill)).toBeLessThanOrEqual(28);
  });

  it('selects one fix by rubric priority and withholds the overall score for unmet task', () => {
    const criteria = validAssessment();
    criteria.task_alignment = { score: 0, evidence: transcript, rationale: 'You do not answer the requested task.', reasonCode: 'task_mismatch' };
    criteria.main_message = { score: 1, evidence: transcript, rationale: 'You offer a point, but another idea competes with it.', reasonCode: 'competing_ideas' };
    const parsed = parseFeedbackResponse(providerResponse(criteria), transcript);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.taskMet).toBe(false);
    expect(parsed.result.improvement).toBe('You do not answer the requested task.');
  });

  it('rejects missing criteria, unscorable judgments, and evidence not found in transcript', () => {
    const missing: Record<string, unknown> = { ...validAssessment() };
    delete missing.focus;
    expect(parseFeedbackResponse(providerResponse(missing), transcript)).toMatchObject({
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: { field: 'focus', reason: 'missing_field' },
    });

    const unscorable = {
      ...validAssessment(),
      main_message: { score: -1, evidence: transcript, rationale: 'The transcript is too unreliable to judge this.', reasonCode: 'no_clear_message' },
    };
    expect(parseFeedbackResponse(providerResponse(unscorable), transcript)).toMatchObject({ ok: false, code: 'unscorable_evaluation' });

    const invalidEvidence = validAssessment();
    invalidEvidence.main_message = { score: 2, evidence: 'invented quote', rationale: 'You connect the point to a useful reason.', reasonCode: 'none' };
    expect(parseFeedbackResponse(providerResponse(invalidEvidence), transcript)).toMatchObject({
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: { field: 'main_message', reason: 'invalid_evidence' },
    });
  });

  it('withholds a score rather than fabricating a strength when every check has zero evidence', () => {
    const allZero = Object.fromEntries(RUBRIC_CRITERION_IDS.map((id) => [id, {
      score: 0,
      evidence: transcript,
      rationale: 'You do not show this behavior in the response.',
      reasonCode: RUBRIC_ANCHORS[id].reasons[0],
    }]));
    expect(parseFeedbackResponse(providerResponse(allZero), transcript)).toMatchObject({
      ok: false,
      code: 'unscorable_evaluation',
      diagnostics: { field: 'output', reason: 'unscorable' },
    });
  });

  it('derives the concern reason from a zero score instead of trusting a model enum', () => {
    const assessment = validAssessment();
    assessment.repetition = { score: 0, evidence: transcript, rationale: 'You repeat a point without adding meaning.', reasonCode: 'none' };
    const parsed = parseFeedbackResponse(providerResponse(assessment), transcript);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.evidence.repetition.reasonCode).toBe('repetition_unhelpful');
  });

  it('keeps the legacy response shape for installed clients and gates unmet tasks without returning a score', () => {
    const parsed = parseFeedbackResponse(providerResponse(validAssessment()), transcript);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(shapeQuickReadResponse(parsed.result, 'legacy')).toEqual({
      status: 'completed',
      result: {
        clarity: 1, structure: 1, specificity: 1, concision: 1,
        strength: expect.any(String), improvement: expect.any(String), nextDrill: expect.any(String),
      },
    });
    const offTask = { ...parsed.result, taskMet: false };
    expect(shapeQuickReadResponse(offTask, 'legacy')).toEqual({ status: 'failed', error: 'task_not_met' });
    expect(shapeQuickReadResponse(offTask, 'dropmic-rubric-v1')).toMatchObject({ status: 'completed', result: { taskMet: false } });
  });

  it('returns rubric evidence only to a server-verified Plus result-contract-v2 response', () => {
    const parsed = parseFeedbackResponse(providerResponse(validAssessment()), transcript);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(shapeQuickReadResponse(parsed.result, 'dropmic-rubric-v2', parsed.evidence, false).result).not.toHaveProperty('rubricEvidence');
    expect(shapeQuickReadResponse(parsed.result, 'dropmic-rubric-v2', parsed.evidence, true).result).toHaveProperty('rubricEvidence');
    expect(shapeQuickReadResponse(parsed.result, 'dropmic-rubric-v1', parsed.evidence, true).result).not.toHaveProperty('rubricEvidence');
  });

  it('parses bounded Plus evidence and rejects unknown evidence fields', () => {
    const parsed = parseFeedbackResponse(providerResponse(validAssessment()), transcript);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const candidate = {
      ...parsed.result,
      rubricEvidence: parsed.evidence,
    };
    expect(parseQuickReadResult(candidate)?.rubricEvidence).toEqual(parsed.evidence);
    expect(parseQuickReadResult({
      ...candidate,
      rubricEvidence: { ...parsed.evidence, main_message: { ...parsed.evidence.main_message, privateField: 'drop' } },
    })).toBeNull();
  });
});
