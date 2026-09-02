// @ts-expect-error Deno requires explicit extensions for local function imports.
import { resolvePlusAccess, type PlusAccessDecision } from './entitlement.ts';

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const SCORE_KEYS = ['clarity', 'structure', 'specificity', 'concision'] as const;
const SUPPORTING_METRIC_KEYS = ['wordCount', 'wordsPerMinute', 'fillerWordCount'] as const;

type ScoreKey = (typeof SCORE_KEYS)[number];
type SupportingMetricKey = (typeof SUPPORTING_METRIC_KEYS)[number];

export type TakeTwoRun = {
  id: string;
  attemptId: string;
  promptId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
};

export type TakeTwoResult = {
  runId: string;
  attemptId: string;
  clarity: unknown;
  structure: unknown;
  specificity: unknown;
  concision: unknown;
};

export type TakeTwoMetrics = {
  attemptId: string;
  clarity: unknown;
  structure: unknown;
  specificity: unknown;
  concision: unknown;
  wordCount: unknown;
  wordsPerMinute: unknown;
  fillerWordCount: unknown;
};

export type TakeTwoRepository = {
  getEntitlement(ownerId: string): Promise<unknown | null>;
  getRuns(ownerId: string, runIds: string[]): Promise<TakeTwoRun[]>;
  getResults(ownerId: string, runIds: string[]): Promise<TakeTwoResult[]>;
  getMetrics(ownerId: string, attemptIds: string[]): Promise<TakeTwoMetrics[]>;
};

export type TakeTwoIdentity = {
  userId: string;
  isAnonymous: boolean;
};

export type TakeTwoDependencies = {
  authenticate(token: string): Promise<TakeTwoIdentity | null>;
  repository: TakeTwoRepository;
};

type TakeTwoComparison = {
  baseline: TakeTwoSnapshot;
  followUp: TakeTwoSnapshot;
  deltas: {
    scores: Record<ScoreKey, number>;
    metrics: Record<SupportingMetricKey, number>;
  };
};

type TakeTwoSnapshot = {
  runId: string;
  attemptId: string;
  createdAt: string;
  scores: Record<ScoreKey, number>;
  metrics: Record<SupportingMetricKey, number>;
};

type TakeTwoOutcome =
  | { status: 200; body: { status: 'completed'; comparison: TakeTwoComparison } }
  | { status: 400; body: { error: 'invalid_request' | 'owner_id_not_allowed' | 'same_run' } }
  | { status: 401; body: { error: 'authentication_required' } }
  | { status: 403; body: { error: 'permanent_account_required' | 'plus_required' } }
  | { status: 404; body: { error: 'take_two_not_found' } }
  | { status: 409; body: { error: 'different_prompt' | 'run_not_completed' } }
  | { status: 422; body: { status: 'comparison_unavailable'; error: 'comparison_unavailable' } };

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function unavailable(): TakeTwoOutcome {
  return {
    status: 422,
    body: { status: 'comparison_unavailable', error: 'comparison_unavailable' },
  };
}

