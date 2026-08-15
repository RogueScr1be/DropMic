import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ownerAccessToken = process.env.R0D_OWNER_ACCESS_TOKEN;

if (!url || !anonKey || !ownerAccessToken) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and R0D_OWNER_ACCESS_TOKEN are required');
}

const ownerHeaders = {
  apikey: anonKey,
  Authorization: `Bearer ${ownerAccessToken}`,
};

async function rest(path, options = {}, token = ownerAccessToken) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      ...ownerHeaders,
      ...(token === ownerAccessToken ? {} : { Authorization: `Bearer ${token}` }),
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
  return result.body?.message ?? result.body?.msg ?? null;
}

const ownerUser = await rest('/auth/v1/user');
assert(ownerUser.status === 200 && ownerUser.body?.id, 'owner token is not valid');
const ownerId = ownerUser.body.id;
const attemptId = `r0d-a-${Date.now()}`;
const attempt = await rest('/rest/v1/attempts', {
  method: 'POST',
  headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({
    owner_id: ownerId,
    client_attempt_id: attemptId,
    topic_id: 'r0d-a-live',
    selected_duration_seconds: 30,
    completed_duration_seconds: 30,
    completed_at: new Date().toISOString(),
    audio_retained: false,
  }),
});
assert(attempt.status === 201, `owner attempt insert failed: ${safeError(attempt)}`);
const serverAttemptId = attempt.body?.[0]?.id;
assert(serverAttemptId, 'owner attempt did not return a server id');

const requestBody = JSON.stringify({
  p_attempt_id: serverAttemptId,
  p_idempotency_key: `r0d-a-${Date.now()}`,
  p_audio_extension: 'wav',
});
const firstRun = await rest('/rest/v1/rpc/request_quick_read', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: requestBody,
});
assert(firstRun.status === 200, `owner analysis request failed: ${safeError(firstRun)}`);
const secondRun = await rest('/rest/v1/rpc/request_quick_read', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: requestBody,
});
assert(secondRun.status === 200 && secondRun.body?.id === firstRun.body?.id, 'duplicate request was not idempotent');

const anonymousClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const anonymous = await anonymousClient.auth.signInAnonymously();
assert(!anonymous.error && anonymous.data.session, 'cross-user fixture creation failed');
const otherToken = anonymous.data.session.access_token;
const path = firstRun.body.audio_object_path;
const fixture = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);

const ownerUpload = await rest(`/storage/v1/object/quick-read-audio/${path.replace(/^quick-read\//, '')}`, {
  method: 'POST',
  headers: { 'content-type': 'audio/wav', 'x-upsert': 'false' },
  body: fixture,
});
assert(ownerUpload.status === 200, `owner upload failed: ${safeError(ownerUpload)}`);

const otherUpload = await rest(`/storage/v1/object/quick-read-audio/${path.replace(/^quick-read\//, '')}`, {
  method: 'POST',
  headers: { 'content-type': 'audio/wav', 'x-upsert': 'false' },
  body: fixture,
}, otherToken);
const otherRead = await rest(`/storage/v1/object/quick-read-audio/${path.replace(/^quick-read\//, '')}`, {
  method: 'GET',
}, otherToken);
const otherDelete = await rest(`/storage/v1/object/quick-read-audio/${path.replace(/^quick-read\//, '')}`, {
  method: 'DELETE',
  headers: { 'content-type': 'application/json' },
}, otherToken);
const otherStart = await rest('/rest/v1/rpc/request_quick_read', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ p_attempt_id: serverAttemptId, p_idempotency_key: `r0d-a-other-${Date.now()}`, p_audio_extension: 'wav' }),
}, otherToken);

const ownerDelete = await rest(`/storage/v1/object/quick-read-audio/${path.replace(/^quick-read\//, '')}`, {
  method: 'DELETE',
  headers: { 'content-type': 'application/json' },
});
await rest(`/rest/v1/attempts?id=eq.${encodeURIComponent(serverAttemptId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });

assert(otherUpload.status >= 400, 'cross-user upload unexpectedly succeeded');
assert(otherRead.status >= 400, 'cross-user read unexpectedly succeeded');
const crossUserDeleteBlocked =
  otherDelete.status >= 400 ||
  (Array.isArray(otherDelete.body) && otherDelete.body.length === 0);
assert(crossUserDeleteBlocked, 'cross-user delete unexpectedly succeeded');
assert(otherStart.status >= 400, 'cross-user analysis start unexpectedly succeeded');
assert(ownerDelete.status < 300, `owner cleanup failed: ${safeError(ownerDelete)}`);

console.log(JSON.stringify({
  owner: { attemptCreated: true, runCreated: true, duplicateIdempotent: true, uploadAllowed: true, cleanupAllowed: true },
  crossUser: {
    uploadStatus: otherUpload.status,
    readStatus: otherRead.status,
    deleteStatus: otherDelete.status,
    deleteBlocked: crossUserDeleteBlocked,
    analysisStartStatus: otherStart.status,
  },
  result: 'R0D-A live ownership and idempotency checks passed',
}, null, 2));
