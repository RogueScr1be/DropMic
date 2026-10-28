export type QuickReadResult = {
  clarity: number;
  structure: number;
  specificity: number;
  concision: number;
  strength: string;
  improvement: string;
  nextDrill: string;
  speakerVibe?: SpeakerVibe;
};

export const SPEAKER_VIBES = [
  'The Storyteller',
  'The Straight Shooter',
  'The Debater',
  'The Connector',
  'The Explorer',
  'The Builder',
  'The Analyst',
  'The Spark',
] as const;

export type SpeakerVibe = (typeof SPEAKER_VIBES)[number];

export const quickReadResultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    clarity: { type: 'number', minimum: 0, maximum: 1 },
    structure: { type: 'number', minimum: 0, maximum: 1 },
    specificity: { type: 'number', minimum: 0, maximum: 1 },
    concision: { type: 'number', minimum: 0, maximum: 1 },
    strength: { type: 'string', minLength: 1, maxLength: 1200, description: 'One or two transcript-supported sentences, no more than 24 words total.' },
    improvement: { type: 'string', minLength: 1, maxLength: 1200, description: 'One or two transcript-supported sentences, no more than 24 words total.' },
    nextDrill: { type: 'string', minLength: 1, maxLength: 1200, description: 'One concrete practice action, no more than 28 words, requiring exactly 60 seconds and an observable success condition.' },
    speaker_vibe: { type: 'string', enum: SPEAKER_VIBES },
  },
  required: ['clarity', 'structure', 'specificity', 'concision', 'strength', 'improvement', 'nextDrill', 'speaker_vibe'],
} as const;

const clientResultKeys = ['clarity', 'structure', 'specificity', 'concision', 'strength', 'improvement', 'nextDrill'] as const;

function isSpeakerVibe(value: unknown): value is SpeakerVibe {
  return typeof value === 'string' && (SPEAKER_VIBES as readonly string[]).includes(value);
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

function isValidScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isSixtySecondDrill(value: string) {
  return /\b60(?:-second|\s+seconds?)\b/iu.test(value);
}

function parseResultFields(record: Record<string, unknown>, speakerVibe: unknown, requireSpeakerVibe: boolean) {
  const allowedKeys = requireSpeakerVibe
    ? [...clientResultKeys, 'speaker_vibe']
    : [...clientResultKeys, 'speakerVibe'];
  const keys = Object.keys(record);
  if (keys.some((key) => !allowedKeys.includes(key)) || clientResultKeys.some((key) => !(key in record))) {
    return null;
  }
  if (requireSpeakerVibe && !('speaker_vibe' in record)) {
    return null;
  }

  if (requireSpeakerVibe ? !isSpeakerVibe(speakerVibe) : speakerVibe !== undefined && !isSpeakerVibe(speakerVibe)) {
    return null;
  }

  const scores = ['clarity', 'structure', 'specificity', 'concision'] as const;
  for (const key of scores) {
    const score = record[key];
    if (!isValidScore(score)) {
      return null;
    }
  }

  for (const key of ['strength', 'improvement', 'nextDrill'] as const) {
    const text = record[key];
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > 1200) {
      return null;
    }
  }

  if (requireSpeakerVibe) {
    const strength = (record.strength as string).trim();
    const improvement = (record.improvement as string).trim();
    const nextDrill = (record.nextDrill as string).trim();
    if (
      wordCount(strength) > 24
      || wordCount(improvement) > 24
      || wordCount(nextDrill) > 28
      || !isSixtySecondDrill(nextDrill)
    ) {
      return null;
    }
  }

  return {
    clarity: record.clarity as number,
    structure: record.structure as number,
    specificity: record.specificity as number,
    concision: record.concision as number,
    strength: (record.strength as string).trim(),
    improvement: (record.improvement as string).trim(),
    nextDrill: (record.nextDrill as string).trim(),
    ...(isSpeakerVibe(speakerVibe) ? { speakerVibe } : {}),
  } satisfies QuickReadResult;
}

