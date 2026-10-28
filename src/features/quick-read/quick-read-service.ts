import { Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { parseQuickReadResult, type QuickReadResult } from '../../../supabase/functions/_shared/quick-read-contract';
import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';

type AnalysisRun = {
  id: string;
  audio_object_path: string;
  status: string;
};

const SAFE_FUNCTION_ERROR_CODES = new Set([
  'analysis_claim_failed',
  'analysis_failed',
  'analysis_persistence_failed',
  'audio_cleanup_failed',
  'audio_unavailable',
  'authentication_required',
  'completed_result_missing',
  'feedback_provider_rejected',
  'feedback_provider_transient',
  'invalid_model_json',
  'invalid_model_response_shape',
  'invalid_model_schema',
  'invalid_transcription_response',
  'metrics_write_failed',
  'owned_analysis_run_required',
  'owned_attempt_required',
  'permanent_account_required',
  'provider_attempt_record_failed',
  'provider_timeout',
  'provider_transport',
  'quick_read_unavailable',
  'result_lookup_failed',
  'result_write_failed',
  'run_lookup_failed',
  'run_id_required',
  'run_update_failed',
  'transcript_lookup_failed',
  'transcript_too_large',
  'transcript_write_failed',
  'transcription_provider_rejected',
  'transcription_provider_transient',
  'unsupported_audio',
]);

function safeFunctionErrorCode(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_FUNCTION_ERROR_CODES.has(value) ? value : undefined;
}

export class QuickReadServiceError extends Error {
  code: string;

  constructor(message: string, code = 'quick_read_failed') {
    super(message);
    this.name = 'QuickReadServiceError';
    this.code = code;
  }
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new QuickReadServiceError('Quick Read is not configured yet. Your recording remains on this device.', 'not_configured');
  }
  return supabase;
}

async function localAudioBlob(uri: string) {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new QuickReadServiceError('The local recording could not be opened.', 'local_audio_unavailable');
    }
    return response.blob();
  }
  return new ExpoFile(uri);
}

function friendlyError(code: string | undefined) {
  switch (code) {
    case 'quick_read_daily_quota_exceeded':
      return 'You have used your 3 Quick Reads for today.';
    case 'audio_unavailable':
    case 'local_audio_unavailable':
      return 'The recording could not be opened. It is still available locally.';
    case 'invalid_model_response_shape':
    case 'invalid_model_json':
    case 'invalid_model_schema':
      return 'Quick Read could not validate the feedback. Your recording was kept for retry.';
    case 'provider_timeout':
    case 'provider_transport':
    case 'transcription_provider_transient':
    case 'feedback_provider_transient':
      return "Quick Read couldn't finish. Your recording will be deleted automatically.";
    default:
      return "Quick Read couldn't finish. Your recording was kept for retry.";
  }
}

export async function startQuickRead(input: {
  attemptId: string;
  audioUri: string;
  audioExtension: 'm4a' | 'mp4' | 'webm' | 'wav' | 'ogg';
  idempotencyKey: string;
}): Promise<{ runId: string; result: QuickReadResult }> {
  const client = requireClient();
  const sessionResult = await client.auth.getSession();
  if (sessionResult.error || !sessionResult.data.session || sessionResult.data.session.user.is_anonymous) {
    throw new QuickReadServiceError('Sign in before starting a Quick Read.', 'permanent_account_required');
  }

  const request = await client.rpc('request_quick_read', {
    p_attempt_id: input.attemptId,
    p_idempotency_key: input.idempotencyKey,
    p_audio_extension: input.audioExtension,
  });
  if (request.error || !request.data) {
    const code = request.error?.message.includes('quota') ? 'quick_read_daily_quota_exceeded' : 'request_failed';
    throw new QuickReadServiceError(friendlyError(code), code);
  }

  const run = request.data as AnalysisRun;
  if (run.status === 'requested') {
    const audio = await localAudioBlob(input.audioUri);
    const upload = await client.storage.from('quick-read-audio').upload(run.audio_object_path, audio, {
      contentType: audio.type || 'audio/' + input.audioExtension,
      upsert: false,
    });
    if (upload.error) {
      throw new QuickReadServiceError('The recording could not be uploaded. It is still available locally.', 'upload_failed');
    }
  }

  const invocation = await client.functions.invoke('quick-read', {
    body: { runId: run.id },
  });
  let payload = invocation.data as { status?: string; result?: unknown; error?: unknown } | null;
  if (!payload && invocation.error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await invocation.error.context.json();
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        payload = body as { status?: string; result?: unknown; error?: unknown };
      }
    } catch {
      // Keep the generic fallback when the function error body is not valid JSON.
    }
  }
  if (invocation.error && !payload) {
    throw new QuickReadServiceError(friendlyError('quick_read_failed'));
  }
  if (payload?.status === 'failed') {
    const code = safeFunctionErrorCode(payload.error) ?? 'analysis_failed';
    throw new QuickReadServiceError(friendlyError(code), code);
  }
  if (payload?.status !== 'completed') {
    throw new QuickReadServiceError('Quick Read is still processing. Try again in a moment.', 'processing');
  }
  const result = parseQuickReadResult(payload.result);
  if (!result) {
    throw new QuickReadServiceError('Quick Read returned an invalid result.', 'invalid_result');
  }
  return { runId: run.id, result };
}
