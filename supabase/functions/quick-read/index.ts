import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

import {
  parseFeedbackResponse,
  quickReadResultSchema,
  type QuickReadResult,
} from '../_shared/quick-read-contract.ts';
import {
  buildFeedbackUserPrompt,
  FEEDBACK_SYSTEM_PROMPT,
} from '../_shared/quick-read-prompt.ts';
import {
  createDeterministicTestAdapters,
  ProviderAdapterError,
  type FeedbackAdapter,
  type TestFaultMode,
  type TranscriptionAdapter,
} from '../_shared/provider-adapters.ts';
import { nextProviderRetryCount } from '../_shared/retry-policy.ts';
import {
  deletionConfirmed,
  verifyStorageDeletion,
  type StorageDeletionResult,
} from '../_shared/storage-deletion.ts';

const AUDIO_BUCKET = 'quick-read-audio';
const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const FEEDBACK_MODEL = 'gpt-5-nano';
const ANALYSIS_VERSION = 'r0d-b.1';
const PROVIDER_TIMEOUT_MS = 45_000;

type AnalysisRun = {
  id: string;
  attempt_id: string;
  owner_id: string;
  status: string;
  retry_count: number;
  audio_object_path: string;
  audio_expires_at: string;
  transcript_expires_at: string;
  safe_error_code: string | null;
  audio_cleanup_status: 'pending' | 'deleted' | 'failed';
  audio_cleanup_attempts: number;
};

class CleanupError extends Error {
  constructor() {
    super('audio_cleanup_failed');
    this.name = 'CleanupError';
  }
}

class LifecycleError extends Error {
  safeCode: string;

  constructor(safeCode: string) {
    super(safeCode);
    this.name = 'LifecycleError';
    this.safeCode = safeCode;
  }
}

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

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function isTransientHttpStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ProviderAdapterError('provider_timeout', true);
    }
    throw new ProviderAdapterError('provider_transport', true);
  } finally {
    clearTimeout(timeout);
  }
}

function mimeTypeForExtension(extension: string) {
  switch (extension) {
    case 'm4a':
      return 'audio/x-m4a';
    case 'mp4':
      return 'audio/mp4';
    case 'webm':
      return 'audio/webm';
    case 'ogg':
      return 'audio/ogg';
    default:
      return 'audio/wav';
  }
}

function extensionForPath(path: string) {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (!extension || !['m4a', 'mp4', 'webm', 'wav', 'ogg'].includes(extension)) {
    throw new ProviderAdapterError('unsupported_audio', false);
  }
  return extension;
}

async function transcribeAudio(audio: Blob, path: string, apiKey: string) {
  const extension = extensionForPath(path);
  const form = new FormData();
  form.append(
    'file',
    new File([audio], `source.${extension}`, { type: mimeTypeForExtension(extension) }),
  );
  form.append('model', TRANSCRIPTION_MODEL);
  form.append('response_format', 'json');
  form.append('language', 'en');

  const response = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    throw new ProviderAdapterError(
      isTransientHttpStatus(response.status) ? 'transcription_provider_transient' : 'transcription_provider_rejected',
      isTransientHttpStatus(response.status),
    );
  }

  const payload = await response.json().catch(() => null) as { text?: unknown } | null;
  if (!payload || typeof payload.text !== 'string' || payload.text.trim().length === 0) {
    throw new ProviderAdapterError('invalid_transcription_response', false);
  }
  if (payload.text.length > 200_000) {
    throw new ProviderAdapterError('transcript_too_large', false);
  }
  return payload.text.trim();
}

async function analyzeTranscript(transcript: string, apiKey: string): Promise<QuickReadResult> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FEEDBACK_MODEL,
      messages: [
        {
          role: 'system',
          content: FEEDBACK_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildFeedbackUserPrompt(transcript),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'micdrop_quick_read',
          strict: true,
          schema: quickReadResultSchema,
        },
      },
      reasoning_effort: 'low',
      max_completion_tokens: 1200,
    }),
  });
  if (!response.ok) {
    throw new ProviderAdapterError(
      isTransientHttpStatus(response.status) ? 'feedback_provider_transient' : 'feedback_provider_rejected',
      isTransientHttpStatus(response.status),
    );
  }

  const payload = await response.json().catch(() => null);
  const parsed = parseFeedbackResponse(payload);
  if (!parsed.ok) {
    console.warn('feedback_response_rejected', {
      code: parsed.code,
      ...parsed.diagnostics,
    });
    throw new ProviderAdapterError(parsed.code, false);
  }
  return parsed.result;
}

