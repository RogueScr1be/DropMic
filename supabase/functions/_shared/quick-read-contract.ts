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
    strength: { type: 'string', minLength: 1, maxLength: 1200 },
    improvement: { type: 'string', minLength: 1, maxLength: 1200 },
    nextDrill: { type: 'string', minLength: 1, maxLength: 1200 },
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

function isSingleSentence(value: string) {
  return (value.match(/[.!?](?=\s|$)/gu) ?? []).length === 1;
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
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
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
      wordCount(strength) > 20
      || wordCount(improvement) > 20
      || !isSingleSentence(strength)
      || !isSingleSentence(improvement)
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

export type FeedbackResponseParseResult =
  | { ok: true; result: QuickReadResult }
  | {
      ok: false;
      code: 'invalid_model_response_shape';
      diagnostics: {
        finishReason: string | null;
        messagePresent: boolean;
        contentType: string;
        contentLength: number | null;
        refusalPresent: boolean;
      };
    }
  | {
      ok: false;
      code: 'invalid_model_json';
      diagnostics: { contentLength: number };
    }
  | {
      ok: false;
      code: 'invalid_model_schema';
      diagnostics: { keys: string[] };
    };

type ChatCompletionPayload = {
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown; refusal?: unknown };
  }>;
};

function asFinishReason(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export function parseFeedbackResponse(payload: unknown): FeedbackResponseParseResult {
  const response = payload as ChatCompletionPayload | null;
  const choice = response?.choices?.[0];
  const message = choice?.message;

  if (!message || typeof message.refusal === 'string' || typeof message.content !== 'string') {
    return {
      ok: false,
      code: 'invalid_model_response_shape',
      diagnostics: {
        finishReason: asFinishReason(choice?.finish_reason),
        messagePresent: Boolean(message),
        contentType: typeof message?.content,
        contentLength: typeof message?.content === 'string' ? message.content.length : null,
        refusalPresent: typeof message?.refusal === 'string',
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content);
  } catch {
    return {
      ok: false,
      code: 'invalid_model_json',
      diagnostics: { contentLength: message.content.length },
    };
  }

  const result = parseProviderQuickReadResult(parsed);
  if (!result) {
    return {
      ok: false,
      code: 'invalid_model_schema',
      diagnostics: {
        keys: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : [],
      },
    };
  }

  return { ok: true, result };
}
