import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required');
}

const results = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeClient() {
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function createAnonymousUser(label) {
  const client = makeClient();
  const response = await client.auth.signInAnonymously();
  if (response.error || !response.data.user || !response.data.session) {
    throw new Error(`${label} anonymous sign-in failed: ${response.error?.message ?? 'missing session'}`);
  }
  return { client, id: response.data.user.id, accessToken: response.data.session.access_token };
}

function recordError(response) {
  return response.error
    ? { code: response.error.code ?? null, message: response.error.message ?? null, status: response.error.status ?? null }
    : null;
}

async function assertNoError(label, response) {
  if (response.error) {
    throw new Error(`${label}: ${response.error.message}`);
  }
}

async function restRequest(user, path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${user.accessToken}`,
      ...(options.headers ?? {}),
    },
  });
  let body = null;
  try {
    const parsed = await response.json();
    body = Array.isArray(parsed) ? parsed : { code: parsed.code ?? null, message: parsed.message ?? null };
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

const userA = await createAnonymousUser('user A');
const userB = await createAnonymousUser('user B');
const now = new Date().toISOString();
const baseAttempt = {
  topic_id: 'live-r0c-topic',
  selected_duration_seconds: 30,
  completed_duration_seconds: 30,
  completed_at: now,
  audio_retained: false,
};

results.users = { userA: userA.id, userB: userB.id };

const profile = await userA.client.from('profiles').select('user_id').eq('user_id', userA.id).single();
await assertNoError('owner profile select', profile);
const profileUpdate = await userA.client.from('profiles').update({ updated_at: now }).eq('user_id', userA.id);
await assertNoError('owner profile update', profileUpdate);

const preferencesUpsert = await userA.client.from('speaking_preferences').upsert({
  user_id: userA.id,
  goals: ['Live R0C goal'],
  blockers: ['Live R0C blocker'],
  free_text_goal: 'Live acceptance',
});
await assertNoError('owner preferences insert', preferencesUpsert);
const preferencesSelect = await userA.client.from('speaking_preferences').select('user_id').eq('user_id', userA.id).single();
await assertNoError('owner preferences select', preferencesSelect);
const preferencesUpdate = await userA.client.from('speaking_preferences').update({ free_text_goal: 'Updated live acceptance' }).eq('user_id', userA.id);
await assertNoError('owner preferences update', preferencesUpdate);

const crudAttemptId = `live-crud-${Date.now()}`;
const crudInsert = await userA.client.from('attempts').insert({ ...baseAttempt, owner_id: userA.id, client_attempt_id: crudAttemptId });
await assertNoError('owner attempt insert', crudInsert);
const crudSelect = await userA.client.from('attempts').select('client_attempt_id,owner_id,audio_retained').eq('client_attempt_id', crudAttemptId).single();
await assertNoError('owner attempt select', crudSelect);
const crudUpdate = await userA.client.from('attempts').update({ topic_id: 'live-r0c-topic-updated' }).eq('client_attempt_id', crudAttemptId);
await assertNoError('owner attempt update', crudUpdate);
const crudDelete = await userA.client.from('attempts').delete().eq('client_attempt_id', crudAttemptId);
await assertNoError('owner attempt delete', crudDelete);
results.ownerCrud = { profiles: true, speakingPreferences: true, attempts: true, audioRetained: crudSelect.data.audio_retained };

const claimId = `live-claim-${Date.now()}`;
const claimRow = { ...baseAttempt, owner_id: userA.id, client_attempt_id: claimId };
const firstClaim = await userA.client.from('attempts').upsert(claimRow, { onConflict: 'client_attempt_id' });
const retryClaim = await userA.client.from('attempts').upsert(claimRow, { onConflict: 'client_attempt_id' });
const concurrentClaims = await Promise.all([
  userA.client.from('attempts').upsert(claimRow, { onConflict: 'client_attempt_id' }),
  userA.client.from('attempts').upsert(claimRow, { onConflict: 'client_attempt_id' }),
]);
const claimCount = await userA.client.from('attempts').select('id', { count: 'exact', head: true }).eq('client_attempt_id', claimId);
await assertNoError('claim count', claimCount);
results.claims = {
  first: recordError(firstClaim),
  retry: recordError(retryClaim),
  concurrent: concurrentClaims.map(recordError),
  rowCount: claimCount.count,
};

const crossRead = await userB.client.from('attempts').select('id').eq('client_attempt_id', claimId);
const crossUpdate = await userB.client.from('attempts').update({ topic_id: 'substitution' }).eq('client_attempt_id', claimId);
const crossDelete = await userB.client.from('attempts').delete().eq('client_attempt_id', claimId);
const substitutionInsert = await userB.client.from('attempts').insert({ ...claimRow, owner_id: userA.id });
const crossProfileRead = await userB.client.from('profiles').select('user_id').eq('user_id', userA.id);
const crossProfileUpdate = await userB.client.from('profiles').update({ updated_at: now }).eq('user_id', userA.id);
const crossProfileDelete = await userB.client.from('profiles').delete().eq('user_id', userA.id);
const crossPreferencesRead = await userB.client.from('speaking_preferences').select('user_id').eq('user_id', userA.id);
const crossPreferencesUpdate = await userB.client.from('speaking_preferences').update({ free_text_goal: 'substitution' }).eq('user_id', userA.id);
const crossPreferencesDelete = await userB.client.from('speaking_preferences').delete().eq('user_id', userA.id);
const directProfileRead = await restRequest(userB, `profiles?select=user_id&user_id=eq.${encodeURIComponent(userA.id)}`);
const directProfileInsert = await restRequest(userB, 'profiles', {
  method: 'POST',
  headers: { 'content-type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ user_id: userA.id }),
});
const directPreferencesRead = await restRequest(userB, `speaking_preferences?select=user_id&user_id=eq.${encodeURIComponent(userA.id)}`);
const directPreferencesInsert = await restRequest(userB, 'speaking_preferences', {
  method: 'POST',
  headers: { 'content-type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ user_id: userA.id, goals: ['substitution'], blockers: ['substitution'] }),
});
const directRead = await restRequest(userB, `attempts?select=id&client_attempt_id=eq.${encodeURIComponent(claimId)}`);
const directInsert = await restRequest(userB, 'attempts', {
  method: 'POST',
  headers: { 'content-type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ ...claimRow, owner_id: userA.id, client_attempt_id: `live-direct-${Date.now()}` }),
});
results.crossUser = {
  readRows: crossRead.data?.length ?? null,
  updateError: recordError(crossUpdate),
  deleteError: recordError(crossDelete),
  substitutionInsertError: recordError(substitutionInsert),
  profiles: { readRows: crossProfileRead.data?.length ?? null, updateError: recordError(crossProfileUpdate), deleteError: recordError(crossProfileDelete) },
  speakingPreferences: { readRows: crossPreferencesRead.data?.length ?? null, updateError: recordError(crossPreferencesUpdate), deleteError: recordError(crossPreferencesDelete) },
  directRestProfiles: { readStatus: directProfileRead.status, readRows: Array.isArray(directProfileRead.body) ? directProfileRead.body.length : null, insertStatus: directProfileInsert.status, insertBody: directProfileInsert.body },
  directRestSpeakingPreferences: { readStatus: directPreferencesRead.status, readRows: Array.isArray(directPreferencesRead.body) ? directPreferencesRead.body.length : null, insertStatus: directPreferencesInsert.status, insertBody: directPreferencesInsert.body },
  directRestRead: { status: directRead.status, rows: Array.isArray(directRead.body) ? directRead.body.length : null },
  directRestInsert: { status: directInsert.status, body: directInsert.body },
};

const preferencesDelete = await userA.client.from('speaking_preferences').delete().eq('user_id', userA.id);
await assertNoError('owner preferences delete', preferencesDelete);

const deleteAttemptId = `live-delete-${Date.now()}`;
const deleteInsert = await userA.client.from('attempts').insert({ ...baseAttempt, owner_id: userA.id, client_attempt_id: deleteAttemptId });
await assertNoError('delete fixture insert', deleteInsert);
const deletePreferences = await userA.client.from('speaking_preferences').upsert({ user_id: userA.id, goals: ['delete'], blockers: ['delete'] });
await assertNoError('delete fixture preferences', deletePreferences);
const deletion = await userA.client.rpc('delete_my_account');
results.deletion = { rpcError: recordError(deletion) };
const deletedUserCheck = await userA.client.auth.getUser();
results.deletion.deletedSessionCheck = { error: deletedUserCheck.error?.message ?? null, status: deletedUserCheck.error?.status ?? null };
const secondDeletion = await userA.client.rpc('delete_my_account');
results.deletion.secondInvocation = recordError(secondDeletion);

const userBDeletion = await userB.client.rpc('delete_my_account');
results.cleanup = { userBDeletion: recordError(userBDeletion) };

console.log(JSON.stringify(results, null, 2));

if (results.claims.rowCount !== 1 || results.deletion.rpcError || results.crossUser.readRows !== 0 || results.crossUser.directRestInsert.status < 400) {
  process.exitCode = 2;
}