function countWords(transcript: string) {
  return transcript.trim() ? transcript.trim().split(/\s+/u).length : 0;
}

function countFillerWords(transcript: string) {
  const matches = transcript.match(/\b(um|uh|like|you know|so)\b/giu);
  return matches?.length ?? 0;
}

async function getRun(admin: SupabaseClient, runId: string, ownerId: string) {
  const { data, error } = await admin
    .from('analysis_runs')
    .select('id,attempt_id,owner_id,status,retry_count,audio_object_path,audio_expires_at,transcript_expires_at,safe_error_code,audio_cleanup_status,audio_cleanup_attempts')
    .eq('id', runId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) {
    throw new LifecycleError('run_lookup_failed');
  }
  return data as AnalysisRun | null;
}

async function getResult(admin: SupabaseClient, runId: string, ownerId: string) {
  const { data, error } = await admin
    .from('analysis_results')
    .select('clarity,structure,specificity,concision,strength,improvement,next_drill')
    .eq('run_id', runId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) {
    throw new LifecycleError('result_lookup_failed');
  }
  if (!data) {
    return null;
  }
  return {
    clarity: data.clarity,
    structure: data.structure,
    specificity: data.specificity,
    concision: data.concision,
    strength: data.strength,
    improvement: data.improvement,
    nextDrill: data.next_drill,
  } satisfies QuickReadResult;
}

async function updateRun(admin: SupabaseClient, runId: string, updates: Record<string, unknown>) {
  const { error } = await admin.from('analysis_runs').update(updates).eq('id', runId);
  if (error) {
    throw new LifecycleError('run_update_failed');
  }
}

async function deleteAudio(admin: SupabaseClient, path: string): Promise<StorageDeletionResult> {
  return verifyStorageDeletion(admin.storage.from(AUDIO_BUCKET), [path]);
}

async function recordProviderAttempt(admin: SupabaseClient, runId: string, stage: 'transcription' | 'feedback') {
  const { error } = await admin.rpc('record_analysis_provider_attempt', {
    p_run_id: runId,
    p_stage: stage,
  });
  if (error) {
    throw new LifecycleError('provider_attempt_record_failed');
  }
}

async function cleanupAudio(admin: SupabaseClient, run: AnalysisRun) {
  const attempts = run.audio_cleanup_attempts;
  try {
    const deletion = await deleteAudio(admin, run.audio_object_path);
    if (!deletionConfirmed(deletion)) {
      throw new CleanupError();
    }
    await updateRun(admin, run.id, {
      audio_cleanup_status: 'deleted',
      audio_cleanup_last_error: null,
      audio_cleanup_last_error_at: null,
      audio_deleted_at: new Date().toISOString(),
    });
    return true;
  } catch {
    await updateRun(admin, run.id, {
      audio_cleanup_status: 'failed',
      audio_cleanup_attempts: attempts + 1,
      audio_cleanup_last_error: 'audio_cleanup_failed',
      audio_cleanup_last_error_at: new Date().toISOString(),
      safe_error_code: 'audio_cleanup_failed',
    });
    return false;
  }
}

async function finishStoredResult(
  admin: SupabaseClient,
  run: AnalysisRun,
  ownerId: string,
  result: QuickReadResult,
) {
  if (!await cleanupAudio(admin, run)) {
    return json({ status: 'failed', error: 'audio_cleanup_failed' }, 503);
  }
  if (run.status !== 'completed') {
    await updateRun(admin, run.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      safe_error_code: null,
      audio_cleanup_status: 'deleted',
    });
  } else {
    await updateRun(admin, run.id, { safe_error_code: null, audio_cleanup_status: 'deleted' });
  }
  return json({ status: 'completed', result });
}

