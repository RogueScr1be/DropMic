import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerAccessToken = process.env.R0D_B_OWNER_ACCESS_TOKEN;
const audioPath = process.env.R0D_B_AUDIO_PATH;

if (!url || !anonKey || !ownerAccessToken || !audioPath) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, R0D_B_OWNER_ACCESS_TOKEN, and R0D_B_AUDIO_PATH are required');
}

const ownerHeaders = {
  apikey: anonKey,
  Authorization: 'Bearer ' + ownerAccessToken,
};

async function rest(path, options = {}, token = ownerAccessToken) {
  const response = await fetch(url + path, {
    ...options,
    headers: {
      ...ownerHeaders,
      ...(token === ownerAccessToken ? {} : { Authorization: 'Bearer ' + token }),
      ...(options.headers ?? {}),
    },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function safeError(result) {
  return result.body?.message ?? result.body?.msg ?? result.body?.error ?? null;
}

function assertResult(result) {
  const keys = ['clarity', 'structure', 'specificity', 'concision', 'strength', 'improvement', 'nextDrill'];
  assert(result && typeof result === 'object' && !Array.isArray(result), 'structured result missing');
  assert(Object.keys(result).length === keys.length && keys.every((key) => key in result), 'structured result shape mismatch');
  for (const score of ['clarity', 'structure', 'specificity', 'concision']) {
    assert(typeof result[score] === 'number' && result[score] >= 0 && result[score] <= 1, score + ' score invalid');
  }
  for (const text of ['strength', 'improvement', 'nextDrill']) {
    assert(typeof result[text] === 'string' && result[text].trim().length > 0, text + ' missing');
  }
}

async function createAttempt(clientAttemptId) {
  const attempt = await rest('/rest/v1/attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      owner_id: ownerId,
      client_attempt_id: clientAttemptId,
      topic_id: 'r0d-b-live',
      selected_duration_seconds: 30,
      completed_duration_seconds: 30,
      completed_at: new Date().toISOString(),
      audio_retained: false,
    }),
  });
  assert(attempt.status === 201, 'attempt insert failed: ' + safeError(attempt));
  return attempt.body[0].id;
}

async function requestRun(attemptId, key) {
  const result = await rest('/rest/v1/rpc/request_quick_read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      p_attempt_id: attemptId,
      p_idempotency_key: key,
      p_audio_extension: audioExtension,
    }),
  });
  return result;
}

