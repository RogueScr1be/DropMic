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
