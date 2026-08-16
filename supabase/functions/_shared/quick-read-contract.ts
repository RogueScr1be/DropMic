export type QuickReadResult = {
  clarity: number;
  structure: number;
  specificity: number;
  concision: number;
  strength: string;
  improvement: string;
  nextDrill: string;
};

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
  },
  required: ['clarity', 'structure', 'specificity', 'concision', 'strength', 'improvement', 'nextDrill'],
} as const;

const resultKeys = ['clarity', 'structure', 'specificity', 'concision', 'strength', 'improvement', 'nextDrill'] as const;

export function parseQuickReadResult(value: unknown): QuickReadResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== resultKeys.length || resultKeys.some((key) => !(key in record))) {
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

  const result = parseQuickReadResult(parsed);
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
