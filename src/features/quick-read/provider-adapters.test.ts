import { describe, expect, it } from '@jest/globals';

import {
  createDeterministicTestAdapters,
  ProviderAdapterError,
} from '../../../supabase/functions/_shared/provider-adapters';

const audio = new Blob(['test-audio'], { type: 'audio/wav' });

describe('R0D-C deterministic provider adapters', () => {
  it('returns the deterministic success contract', async () => {
    const adapters = createDeterministicTestAdapters({
      transcription: 'SUCCESS',
      feedback: 'SUCCESS',
      transientFailures: 0,
    });

    await expect(adapters.transcription.transcribe(audio, 'source.wav')).resolves.toContain('deterministic');
    await expect(adapters.feedback.analyze('transcript')).resolves.toMatchObject({
      clarity: 0.8,
      nextDrill: expect.any(String),
    });
  });

  it('fails once and then succeeds for transient transcription and feedback faults', async () => {
    const adapters = createDeterministicTestAdapters({
      transcription: 'TRANSIENT_ERROR',
      feedback: 'TRANSIENT_ERROR',
      transientFailures: 1,
    });

    await expect(adapters.transcription.transcribe(audio, 'source.wav')).rejects.toMatchObject({
      safeCode: 'transcription_provider_transient',
      transient: true,
    });
    await expect(adapters.transcription.transcribe(audio, 'source.wav')).resolves.toContain('deterministic');
    await expect(adapters.feedback.analyze('transcript')).rejects.toMatchObject({
      safeCode: 'feedback_provider_transient',
      transient: true,
    });
    await expect(adapters.feedback.analyze('transcript')).resolves.toHaveProperty('specificity', 0.6);
  });

  async function expectTranscriptionFault(
    mode: 'PERMANENT_ERROR' | 'TIMEOUT' | 'INVALID_SCHEMA',
    safeCode: string,
    transient: boolean,
  ) {
    const adapters = createDeterministicTestAdapters({
      transcription: mode,
      feedback: 'SUCCESS',
      transientFailures: 0,
    });

    try {
      await adapters.transcription.transcribe(audio, 'source.wav');
      throw new Error('expected provider adapter failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderAdapterError);
      expect(error).toMatchObject({ safeCode, transient });
    }
  }

  it('maps permanent provider failure to a deterministic fail-closed error', () =>
    expectTranscriptionFault('PERMANENT_ERROR', 'transcription_provider_rejected', false));

  it('maps timeout to a deterministic transient error', () =>
    expectTranscriptionFault('TIMEOUT', 'provider_timeout', true));

  it('maps invalid schema to a deterministic fail-closed error', () =>
    expectTranscriptionFault('INVALID_SCHEMA', 'invalid_model_schema', false));

  it('can exhaust exactly two transient retries', async () => {
    const adapters = createDeterministicTestAdapters({
      transcription: 'TRANSIENT_ERROR',
      feedback: 'SUCCESS',
      transientFailures: 3,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(adapters.transcription.transcribe(audio, 'source.wav')).rejects.toMatchObject({ transient: true });
    }
  });
});
