import type { QuickReadResult, QuickReadRubricEvidence } from './quick-read-contract.ts';
import type { QuickReadScoringContext } from './quick-read-prompt.ts';

export type QuickReadAnalysis = {
  result: QuickReadResult;
  evidence?: QuickReadRubricEvidence;
};

export type TestFaultMode =
  | 'SUCCESS'
  | 'TRANSIENT_ERROR'
  | 'PERMANENT_ERROR'
  | 'TIMEOUT'
  | 'INVALID_SCHEMA';

export class ProviderAdapterError extends Error {
  transient: boolean;
  safeCode: string;

  constructor(safeCode: string, transient: boolean) {
    super(safeCode);
    this.name = 'ProviderAdapterError';
    this.safeCode = safeCode;
    this.transient = transient;
  }
}

export type TranscriptionAdapter = {
  model: string;
  transcribe: (audio: Blob, path: string) => Promise<string>;
};

export type FeedbackAdapter = {
  model: string;
  analyze: (transcript: string, context: QuickReadScoringContext) => Promise<QuickReadAnalysis>;
};

export function createDeterministicTestAdapters(config: {
  transcription: TestFaultMode;
  feedback: TestFaultMode;
  transientFailures: number;
}) {
  let transcriptionFailuresRemaining = config.transientFailures;
  let feedbackFailuresRemaining = config.transientFailures;

  const fault = (stage: 'transcription' | 'feedback', mode: TestFaultMode) => {
    if (mode === 'SUCCESS') {
      return;
    }
    if (mode === 'TRANSIENT_ERROR') {
      const remaining = stage === 'transcription'
        ? transcriptionFailuresRemaining
        : feedbackFailuresRemaining;
      if (remaining > 0) {
        if (stage === 'transcription') transcriptionFailuresRemaining -= 1;
        else feedbackFailuresRemaining -= 1;
        throw new ProviderAdapterError(`${stage}_provider_transient`, true);
      }
      return;
    }
    if (mode === 'TIMEOUT') {
      throw new ProviderAdapterError('provider_timeout', true);
    }
    if (mode === 'INVALID_SCHEMA') {
      throw new ProviderAdapterError('invalid_model_schema', false);
    }
    throw new ProviderAdapterError(`${stage}_provider_rejected`, false);
  };

  return {
    transcription: {
      model: 'r0d-c-test-transcription',
      transcribe: (_audio: Blob, _path: string) => Promise.resolve().then(() => {
        fault('transcription', config.transcription);
        return 'This is a deterministic lifecycle test transcript.';
      }),
    } satisfies TranscriptionAdapter,
    feedback: {
      model: 'r0d-c-test-feedback',
      analyze: (_transcript: string, _context: QuickReadScoringContext) => Promise.resolve().then(() => {
        fault('feedback', config.feedback);
        return { result: {
          clarity: 0.8,
          structure: 0.7,
          specificity: 0.6,
          concision: 0.9,
          strength: 'You open with a clear point.',
          improvement: 'You can add one concrete example.',
          nextDrill: 'You can answer again with one example and a closing sentence for exactly 60 seconds.',
        } satisfies QuickReadResult };
      }),
    } satisfies FeedbackAdapter,
  };
}