export function parseQuickReadResult(value: unknown): QuickReadResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return parseResultFields(record, record.speakerVibe, false);
}

function parseProviderQuickReadResult(value: unknown): QuickReadResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return parseResultFields(record, record.speaker_vibe, true);
}

type FeedbackDiagnosticField = 'response' | 'output' | 'clarity' | 'structure' | 'specificity' | 'concision' | 'strength' | 'improvement' | 'nextDrill' | 'speaker_vibe';
type FeedbackDiagnosticReason = 'invalid_shape' | 'invalid_json' | 'missing_field' | 'unexpected_field' | 'invalid_type' | 'out_of_range' | 'invalid_enum' | 'invalid_text' | 'word_limit' | 'duration_required';

export type FeedbackResponseParseResult =
  | { ok: true; result: QuickReadResult }
  | {
      ok: false;
      code: 'invalid_model_response_shape' | 'invalid_model_json' | 'invalid_model_schema';
      diagnostics: { field: FeedbackDiagnosticField; reason: FeedbackDiagnosticReason };
    };

type ChatCompletionPayload = {
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown; refusal?: unknown };
  }>;
};

function schemaDiagnostic(value: unknown): { field: FeedbackDiagnosticField; reason: FeedbackDiagnosticReason } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { field: 'output', reason: 'invalid_shape' };
  }

  const record = value as Record<string, unknown>;
  const requiredFields = ['clarity', 'structure', 'specificity', 'concision', 'strength', 'improvement', 'nextDrill', 'speaker_vibe'] as const;
  const allowedFields = new Set<string>(requiredFields);

  if (Object.keys(record).some((key) => !allowedFields.has(key))) {
    return { field: 'output', reason: 'unexpected_field' };
  }

  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      return { field, reason: 'missing_field' };
    }
  }

  for (const field of ['clarity', 'structure', 'specificity', 'concision'] as const) {
    const score = record[field];
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return { field, reason: 'invalid_type' };
    }
    if (score < 0 || score > 1) {
      return { field, reason: 'out_of_range' };
    }
  }

  if (!isSpeakerVibe(record.speaker_vibe)) {
    return { field: 'speaker_vibe', reason: 'invalid_enum' };
  }

  for (const field of ['strength', 'improvement', 'nextDrill'] as const) {
    const text = record[field];
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > 1200) {
      return { field, reason: 'invalid_text' };
    }
  }

  if (wordCount((record.strength as string).trim()) > 24) {
    return { field: 'strength', reason: 'word_limit' };
  }
  if (wordCount((record.improvement as string).trim()) > 24) {
    return { field: 'improvement', reason: 'word_limit' };
  }
  if (wordCount((record.nextDrill as string).trim()) > 28) {
    return { field: 'nextDrill', reason: 'word_limit' };
  }
  if (!isSixtySecondDrill((record.nextDrill as string).trim())) {
    return { field: 'nextDrill', reason: 'duration_required' };
  }

  return null;
}

export function parseFeedbackResponse(payload: unknown): FeedbackResponseParseResult {
  const response = payload as ChatCompletionPayload | null;
  const choice = response?.choices?.[0];
  const message = choice?.message;

  if (!message || typeof message.refusal === 'string' || typeof message.content !== 'string') {
    return {
      ok: false,
      code: 'invalid_model_response_shape',
      diagnostics: { field: 'response', reason: 'invalid_shape' },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    return {
      ok: false,
      code: 'invalid_model_json',
      diagnostics: { field: 'response', reason: 'invalid_json' },
    };
  }

  const diagnostic = schemaDiagnostic(parsed);
  if (diagnostic) {
    return { ok: false, code: 'invalid_model_schema', diagnostics: diagnostic };
  }

  const result = parseProviderQuickReadResult(parsed);
  if (!result) {
    return {
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: { field: 'output', reason: 'invalid_shape' },
    };
  }

  return { ok: true, result };
}
