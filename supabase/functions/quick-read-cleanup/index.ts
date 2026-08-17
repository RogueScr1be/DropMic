import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const AUDIO_BUCKET = 'quick-read-audio';
const STALE_RUN_MINUTES = 15;

type CleanupRun = {
  id: string;
  status: string;
  safe_error_code: string | null;
  audio_object_path: string;
  audio_expires_at: string;
  audio_cleanup_status: 'pending' | 'deleted' | 'failed';
  audio_cleanup_attempts: number;
  transcript_cleanup_status: 'pending' | 'deleted' | 'failed';
  updated_at: string;
};

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-r0d-cleanup-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function updateRun(admin: SupabaseClient, runId: string, updates: Record<string, unknown>) {
  const { error } = await admin.from('analysis_runs').update(updates).eq('id', runId);
  if (error) throw new Error('cleanup_run_update_failed');
}

async function removeAudio(admin: SupabaseClient, run: CleanupRun) {
  const attempts = run.audio_cleanup_attempts + 1;
  try {
    await admin.storage.from(AUDIO_BUCKET).remove([run.audio_object_path]);
    await updateRun(admin, run.id, {
      audio_cleanup_status: 'deleted',
      audio_cleanup_attempts: attempts,
      audio_cleanup_last_error: null,
      audio_cleanup_last_error_at: null,
      audio_deleted_at: new Date().toISOString(),
    });
    return { deleted: true };
  } catch {
    await updateRun(admin, run.id, {
      audio_cleanup_status: 'failed',
      audio_cleanup_attempts: attempts,
      audio_cleanup_last_error: 'audio_cleanup_failed',
      audio_cleanup_last_error_at: new Date().toISOString(),
      safe_error_code: 'audio_cleanup_failed',
    });
    return { deleted: false };
  }
}

async function expireAudioRun(admin: SupabaseClient, run: CleanupRun) {
  const removal = await removeAudio(admin, run);
  if (!removal.deleted) return false;
  if (run.status !== 'completed' && run.status !== 'expired') {
    await updateRun(admin, run.id, { status: 'expired', safe_error_code: 'audio_expired' });
  }
  return true;
}

async function markStaleRuns(admin: SupabaseClient) {
  const cutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString();
  const { data, error } = await admin
    .from('analysis_runs')
    .select('id,status,updated_at')
    .in('status', ['requested', 'uploading', 'transcribing', 'analyzing', 'retry_pending'])
    .lt('updated_at', cutoff);
  if (error) throw new Error('stale_run_lookup_failed');
  let marked = 0;
  for (const run of data ?? []) {
    await updateRun(admin, run.id, { status: 'failed', safe_error_code: 'abandoned_run' });
    marked += 1;
  }
  return marked;
}

async function cleanExpiredAudio(admin: SupabaseClient) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('analysis_runs')
    .select('id,status,safe_error_code,audio_object_path,audio_expires_at,audio_cleanup_status,audio_cleanup_attempts,transcript_cleanup_status,updated_at')
    .lte('audio_expires_at', now)
    .neq('audio_cleanup_status', 'deleted');
  if (error) throw new Error('expired_audio_lookup_failed');
  let deleted = 0;
  let failed = 0;
  for (const run of (data ?? []) as CleanupRun[]) {
    if (await expireAudioRun(admin, run)) deleted += 1;
    else failed += 1;
  }
  return { deleted, failed };
}

async function cleanExpiredTranscripts(admin: SupabaseClient) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('analysis_transcripts')
    .select('run_id')
    .lte('transcript_expires_at', now);
  if (error) throw new Error('expired_transcript_lookup_failed');
  let deleted = 0;
  let failed = 0;
  for (const transcript of data ?? []) {
    const { error: deleteError } = await admin
      .from('analysis_transcripts')
      .delete()
      .eq('run_id', transcript.run_id);
    if (deleteError) {
      failed += 1;
      await updateRun(admin, transcript.run_id, {
        transcript_cleanup_status: 'failed',
        transcript_cleanup_attempts: 1,
        transcript_cleanup_last_error: 'transcript_cleanup_failed',
        transcript_cleanup_last_error_at: new Date().toISOString(),
      });
    } else {
      deleted += 1;
      await updateRun(admin, transcript.run_id, {
        transcript_cleanup_status: 'deleted',
        transcript_deleted_at: new Date().toISOString(),
        transcript_cleanup_last_error: null,
        transcript_cleanup_last_error_at: null,
      });
    }
  }
  return { deleted, failed };
}

async function cleanOrphanedStorage(admin: SupabaseClient) {
  const { data, error } = await admin.rpc('list_orphaned_quick_read_objects');
  if (error) throw new Error('orphaned_storage_lookup_failed');
  let deleted = 0;
  let failed = 0;
  for (const object of (data ?? []) as Array<{ object_path: string }>) {
    const { error: deleteError } = await admin.storage.from(AUDIO_BUCKET).remove([object.object_path]);
    if (deleteError) failed += 1;
    else deleted += 1;
  }
  return { deleted, failed };
}

async function handler(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const cleanupSecret = requiredEnv('R0D_C_CLEANUP_SECRET');
    if (request.headers.get('x-r0d-cleanup-secret') !== cleanupSecret) {
      return json({ error: 'cleanup_authentication_required' }, 401);
    }
    const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const staleRuns = await markStaleRuns(admin);
    const audio = await cleanExpiredAudio(admin);
    const transcripts = await cleanExpiredTranscripts(admin);
    const orphanedStorage = await cleanOrphanedStorage(admin);
    return json({ staleRuns, audio, transcripts, orphanedStorage });
  } catch {
    return json({ error: 'cleanup_unavailable' }, 500);
  }
}

Deno.serve(handler);