async function processRun(
  admin: SupabaseClient,
  run: AnalysisRun,
  ownerId: string,
  transcriptionAdapter: TranscriptionAdapter,
  feedbackAdapter: FeedbackAdapter,
) {
  const existingResult = await getResult(admin, run.id, ownerId);
  if (existingResult) {
    return finishStoredResult(admin, run, ownerId, existingResult);
  }

  const { data: attempt, error: attemptError } = await admin
    .from('attempts')
    .select('id,owner_id,completed_duration_seconds')
    .eq('id', run.attempt_id)
    .eq('owner_id', ownerId)
    .single();
  if (attemptError || !attempt) {
    await updateRun(admin, run.id, { status: 'failed', safe_error_code: 'owned_attempt_required' });
    return json({ status: 'failed', error: 'owned_attempt_required' }, 403);
  }

  let retryCount = run.retry_count;
  let transcript: string | null = null;
  for (;;) {
    try {
      const { data: storedTranscript, error: transcriptLookupError } = await admin
        .from('analysis_transcripts')
        .select('transcript')
        .eq('run_id', run.id)
        .maybeSingle();
      if (transcriptLookupError) {
        throw new LifecycleError('transcript_lookup_failed');
      }
      transcript = storedTranscript?.transcript ?? null;

      if (!transcript) {
        await updateRun(admin, run.id, {
          status: 'transcribing',
          transcription_model_version: transcriptionAdapter.model,
        });
        const { data: audio, error: audioError } = await admin.storage
          .from(AUDIO_BUCKET)
          .download(run.audio_object_path);
        if (audioError || !audio) {
          throw new ProviderAdapterError('audio_unavailable', false);
        }
        await recordProviderAttempt(admin, run.id, 'transcription');
        transcript = await transcriptionAdapter.transcribe(audio, run.audio_object_path);
        const { error: transcriptWriteError } = await admin.from('analysis_transcripts').upsert({
          run_id: run.id,
          attempt_id: run.attempt_id,
          owner_id: ownerId,
          transcript,
          transcript_expires_at: run.transcript_expires_at,
        }, { onConflict: 'run_id' });
        if (transcriptWriteError) {
          throw new LifecycleError('transcript_write_failed');
        }
      }

      await updateRun(admin, run.id, {
        status: 'analyzing',
        feedback_model_version: feedbackAdapter.model,
      });
      await recordProviderAttempt(admin, run.id, 'feedback');
      const result = await feedbackAdapter.analyze(transcript);
      const wordCount = countWords(transcript);
      const { error: resultWriteError } = await admin.from('analysis_results').upsert({
        run_id: run.id,
        attempt_id: run.attempt_id,
        owner_id: ownerId,
        clarity: result.clarity,
        structure: result.structure,
        specificity: result.specificity,
        concision: result.concision,
        strength: result.strength,
        improvement: result.improvement,
        next_drill: result.nextDrill,
        word_count: wordCount,
        metric_schema_version: 'r0d.1',
        analysis_version: ANALYSIS_VERSION,
      }, { onConflict: 'run_id' });
      if (resultWriteError) {
        throw new LifecycleError('result_write_failed');
      }

      const minutes = Math.max(1 / 60, attempt.completed_duration_seconds / 60);
      const { error: metricError } = await admin.from('attempt_metrics').update({
        clarity: result.clarity,
        structure: result.structure,
        specificity: result.specificity,
        concision: result.concision,
        word_count: wordCount,
        words_per_minute: Math.round((wordCount / minutes) * 100) / 100,
        filler_word_count: countFillerWords(transcript),
        analysis_completed: true,
        analysis_version: ANALYSIS_VERSION,
        derived_metrics: { analysis_version: ANALYSIS_VERSION },
      }).eq('attempt_id', run.attempt_id).eq('user_id', ownerId);
      if (metricError) {
        throw new LifecycleError('metrics_write_failed');
      }

      if (!await cleanupAudio(admin, { ...run, audio_cleanup_status: 'pending' })) {
        await updateRun(admin, run.id, { status: 'failed', safe_error_code: 'audio_cleanup_failed' });
        return json({ status: 'failed', error: 'audio_cleanup_failed' }, 503);
      }

      await updateRun(admin, run.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        retry_count: retryCount,
        safe_error_code: null,
        audio_cleanup_status: 'deleted',
      });
      return json({ status: 'completed', result });
    } catch (error) {
      const providerError = error instanceof ProviderAdapterError ? error : null;
      const lifecycleError = error instanceof LifecycleError ? error : null;
      const safeCode = providerError?.safeCode ?? lifecycleError?.safeCode ?? 'analysis_persistence_failed';
      const nextRetryCount = providerError?.transient ? nextProviderRetryCount(retryCount) : null;
      if (nextRetryCount !== null) {
        retryCount = nextRetryCount;
        await updateRun(admin, run.id, {
          status: 'retry_pending',
          retry_count: retryCount,
          safe_error_code: safeCode,
        });
        await updateRun(admin, run.id, { status: 'uploading' });
        continue;
      }
      await updateRun(admin, run.id, {
        status: 'failed',
        retry_count: retryCount,
        safe_error_code: safeCode,
      });
      return json({ status: 'failed', error: safeCode }, providerError?.transient ? 503 : 422);
    }
  }
}

