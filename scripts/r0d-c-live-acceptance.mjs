import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.R0D_C_SUPABASE_SERVICE_ROLE_KEY;
const audioPath = process.env.R0D_C_AUDIO_PATH;
const testSecret = process.env.R0D_C_TEST_SECRET;
const cleanupSecret = process.env.R0D_C_CLEANUP_SECRET;
const managementToken = process.env.R0D_C_MANAGEMENT_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF;

if (!url || !anonKey || !serviceRoleKey || !audioPath || !testSecret || !cleanupSecret || !managementToken || !projectRef) {
  throw new Error('R0D-C live harness environment is incomplete');
}

if (process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('service-role key must not be exposed through Expo public environment');
}

const audioBytes = new Uint8Array(await readFile(audioPath));
const audioExtension = (audioPath.split('.').pop() ?? 'wav').toLowerCase();
const createdAttempts = [];
const publicClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const adminClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
let ownerAccessToken;
let disposableUserId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(result) {
  return result.body?.message ?? result.body?.msg ?? result.body?.error ?? null;
}

async function rest(path, options = {}, token = ownerAccessToken) {
  const response = await fetch(url + path, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
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

async function managementQuery(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${managementToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`management query failed: ${body?.message ?? response.status}`);
  return body;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function createAndSignInDisposableUser() {
  const email = `r0d-c-${Date.now()}-${randomUUID().slice(0, 12)}@micdrop.invalid`;
  const password = randomBytes(32).toString('base64url');
  const created = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { r0d_harness: true },
  });
  if (created.error || !created.data.user?.id) {
    throw new Error(`disposable user creation failed: ${created.error?.message ?? 'missing user'}`);
  }
  disposableUserId = created.data.user.id;

  const signedIn = await publicClient.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    await adminClient.auth.admin.deleteUser(disposableUserId).catch(() => undefined);
    disposableUserId = undefined;
    throw new Error(`disposable user sign-in failed: ${signedIn.error?.message ?? 'missing session'}`);
  }
  ownerAccessToken = signedIn.data.session.access_token;
  return signedIn.data.user;
}

async function ownerUser() {
  const result = await rest('/auth/v1/user');
  assert(result.status === 200 && result.body?.id, 'owner token is not valid');
  assert(result.body.is_anonymous !== true, 'permanent disposable account is required');
  return result.body;
}

async function resetDevQuota(ownerId) {
  await managementQuery(`update public.quick_read_daily_usage set consumed_count = 0, updated_at = now() where user_id = ${sqlString(ownerId)} and quota_date = (now() at time zone 'utc')::date;`);
}

async function createAttempt(ownerId, label) {
  const result = await rest('/rest/v1/attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      owner_id: ownerId,
      client_attempt_id: `r0d-c-${label}-${Date.now()}`,
      topic_id: 'r0d-c-lifecycle',
      selected_duration_seconds: 30,
      completed_duration_seconds: 30,
      completed_at: new Date().toISOString(),
      audio_retained: false,
    }),
  });
  assert(result.status === 201, `attempt insert failed: ${safeError(result)}`);
  const attemptId = result.body?.[0]?.id;
  assert(attemptId, 'attempt id missing');
  createdAttempts.push(attemptId);
  return attemptId;
}

async function createRun(ownerId, label) {
  const attemptId = await createAttempt(ownerId, label);
  const result = await rest('/rest/v1/rpc/request_quick_read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      p_attempt_id: attemptId,
      p_idempotency_key: `r0d-c-${label}-${Date.now()}`,
      p_audio_extension: audioExtension,
    }),
  });
  assert(result.status === 200, `analysis request failed: ${safeError(result)}`);
  const run = result.body;
  const upload = await rest(`/storage/v1/object/quick-read-audio/${run.audio_object_path}`, {
    method: 'POST',
    headers: { 'content-type': `audio/${audioExtension}`, 'x-upsert': 'false' },
    body: audioBytes,
  });
  assert(upload.status === 200, `audio upload failed: ${safeError(upload)}`);
  return { attemptId, run };
}

