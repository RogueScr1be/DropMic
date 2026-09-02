import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';
import type { TakeTwoComparison } from '../../../supabase/functions/_shared/take-two';

const SCORE_KEYS = ['clarity', 'structure', 'specificity', 'concision'] as const;
const METRIC_KEYS = ['wordCount', 'wordsPerMinute', 'fillerWordCount'] as const;

export class TakeTwoServiceError extends Error {
  code: string;

  constructor(message: string, code = 'take_two_unavailable') {
    super(message);
    this.name = 'TakeTwoServiceError';
    this.code = code;
  }
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new TakeTwoServiceError('Take Two is not configured yet.', 'not_configured');
  }
  return supabase;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validSnapshot(value: unknown): value is TakeTwoComparison['baseline'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const snapshot = value as Record<string, unknown>;
  if (
    typeof snapshot.runId !== 'string' ||
    typeof snapshot.attemptId !== 'string' ||
    typeof snapshot.createdAt !== 'string' ||
    !snapshot.scores || typeof snapshot.scores !== 'object' ||
    !snapshot.metrics || typeof snapshot.metrics !== 'object'
  ) {
    return false;
  }
  const scores = snapshot.scores as Record<string, unknown>;
  const metrics = snapshot.metrics as Record<string, unknown>;
  return SCORE_KEYS.every((key) => isFiniteNumber(scores[key])) &&
    METRIC_KEYS.every((key) => isFiniteNumber(metrics[key]));
}

export function parseTakeTwoComparison(value: unknown): TakeTwoComparison | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const comparison = value as Record<string, unknown>;
  if (!validSnapshot(comparison.baseline) || !validSnapshot(comparison.followUp)) {
    return null;
  }
  if (!comparison.deltas || typeof comparison.deltas !== 'object' || Array.isArray(comparison.deltas)) {
    return null;
  }
  const deltas = comparison.deltas as Record<string, unknown>;
  if (!deltas.scores || typeof deltas.scores !== 'object' || !deltas.metrics || typeof deltas.metrics !== 'object') {
    return null;
  }
  const scoreDeltas = deltas.scores as Record<string, unknown>;
  const metricDeltas = deltas.metrics as Record<string, unknown>;
  if (!SCORE_KEYS.every((key) => isFiniteNumber(scoreDeltas[key])) || !METRIC_KEYS.every((key) => isFiniteNumber(metricDeltas[key]))) {
    return null;
  }
  return comparison as TakeTwoComparison;
}

function comparisonError(code: string | undefined) {
  if (code === 'authentication_required' || code === 'permanent_account_required' || code === 'plus_required') {
    return new TakeTwoServiceError('Take Two is not available for this session.', 'take_two_denied');
  }
  if (code === 'comparison_unavailable') {
    return new TakeTwoServiceError('This comparison is not available yet.', 'comparison_unavailable');
  }
  return new TakeTwoServiceError('Take Two could not finish. Your Quick Read is saved.', 'take_two_unavailable');
}

export async function compareTakeTwo(input: {
  baselineRunId: string;
  followUpRunId: string;
}): Promise<TakeTwoComparison> {
  const client = requireClient();
  const sessionResult = await client.auth.getSession();
  if (sessionResult.error || !sessionResult.data.session?.user || sessionResult.data.session.user.is_anonymous) {
    throw comparisonError('authentication_required');
  }

  const invocation = await client.functions.invoke('take-two', {
    body: {
      firstRunId: input.baselineRunId,
      secondRunId: input.followUpRunId,
    },
  });
  const payload = invocation.data as { status?: unknown; comparison?: unknown; error?: unknown } | null;
  if (invocation.error && !payload) {
    throw comparisonError(undefined);
  }
  if (payload?.status !== 'completed') {
    throw comparisonError(typeof payload?.error === 'string' ? payload.error : undefined);
  }
  const comparison = parseTakeTwoComparison(payload.comparison);
  if (!comparison) {
    throw comparisonError('comparison_unavailable');
  }
  return comparison;
}