async function handler(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const openAiKey = requiredEnv('OPENAI_API_KEY');
    const authorization = request.headers.get('Authorization');
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ error: 'authentication_required' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user || userData.user.is_anonymous) {
      return json({ error: 'permanent_account_required' }, 403);
    }

    const body = await request.json().catch(() => null) as { runId?: unknown; testFault?: unknown } | null;
    const runId = typeof body?.runId === 'string' ? body.runId : '';
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
      return json({ error: 'run_id_required' }, 400);
    }
    const testFault = parseTestFault(body?.testFault, request);

    const ownerId = userData.user.id;
    const run = await getRun(admin, runId, ownerId);
    if (!run) {
      return json({ error: 'owned_analysis_run_required' }, 404);
    }

    if (run.status === 'completed') {
      const result = await getResult(admin, run.id, ownerId);
      if (!result) {
        return json({ error: 'completed_result_missing' }, 500);
      }
      return run.audio_cleanup_status === 'deleted'
        ? json({ status: 'completed', result })
        : finishStoredResult(admin, run, ownerId, result);
    }

    if (run.status === 'failed') {
      if (run.safe_error_code === 'audio_cleanup_failed') {
        const result = await getResult(admin, run.id, ownerId);
        return result ? finishStoredResult(admin, run, ownerId, result) : json({ status: 'failed', error: run.safe_error_code }, 503);
      }
      return json({ status: 'failed', error: run.safe_error_code ?? 'analysis_failed' }, 422);
    }

    const { data: claimedRun, error: claimError } = await admin
      .from('analysis_runs')
      .update({ status: 'uploading' })
      .eq('id', run.id)
      .eq('owner_id', ownerId)
      .in('status', ['requested', 'retry_pending'])
      .select('id,attempt_id,owner_id,status,retry_count,audio_object_path,audio_expires_at,transcript_expires_at,safe_error_code,audio_cleanup_status,audio_cleanup_attempts')
      .maybeSingle();
    if (claimError) {
      return json({ error: 'analysis_claim_failed' }, 500);
    }
    if (!claimedRun) {
      return json({ status: 'processing' }, 202);
    }

    const adapters = testFault
      ? createDeterministicTestAdapters(testFault)
      : {
          transcription: {
            model: TRANSCRIPTION_MODEL,
            transcribe: (audio: Blob, path: string) => transcribeAudio(audio, path, openAiKey),
          } satisfies TranscriptionAdapter,
          feedback: {
            model: FEEDBACK_MODEL,
            analyze: (transcript: string) => analyzeTranscript(transcript, openAiKey),
          } satisfies FeedbackAdapter,
        };
    return await processRun(admin, claimedRun as AnalysisRun, ownerId, adapters.transcription, adapters.feedback);
  } catch {
    return json({ error: 'quick_read_unavailable' }, 500);
  }
}

function parseTestFault(value: unknown, request: Request): {
  transcription: TestFaultMode;
  feedback: TestFaultMode;
  transientFailures: number;
} | null {
  if (value === undefined) {
    return null;
  }
  if (Deno.env.get('R0D_TEST_MODE') !== 'true') {
    throw new Error('test_fault_mode_unavailable');
  }
  const secret = Deno.env.get('R0D_TEST_SECRET');
  if (!secret || request.headers.get('x-r0d-test-secret') !== secret) {
    throw new Error('test_fault_authentication_required');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_test_fault_config');
  }
  const config = value as Record<string, unknown>;
  const modes: TestFaultMode[] = ['SUCCESS', 'TRANSIENT_ERROR', 'PERMANENT_ERROR', 'TIMEOUT', 'INVALID_SCHEMA'];
  const transcription = config.transcription ?? 'SUCCESS';
  const feedback = config.feedback ?? 'SUCCESS';
  const transientFailures = config.transientFailures ?? 1;
  if (!modes.includes(transcription as TestFaultMode) || !modes.includes(feedback as TestFaultMode)) {
    throw new Error('invalid_test_fault_config');
  }
  if (!Number.isInteger(transientFailures) || (transientFailures as number) < 0 || (transientFailures as number) > 3) {
    throw new Error('invalid_test_fault_config');
  }
  return {
    transcription: transcription as TestFaultMode,
    feedback: feedback as TestFaultMode,
    transientFailures: transientFailures as number,
  };
}

Deno.serve(handler);