function parseRunId(value: unknown) {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

function finiteNumber(value: unknown, minimum: number, maximum?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    return null;
  }
  if (maximum !== undefined && value > maximum) {
    return null;
  }
  return value;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function roundDelta(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sortRuns(left: TakeTwoRun, right: TakeTwoRun) {
  const byCreation = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  return byCreation || left.id.localeCompare(right.id);
}

function normalizeSnapshot(
  run: TakeTwoRun,
  result: TakeTwoResult | undefined,
  metrics: TakeTwoMetrics | undefined,
): TakeTwoSnapshot | null {
  if (
    !validTimestamp(run.createdAt) ||
    run.completedAt === null ||
    !validTimestamp(run.completedAt) ||
    !result ||
    !metrics ||
    result.runId !== run.id ||
    result.attemptId !== run.attemptId ||
    metrics.attemptId !== run.attemptId
  ) {
    return null;
  }

  const scores = {
    clarity: finiteNumber(result.clarity, 0, 1),
    structure: finiteNumber(result.structure, 0, 1),
    specificity: finiteNumber(result.specificity, 0, 1),
    concision: finiteNumber(result.concision, 0, 1),
  };
  const metricScores = {
    clarity: finiteNumber(metrics.clarity, 0, 1),
    structure: finiteNumber(metrics.structure, 0, 1),
    specificity: finiteNumber(metrics.specificity, 0, 1),
    concision: finiteNumber(metrics.concision, 0, 1),
  };
  const supportingMetrics = {
    wordCount: nonNegativeInteger(metrics.wordCount),
    wordsPerMinute: finiteNumber(metrics.wordsPerMinute, 0),
    fillerWordCount: nonNegativeInteger(metrics.fillerWordCount),
  };

  if (
    Object.values(scores).some((value) => value === null) ||
    Object.values(metricScores).some((value) => value === null) ||
    Object.values(supportingMetrics).some((value) => value === null) ||
    SCORE_KEYS.some((key) => scores[key] !== metricScores[key])
  ) {
    return null;
  }

  return {
    runId: run.id,
    attemptId: run.attemptId,
    createdAt: run.createdAt,
    scores: scores as Record<ScoreKey, number>,
    metrics: supportingMetrics as Record<SupportingMetricKey, number>,
  };
}

export function buildTakeTwoComparison(
  runs: TakeTwoRun[],
  results: TakeTwoResult[],
  metrics: TakeTwoMetrics[],
): TakeTwoComparison | TakeTwoOutcome {
  if (runs.length !== 2) {
    return { status: 404, body: { error: 'take_two_not_found' } };
  }
  if (runs.some((run) => run.status !== 'completed')) {
    return { status: 409, body: { error: 'run_not_completed' } };
  }
  if (runs.some((run) => typeof run.promptId !== 'string' || run.promptId.trim() === '')) {
    return unavailable();
  }
  if (runs[0].promptId !== runs[1].promptId) {
    return { status: 409, body: { error: 'different_prompt' } };
  }

  const orderedRuns = [...runs].sort(sortRuns);
  const snapshots = orderedRuns.map((run) => normalizeSnapshot(
    run,
    results.find((result) => result.runId === run.id),
    metrics.find((metric) => metric.attemptId === run.attemptId),
  ));
  if (snapshots.some((snapshot) => snapshot === null)) {
    return unavailable();
  }

  const [baseline, followUp] = snapshots as [TakeTwoSnapshot, TakeTwoSnapshot];
  const scoreDeltas = Object.fromEntries(SCORE_KEYS.map((key) => [
    key,
    roundDelta(followUp.scores[key] - baseline.scores[key]),
  ])) as Record<ScoreKey, number>;
  const metricDeltas = Object.fromEntries(SUPPORTING_METRIC_KEYS.map((key) => [
    key,
    roundDelta(followUp.metrics[key] - baseline.metrics[key]),
  ])) as Record<SupportingMetricKey, number>;

  return { baseline, followUp, deltas: { scores: scoreDeltas, metrics: metricDeltas } };
}

async function authorizeAndCompare(
  ownerId: string,
  payload: unknown,
  repository: TakeTwoRepository,
): Promise<TakeTwoOutcome> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 400, body: { error: 'invalid_request' } };
  }
  const body = payload as Record<string, unknown>;
  if ('owner_id' in body) {
    return { status: 400, body: { error: 'owner_id_not_allowed' } };
  }

  const firstRunId = parseRunId(body.firstRunId);
  const secondRunId = parseRunId(body.secondRunId);
  if (!firstRunId || !secondRunId) {
    return { status: 400, body: { error: 'invalid_request' } };
  }
  if (firstRunId === secondRunId) {
    return { status: 400, body: { error: 'same_run' } };
  }

  const entitlement = await repository.getEntitlement(ownerId);
  const access: PlusAccessDecision = resolvePlusAccess(entitlement);
  if (!access.allowed) {
    return { status: 403, body: { error: 'plus_required' } };
  }

  const runIds = [firstRunId, secondRunId];
  const runs = await repository.getRuns(ownerId, runIds);
  if (runs.length !== 2 || new Set(runs.map((run) => run.id)).size !== 2) {
    return { status: 404, body: { error: 'take_two_not_found' } };
  }

  const comparison = buildTakeTwoComparison(
    runs,
    await repository.getResults(ownerId, runIds),
    await repository.getMetrics(ownerId, runs.map((run) => run.attemptId)),
  );
  if ('status' in comparison) {
    return comparison;
  }
  return { status: 200, body: { status: 'completed', comparison } };
}

export async function handleTakeTwoRequest(
  request: Request,
  dependencies: TakeTwoDependencies,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return json({ error: 'authentication_required' }, 401);
  }

  const identity = await dependencies.authenticate(token);
  if (!identity) {
    return json({ error: 'authentication_required' }, 401);
  }
  if (identity.isAnonymous) {
    return json({ error: 'permanent_account_required' }, 403);
  }

  const payload = await request.json().catch(() => null);
  if (payload === null) {
    return json({ error: 'invalid_request' }, 400);
  }

  try {
    const outcome = await authorizeAndCompare(identity.userId, payload, dependencies.repository);
    return json(outcome.body, outcome.status);
  } catch {
    return json({ error: 'take_two_unavailable' }, 500);
  }
}