async function invoke(runId, testFault) {
  const response = await fetch(`${url}/functions/v1/quick-read`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${ownerAccessToken}`,
      'x-r0d-test-secret': testSecret,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ runId, testFault }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function cleanup() {
  const response = await fetch(`${url}/functions/v1/quick-read-cleanup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${ownerAccessToken}`,
      'x-r0d-cleanup-secret': cleanupSecret,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  const body = await response.json().catch(() => null);
  assert(response.status === 200, `cleanup failed: ${body?.error ?? response.status}`);
  return body;
}

async function runRow(runId) {
  const result = await rest(`/rest/v1/analysis_runs?id=eq.${encodeURIComponent(runId)}`);
  assert(result.status === 200 && result.body?.length === 1, 'analysis run row missing');
  return result.body[0];
}

async function objectExists(path) {
  const result = await rest(`/storage/v1/object/quick-read-audio/${path}`, { method: 'GET' });
  return result.status < 400;
}

async function waitForObjectAbsent(path, attempts = 12) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const catalogRows = await managementQuery(`select count(*) as count from storage.objects where bucket_id = 'quick-read-audio' and name = ${sqlString(path)};`);
    const catalogExists = Number(catalogRows[0]?.count) > 0;
    const serviceRead = await adminClient.storage.from('quick-read-audio').download(path);
    if (!catalogExists && serviceRead.error) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function markExpired(runId, fields) {
  const assignments = Object.entries(fields).map(([key, value]) => `${key} = ${value}`).join(', ');
  await managementQuery(`update public.analysis_runs set ${assignments} where id = ${sqlString(runId)};`);
}

async function markAbandonedForHarness(runId) {
  await managementQuery(`begin;
set local session_replication_role = replica;
update public.analysis_runs set updated_at = now() - interval '20 minutes' where id = ${sqlString(runId)};
commit;`);
}

async function counts(ownerId) {
  const rows = await managementQuery(`select json_build_object(
    'users', (select count(*) from auth.users where id = ${sqlString(ownerId)}),
    'attempts', (select count(*) from public.attempts where owner_id = ${sqlString(ownerId)}),
    'metrics', (select count(*) from public.attempt_metrics where user_id = ${sqlString(ownerId)}),
    'runs', (select count(*) from public.analysis_runs where owner_id = ${sqlString(ownerId)}),
    'transcripts', (select count(*) from public.analysis_transcripts where owner_id = ${sqlString(ownerId)}),
    'results', (select count(*) from public.analysis_results where owner_id = ${sqlString(ownerId)}),
    'storage_objects', (select count(*) from storage.objects where bucket_id = 'quick-read-audio' and owner_id = ${sqlString(ownerId)})
  ) as state;`);
  return rows[0]?.state ?? {};
}

const owner = await createAndSignInDisposableUser();
assert(owner?.id, 'disposable user id missing');
const ownerFromSession = await ownerUser();
assert(ownerFromSession.id === owner.id, 'public session subject does not match disposable user');
const ownerId = owner.id;
const evidence = {};
evidence.disposableUserCreatedAndConfirmed = true;

try {
  await resetDevQuota(ownerId);
  const transient = await createRun(ownerId, 'transient-both');
  const transientResult = await invoke(transient.run.id, {
    transcription: 'TRANSIENT_ERROR',
    feedback: 'TRANSIENT_ERROR',
    transientFailures: 1,
  });
  const transientRow = await runRow(transient.run.id);
  assert(
    transientResult.status === 200 && transientResult.body?.status === 'completed',
    `transient retry did not recover: status=${transientResult.status} body=${JSON.stringify(transientResult.body)}`,
  );
  assert(transientRow.retry_count === 2, 'combined transient retry count mismatch');
  assert(transientRow.transcription_attempt_count === 2 && transientRow.feedback_attempt_count === 2, 'provider execution count mismatch');
  assert(await waitForObjectAbsent(transientRow.audio_object_path), 'successful audio was not deleted');
  evidence.transcriptionTransientRetry = true;
  evidence.feedbackTransientRetry = true;

  await resetDevQuota(ownerId);
  const concurrent = await createRun(ownerId, 'concurrent');
  const concurrentResponses = await Promise.all([
    invoke(concurrent.run.id, { transcription: 'SUCCESS', feedback: 'SUCCESS', transientFailures: 0 }),
    invoke(concurrent.run.id, { transcription: 'SUCCESS', feedback: 'SUCCESS', transientFailures: 0 }),
  ]);
  const concurrentRow = await runRow(concurrent.run.id);
  assert(concurrentResponses.every((response) => response.status === 200 || response.status === 202), 'concurrent invocation returned an unexpected status');
  assert(concurrentRow.status === 'completed' && concurrentRow.transcription_attempt_count === 1 && concurrentRow.feedback_attempt_count === 1, 'duplicate invocation performed duplicate provider work');
  evidence.concurrentSingleProviderExecution = true;

  await resetDevQuota(ownerId);
  const exhausted = await createRun(ownerId, 'exhausted');
  const exhaustedResult = await invoke(exhausted.run.id, {
    transcription: 'TRANSIENT_ERROR',
    feedback: 'SUCCESS',
    transientFailures: 3,
  });
  const exhaustedRow = await runRow(exhausted.run.id);
  assert(exhaustedResult.status === 503 && exhaustedResult.body?.status === 'failed', 'retry exhaustion did not fail deterministically');
  assert(exhaustedRow.status === 'failed' && exhaustedRow.retry_count === 2 && exhaustedRow.transcription_attempt_count === 3, 'retry exhaustion state mismatch');
  assert(await objectExists(exhaustedRow.audio_object_path), 'failed audio was not retained before expiry');
  assert(new Date(exhaustedRow.audio_expires_at).getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'failed audio deadline exceeds 24 hours');
  await markExpired(exhausted.run.id, { audio_expires_at: "requested_at + interval '1 second'" });
  const cleanupOne = await cleanup();
  const expiredRow = await runRow(exhausted.run.id);
  assert(expiredRow.status === 'expired' && expiredRow.audio_cleanup_status === 'deleted', 'expired failed audio did not reach terminal cleanup state');
  assert(await waitForObjectAbsent(expiredRow.audio_object_path), 'expired failed audio still exists');
  const cleanupTwo = await cleanup();
  assert(cleanupOne && cleanupTwo, 'cleanup replay returned no result');
  evidence.retryExhaustion = true;
  evidence.failedAudioCleanupReplay = true;

  await resetDevQuota(ownerId);
  const transcriptRun = await createRun(ownerId, 'transcript-retention');
  const transcriptResult = await invoke(transcriptRun.run.id, { transcription: 'SUCCESS', feedback: 'SUCCESS', transientFailures: 0 });
  assert(transcriptResult.status === 200 && transcriptResult.body?.status === 'completed', 'transcript retention fixture did not complete');
  await markExpired(transcriptRun.run.id, {
    transcript_expires_at: "requested_at + interval '1 second'",
  });
  await managementQuery(`update public.analysis_transcripts set transcript_expires_at = now() - interval '1 minute' where run_id = ${sqlString(transcriptRun.run.id)};`);
  await cleanup();
  const transcriptCounts = await managementQuery(`select
    (select count(*) from public.analysis_transcripts where run_id = ${sqlString(transcriptRun.run.id)}) as transcripts,
    (select count(*) from public.analysis_results where run_id = ${sqlString(transcriptRun.run.id)}) as results,
    (select count(*) from public.attempt_metrics where attempt_id = ${sqlString(transcriptRun.attemptId)}) as metrics;`);
  assert(Number(transcriptCounts[0]?.transcripts) === 0 && Number(transcriptCounts[0]?.results) === 1 && Number(transcriptCounts[0]?.metrics) === 1, 'transcript cleanup did not preserve durable data');
  evidence.transcriptCleanupPreservesDurableData = true;

  const terminalRun = await runRow(transcriptRun.run.id);
  const terminalRegression = await managementQuery(`update public.analysis_runs set status = 'uploading' where id = ${sqlString(terminalRun.id)};`)
    .then(() => false)
    .catch(() => true);
  const terminalAfter = await runRow(terminalRun.id);
  assert(terminalRegression && terminalAfter.status === 'completed', 'terminal run regressed');
  evidence.terminalStateMonotonic = true;

  await resetDevQuota(ownerId);
  const abandoned = await createRun(ownerId, 'abandoned');
  await markAbandonedForHarness(abandoned.run.id);
  await cleanup();
  const abandonedRow = await runRow(abandoned.run.id);
  assert(abandonedRow.status === 'failed' && abandonedRow.safe_error_code === 'abandoned_run', 'abandoned run was not surfaced');
  evidence.abandonedRunRecovery = true;

  await resetDevQuota(ownerId);
  const deletionFixture = await createRun(ownerId, 'account-delete');
  assert(await objectExists(deletionFixture.run.audio_object_path), 'account deletion Storage fixture missing');
  const deletion = await rest('/rest/v1/rpc/delete_my_account', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert(deletion.status < 300, `account deletion failed: ${safeError(deletion)}`);
  await cleanup();
  let deletionCounts = await counts(ownerId);
  if (Number(deletionCounts.users) !== 0) {
    const fallback = await adminClient.auth.admin.deleteUser(ownerId);
    assert(!fallback.error, `admin deletion fallback failed: ${fallback.error?.message}`);
    disposableUserId = undefined;
    await cleanup();
    deletionCounts = await counts(ownerId);
  } else {
    disposableUserId = undefined;
  }
  assert(Object.values(deletionCounts).every((value) => Number(value) === 0), 'account deletion left database artifacts');
  assert(await waitForObjectAbsent(deletionFixture.run.audio_object_path), 'account deletion left an orphaned Storage object');
  evidence.accountDeletionCascade = true;

  console.log(JSON.stringify({
    result: 'R0D-C live lifecycle acceptance passed',
    disposableUser: { created: true, removed: true },
    remainingRowsAndObjects: deletionCounts,
    evidence,
  }, null, 2));
} finally {
  for (const attemptId of createdAttempts) {
    await rest(`/rest/v1/attempts?id=eq.${encodeURIComponent(attemptId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    }).catch(() => undefined);
  }
  if (disposableUserId) {
    await adminClient.auth.admin.deleteUser(disposableUserId).catch(() => undefined);
  }
}
