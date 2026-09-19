type QuickReadResult = {
  clarity: number;
  structure: number;
  specificity: number;
  concision: number;
  strength: string;
  improvement: string;
  nextDrill: string;
  speakerVibe: 'The Storyteller' | 'The Straight Shooter' | 'The Debater' | 'The Connector' | 'The Explorer' | 'The Builder' | 'The Analyst' | 'The Spark';
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
  analyze: (transcript: string) => Promise<QuickReadResult>;
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
      transcribe: async (_audio: Blob, _path: string) => {
        fault('transcription', config.transcription);
        return 'This is a deterministic lifecycle test transcript.';
      },
    } satisfies TranscriptionAdapter,
    feedback: {
      model: 'r0d-c-test-feedback',
      analyze: async (_transcript: string) => {
        fault('feedback', config.feedback);
        return {
          clarity: 0.8,
          structure: 0.7,
          specificity: 0.6,
          concision: 0.9,
          strength: 'You open with a clear point.',
          improvement: 'You can add one concrete example.',
          nextDrill: 'You can answer again with one example and a closing sentence for exactly 60 seconds.',
          speakerVibe: 'The Storyteller',
        } satisfies QuickReadResult;
      },
    } satisfies FeedbackAdapter,
  };
}
