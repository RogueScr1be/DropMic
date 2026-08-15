import type { QuickReadResult } from './quick-read-contract.ts';

export type TranscriptionAdapter = {
  model: string;
  transcribe: (audio: Blob, path: string) => Promise<string>;
};

export type FeedbackAdapter = {
  model: string;
  analyze: (transcript: string) => Promise<QuickReadResult>;
};
