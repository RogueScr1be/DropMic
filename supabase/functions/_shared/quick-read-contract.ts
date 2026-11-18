// @ts-ignore Deno requires explicit extensions for local function imports.
import { calculateRubricDimensionScores, RUBRIC_ANCHORS, RUBRIC_CRITERION_IDS, summarizeRubric, type RubricAssessment, type RubricCriterionId, type RubricScoreMap } from './dropmic-rubric.ts';
// @ts-ignore Deno requires explicit extensions for local function imports.
import { DROPMIC_EVALUATOR_PROMPT_VERSION, DROPMIC_RESULT_CONTRACT_VERSION, DROPMIC_RUBRIC_VERSION, DROPMIC_TASK_PROFILE_VERSION } from './quick-read-versions.ts';

export { DROPMIC_RESULT_CONTRACT_VERSION };

export type QuickReadRubricEvidence = Record<RubricCriterionId, { excerpt: string; rationale: string; reasonCode: string }>;

export type QuickReadResult = {
  clarity: number;
  structure: number;
  specificity: number;
  concision: number;
  strength: string;
  improvement: string;
  nextDrill: string;
  rubricVersion?: string;
  taskProfileVersion?: string;
  evaluatorPromptVersion?: string;
  rubricScores?: RubricScoreMap;
  rubricEvidence?: QuickReadRubricEvidence;
  taskMet?: boolean;
};

export type QuickReadResponseContract = 'legacy' | 'dropmic-rubric-v1' | typeof DROPMIC_RESULT_CONTRACT_VERSION;

export function shapeQuickReadResponse(
  result: QuickReadResult,
  contract: QuickReadResponseContract,
  evidence?: QuickReadRubricEvidence | null,
  plusEligible = false,
) {
  if (contract === DROPMIC_RESULT_CONTRACT_VERSION) {
    const detailedResult = evidence && plusEligible ? { ...result, rubricEvidence: evidence } : result;
    return { status: 'completed' as const, result: detailedResult };
  }
  if (contract === 'dropmic-rubric-v1') return { status: 'completed' as const, result };
  if (result.taskMet === false) return { status: 'failed' as const, error: 'task_not_met' as const };
  return {
    status: 'completed' as const,
    result: {
      clarity: result.clarity,
      structure: result.structure,
      specificity: result.specificity,
      concision: result.concision,
      strength: result.strength,
      improvement: result.improvement,
      nextDrill: result.nextDrill,
    },
  };
}

export function parseQuickReadRubricEvidence(value: unknown): QuickReadRubricEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const expectedIds = new Set<string>(RUBRIC_CRITERION_IDS);
  if (Object.keys(record).length !== RUBRIC_CRITERION_IDS.length || Object.keys(record).some((id) => !expectedIds.has(id))) return null;
  const parsed: Partial<QuickReadRubricEvidence> = {};
  for (const id of RUBRIC_CRITERION_IDS) {
    const candidate = record[id];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    if (Object.keys(item).some((key) => !['excerpt', 'rationale', 'reasonCode'].includes(key))) return null;
    if (
      typeof item.excerpt !== 'string' || !item.excerpt.trim() || item.excerpt.length > 180 ||
      typeof item.rationale !== 'string' || !item.rationale.trim() || item.rationale.length > 240 || wordCount(item.rationale) > 28 ||
      typeof item.reasonCode !== 'string' || !(RUBRIC_ANCHORS[id].reasons as readonly string[]).includes(item.reasonCode)
    ) return null;
    parsed[id] = { excerpt: item.excerpt, rationale: item.rationale, reasonCode: item.reasonCode };
  }
  return parsed as QuickReadRubricEvidence;
}

const criteriaProperties = Object.fromEntries(RUBRIC_CRITERION_IDS.map((id) => [id, {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'integer', enum: [-1, 0, 1, 2], description: '-1 means unscorable; never convert it to zero.' },
    evidence: { type: 'string', minLength: 1, maxLength: 180, description: 'One exact, contiguous excerpt from the supplied transcript that identifies the relevant scope. For an absence, cite the nearest relevant scope and explain what is missing.' },
    rationale: { type: 'string', minLength: 1, maxLength: 240, description: 'One concise, direct-address explanation tied to the criterion anchor. Do not quote transcript text.' },
    reasonCode: { type: 'string', enum: RUBRIC_ANCHORS[id].reasons },
  },
  required: ['score', 'evidence', 'rationale', 'reasonCode'],
}])) as Record<RubricCriterionId, unknown>;

export const quickReadResultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    criteria: {
      type: 'object',
      additionalProperties: false,
      properties: criteriaProperties,
      required: RUBRIC_CRITERION_IDS,
    },
  },
  required: ['criteria'],
} as const;

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

function isDimensionScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isShortCoaching(value: string) {
  return value.trim().length > 0 && value.length <= 1200 && wordCount(value) <= 28;
}