async function invokeFunction(runId, token = ownerAccessToken) {
  const response = await fetch(url + '/functions/v1/quick-read', {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ runId }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

const ownerUser = await rest('/auth/v1/user');
assert(ownerUser.status === 200 && ownerUser.body?.id, 'owner token is not valid');
assert(ownerUser.body.is_anonymous !== true, 'fresh permanent disposable test user is required');
const ownerId = ownerUser.body.id;
const audioBytes = new Uint8Array(await readFile(audioPath));
const audioExtension = (audioPath.split('.').pop() ?? 'wav').toLowerCase();
assert(['m4a', 'mp4', 'webm', 'wav', 'ogg'].includes(audioExtension), 'unsupported R0D_B_AUDIO_PATH extension');
const createdAttempts = [];

try {
  const attemptId = await createAttempt('r0d-b-live-' + Date.now());
  createdAttempts.push(attemptId);
  const request = await requestRun(attemptId, 'r0d-b-live-' + Date.now());
  assert(request.status === 200, 'analysis request failed: ' + safeError(request));
  const run = request.body;
  const upload = await rest('/storage/v1/object/quick-read-audio/' + run.audio_object_path, {
    method: 'POST',
    headers: { 'content-type': 'audio/' + audioExtension, 'x-upsert': 'false' },
    body: audioBytes,
  });
  assert(upload.status === 200, 'audio upload failed: ' + safeError(upload));

  const first = await invokeFunction(run.id);
  assert(first.status === 200 && first.body?.status === 'completed', 'Quick Read did not complete: ' + safeError(first));
  assertResult(first.body.result);

  const storedResult = await rest('/rest/v1/analysis_results?run_id=eq.' + encodeURIComponent(run.id));
  assert(storedResult.status === 200 && storedResult.body?.length === 1, 'structured result was not persisted');
  assertResult({
    clarity: storedResult.body[0].clarity,
    structure: storedResult.body[0].structure,
    specificity: storedResult.body[0].specificity,
    concision: storedResult.body[0].concision,
    strength: storedResult.body[0].strength,
    improvement: storedResult.body[0].improvement,
    nextDrill: storedResult.body[0].next_drill,
  });

  const metrics = await rest('/rest/v1/attempt_metrics?attempt_id=eq.' + encodeURIComponent(attemptId));
  assert(metrics.status === 200 && metrics.body?.[0]?.analysis_completed === true, 'metrics were not completed');
  assert(!JSON.stringify(metrics.body[0].derived_metrics ?? {}).includes('transcript'), 'transcript leaked into derived metrics');

  const audioAfter = await rest('/storage/v1/object/quick-read-audio/' + run.audio_object_path, { method: 'GET' });
  assert(audioAfter.status >= 400, 'audio object still exists after successful analysis');

  const runAfterFirst = await rest('/rest/v1/analysis_runs?id=eq.' + encodeURIComponent(run.id));
  const duplicate = await invokeFunction(run.id);
  assert(duplicate.status === 200 && duplicate.body?.status === 'completed', 'duplicate invocation did not return completed result');
  assert(JSON.stringify(duplicate.body.result) === JSON.stringify(first.body.result), 'duplicate result differs');
  const runAfterDuplicate = await rest('/rest/v1/analysis_runs?id=eq.' + encodeURIComponent(run.id));
  assert(runAfterFirst.body[0].retry_count === runAfterDuplicate.body[0].retry_count, 'duplicate changed retry count');
  assert(runAfterFirst.body[0].completed_at === runAfterDuplicate.body[0].completed_at, 'duplicate reprocessed completed run');

  const other = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymous = await other.auth.signInAnonymously();
  assert(!anonymous.error && anonymous.data.session, 'cross-user fixture session failed');
  const otherStart = await other.rpc('request_quick_read', {
    p_attempt_id: attemptId,
    p_idempotency_key: 'r0d-b-cross-user-' + Date.now(),
    p_audio_extension: audioExtension,
  });
  assert(otherStart.error, 'cross-user analysis start unexpectedly succeeded');
  const otherResult = await other.from('analysis_results').select('*').eq('run_id', run.id);
  assert(otherResult.error || otherResult.data?.length === 0, 'cross-user result read unexpectedly succeeded');

  const quotaStatuses = [];
  for (let index = 0; index < 3; index += 1) {
    const quotaAttempt = await createAttempt('r0d-b-quota-' + Date.now() + '-' + index);
    createdAttempts.push(quotaAttempt);
    const quotaRun = await requestRun(quotaAttempt, 'r0d-b-quota-key-' + Date.now() + '-' + index);
    quotaStatuses.push(quotaRun.status);
  }
  assert(quotaStatuses[0] === 200 && quotaStatuses[1] === 200 && quotaStatuses[2] >= 400, 'fourth daily request was not rejected');

  console.log(JSON.stringify({
    result: 'R0D-B live acceptance passed',
    structuredResult: true,
    metricsPersisted: true,
    audioDeleted: true,
    duplicateCompletedWithoutRetryChange: true,
    crossUserDenied: true,
    fourthDailyRequestRejected: true,
    transcriptExpiry: run.transcript_expires_at,
    audioExpiry: run.audio_expires_at,
  }, null, 2));
} finally {
  for (const attemptId of createdAttempts) {
    await rest('/rest/v1/attempts?id=eq.' + encodeURIComponent(attemptId), {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }
}