function parseLegacyResult(record: Record<string, unknown>): QuickReadResult | null {
  const allowed = new Set(['clarity', 'structure', 'specificity', 'concision', 'strength', 'improvement', 'nextDrill', 'speaker_vibe', 'speakerVibe']);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  for (const key of ['clarity', 'structure', 'specificity', 'concision'] as const) {
    if (!isDimensionScore(record[key])) return null;
  }
  for (const key of ['strength', 'improvement', 'nextDrill'] as const) {
    if (typeof record[key] !== 'string' || !isShortCoaching(record[key] as string)) return null;
  }
  return {
    clarity: record.clarity as number,
    structure: record.structure as number,
    specificity: record.specificity as number,
    concision: record.concision as number,
    strength: (record.strength as string).trim(),
    improvement: (record.improvement as string).trim(),
    nextDrill: (record.nextDrill as string).trim(),
  };
}

export function parseQuickReadResult(value: unknown): QuickReadResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const scoresValue = record.rubricScores ?? record.rubric_scores;
  if (scoresValue !== undefined && scoresValue !== null) {
    const allowedKeys = new Set(['clarity', 'structure', 'specificity', 'concision', 'strength', 'improvement', 'nextDrill', 'rubricScores', 'rubric_scores', 'rubricEvidence', 'rubric_evidence', 'rubricVersion', 'rubric_version', 'taskProfileVersion', 'task_profile_version', 'evaluatorPromptVersion', 'evaluator_prompt_version', 'taskMet', 'task_met']);
    if (Object.keys(record).some((key) => !allowedKeys.has(key))) return null;
    if (!scoresValue || typeof scoresValue !== 'object' || Array.isArray(scoresValue)) return null;
    const scores = scoresValue as Record<string, unknown>;
    if (RUBRIC_CRITERION_IDS.some((id) => !Number.isInteger(scores[id]) || (scores[id] as number) < 0 || (scores[id] as number) > 2)) return null;
    const rubricScores = Object.fromEntries(RUBRIC_CRITERION_IDS.map((id) => [id, scores[id]])) as RubricScoreMap;
    const rawEvidence = record.rubricEvidence ?? record.rubric_evidence;
    const rubricEvidence = rawEvidence === undefined || rawEvidence === null ? undefined : parseQuickReadRubricEvidence(rawEvidence);
    if (rawEvidence !== undefined && rawEvidence !== null && !rubricEvidence) return null;
    const dimensionScores = calculateRubricDimensionScores(rubricScores);
    const expectedVersion = record.rubricVersion ?? record.rubric_version;
    const taskProfileVersion = record.taskProfileVersion ?? record.task_profile_version;
    const evaluatorPromptVersion = record.evaluatorPromptVersion ?? record.evaluator_prompt_version;
    if (expectedVersion !== DROPMIC_RUBRIC_VERSION || taskProfileVersion !== DROPMIC_TASK_PROFILE_VERSION || evaluatorPromptVersion !== DROPMIC_EVALUATOR_PROMPT_VERSION) return null;
    for (const key of ['strength', 'improvement', 'nextDrill'] as const) {
      if (typeof record[key] !== 'string' || !isShortCoaching(record[key] as string)) return null;
    }
    if (record.taskMet !== undefined && typeof record.taskMet !== 'boolean' && typeof record.task_met !== 'boolean') return null;
    const taskMet = (record.taskMet ?? record.task_met ?? (rubricScores.task_alignment > 0)) as boolean;
    const storedDimensions = { clarity: record.clarity, structure: record.structure, specificity: record.specificity, concision: record.concision };
    for (const key of ['clarity', 'structure', 'specificity', 'concision'] as const) {
      if (storedDimensions[key] !== undefined && (!isDimensionScore(storedDimensions[key]) || storedDimensions[key] !== dimensionScores[key])) return null;
    }
    return {
      ...dimensionScores,
      strength: (record.strength as string).trim(),
      improvement: (record.improvement as string).trim(),
      nextDrill: (record.nextDrill as string).trim(),
      rubricVersion: DROPMIC_RUBRIC_VERSION,
      taskProfileVersion: DROPMIC_TASK_PROFILE_VERSION,
      evaluatorPromptVersion: DROPMIC_EVALUATOR_PROMPT_VERSION,
      rubricScores,
      ...(rubricEvidence ? { rubricEvidence } : {}),
      taskMet,
    };
  }
  return parseLegacyResult(record);
}

type FeedbackDiagnosticField = 'response' | 'output' | RubricCriterionId;
type FeedbackDiagnosticReason = 'invalid_shape' | 'invalid_json' | 'missing_field' | 'unexpected_field' | 'invalid_type' | 'out_of_range' | 'invalid_enum' | 'invalid_evidence' | 'invalid_text' | 'unscorable';

export type FeedbackResponseParseResult =
  | { ok: true; result: QuickReadResult; evidence: QuickReadRubricEvidence }
  | { ok: false; code: 'invalid_model_response_shape' | 'invalid_model_json' | 'invalid_model_schema' | 'unscorable_evaluation'; diagnostics: { field: FeedbackDiagnosticField; reason: FeedbackDiagnosticReason } };

type ChatCompletionPayload = {
  choices?: Array<{ message?: { content?: unknown; refusal?: unknown } }>;
};

function schemaDiagnostic(value: unknown, transcript: string): { field: FeedbackDiagnosticField; reason: FeedbackDiagnosticReason } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { field: 'output', reason: 'invalid_shape' };
  const output = value as Record<string, unknown>;
  if (Object.keys(output).some((key) => key !== 'criteria')) return { field: 'output', reason: 'unexpected_field' };
  if (!output.criteria || typeof output.criteria !== 'object' || Array.isArray(output.criteria)) return { field: 'output', reason: 'invalid_shape' };
  const criteria = output.criteria as Record<string, unknown>;
  const expectedIds = new Set<string>(RUBRIC_CRITERION_IDS);
  if (Object.keys(criteria).some((id) => !expectedIds.has(id))) return { field: 'output', reason: 'unexpected_field' };
  for (const id of RUBRIC_CRITERION_IDS) {
    const candidate = criteria[id];
    if (candidate === undefined) return { field: id, reason: 'missing_field' };
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { field: id, reason: 'invalid_shape' };
    const judgment = candidate as Record<string, unknown>;
    if (Object.keys(judgment).some((key) => !['score', 'evidence', 'rationale', 'reasonCode'].includes(key))) return { field: id, reason: 'unexpected_field' };
    if (!Number.isInteger(judgment.score) || ![-1, 0, 1, 2].includes(judgment.score as number)) return { field: id, reason: 'invalid_type' };
    if (judgment.score === -1) return { field: id, reason: 'unscorable' };
    if (typeof judgment.evidence !== 'string' || !judgment.evidence.trim() || judgment.evidence.length > 180 || !transcript.includes(judgment.evidence)) return { field: id, reason: 'invalid_evidence' };
    if (typeof judgment.rationale !== 'string' || !judgment.rationale.trim() || judgment.rationale.length > 240 || wordCount(judgment.rationale) > 28) return { field: id, reason: 'invalid_text' };
    if (!(RUBRIC_ANCHORS[id].reasons as readonly string[]).includes(String(judgment.reasonCode))) return { field: id, reason: 'invalid_enum' };
    if ((judgment.score === 2) !== (judgment.reasonCode === 'none')) return { field: id, reason: 'invalid_enum' };
  }
  return null;
}

export function parseFeedbackResponse(payload: unknown, transcript: string): FeedbackResponseParseResult {
  const response = payload as ChatCompletionPayload | null;
  const message = response?.choices?.[0]?.message;
  if (!message || typeof message.refusal === 'string' || typeof message.content !== 'string') {
    return { ok: false, code: 'invalid_model_response_shape', diagnostics: { field: 'response', reason: 'invalid_shape' } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    return { ok: false, code: 'invalid_model_json', diagnostics: { field: 'response', reason: 'invalid_json' } };
  }
  const diagnostic = schemaDiagnostic(parsed, transcript);
  if (diagnostic) {
    return {
      ok: false,
      code: diagnostic.reason === 'unscorable' ? 'unscorable_evaluation' : 'invalid_model_schema',
      diagnostics: diagnostic,
    };
  }
  const raw = parsed as { criteria: Record<RubricCriterionId, { score: 0 | 1 | 2; evidence: string; rationale: string; reasonCode: string }> };
  const assessment = raw.criteria as RubricAssessment;
  const summary = summarizeRubric(assessment);
  if (summary.totalPoints === 0) {
    return { ok: false, code: 'unscorable_evaluation', diagnostics: { field: 'output', reason: 'unscorable' } };
  }
  return {
    ok: true,
    result: {
      clarity: summary.dimensionScores.clarity,
      structure: summary.dimensionScores.structure,
      specificity: summary.dimensionScores.specificity,
      concision: summary.dimensionScores.concision,
      strength: summary.strength,
      improvement: summary.improvement,
      nextDrill: summary.nextDrill,
      rubricVersion: summary.rubricVersion,
      taskProfileVersion: DROPMIC_TASK_PROFILE_VERSION,
      evaluatorPromptVersion: DROPMIC_EVALUATOR_PROMPT_VERSION,
      rubricScores: summary.rubricScores,
      taskMet: summary.taskMet,
    },
    evidence: Object.fromEntries(RUBRIC_CRITERION_IDS.map((id) => [id, {
      excerpt: raw.criteria[id].evidence,
      rationale: raw.criteria[id].rationale,
      reasonCode: raw.criteria[id].reasonCode,
    }])) as QuickReadRubricEvidence,
  };
}
