import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

import {
  handleTakeTwoRequest,
  type TakeTwoRepository,
} from '../_shared/take-two.ts';

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function createRepository(admin: ReturnType<typeof createClient>): TakeTwoRepository {
  return {
    async getEntitlement(ownerId) {
      const { data, error } = await admin
        .from('billing_entitlements')
        .select('owner_id,entitlement_key,provider,product_id,status,started_at,expires_at,grace_expires_at,last_event_id,last_event_at,created_at,updated_at')
        .eq('owner_id', ownerId)
        .eq('entitlement_key', 'plus')
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async getRuns(ownerId, runIds) {
      const { data: runs, error: runError } = await admin
        .from('analysis_runs')
        .select('id,attempt_id,status,created_at,completed_at')
        .eq('owner_id', ownerId)
        .in('id', runIds);
      if (runError) throw runError;
      if (!runs || runs.length !== runIds.length) return [];

      const attemptIds = runs.map((run) => run.attempt_id);
      const { data: attempts, error: attemptError } = await admin
        .from('attempts')
        .select('id,owner_id,topic_id')
        .eq('owner_id', ownerId)
        .in('id', attemptIds);
      if (attemptError) throw attemptError;

      return runs.flatMap((run) => {
        const attempt = attempts?.find((candidate) => candidate.id === run.attempt_id);
        return attempt
          ? [{
              id: run.id,
              attemptId: run.attempt_id,
              promptId: attempt.topic_id,
              status: run.status,
              createdAt: run.created_at,
              completedAt: run.completed_at,
            }]
          : [];
      });
    },

    async getResults(ownerId, runIds) {
      const { data, error } = await admin
        .from('analysis_results')
        .select('run_id,attempt_id,clarity,structure,specificity,concision')
        .eq('owner_id', ownerId)
        .in('run_id', runIds);
      if (error) throw error;
      return (data ?? []).map((result) => ({
        runId: result.run_id,
        attemptId: result.attempt_id,
        clarity: result.clarity,
        structure: result.structure,
        specificity: result.specificity,
        concision: result.concision,
      }));
    },

    async getMetrics(ownerId, attemptIds) {
      const { data, error } = await admin
        .from('attempt_metrics')
        .select('attempt_id,clarity,structure,specificity,concision,word_count,words_per_minute,filler_word_count')
        .eq('user_id', ownerId)
        .in('attempt_id', attemptIds);
      if (error) throw error;
      return (data ?? []).map((metric) => ({
        attemptId: metric.attempt_id,
        clarity: metric.clarity,
        structure: metric.structure,
        specificity: metric.specificity,
        concision: metric.concision,
        wordCount: metric.word_count,
        wordsPerMinute: metric.words_per_minute,
        fillerWordCount: metric.filler_word_count,
      }));
    },
  };
}

async function handler(request: Request) {
  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    return await handleTakeTwoRequest(request, {
      authenticate: async (token) => {
        const { data, error } = await admin.auth.getUser(token);
        if (error || !data.user) return null;
        return { userId: data.user.id, isAnonymous: Boolean(data.user.is_anonymous) };
      },
      repository: createRepository(admin),
    });
  } catch {
    return new Response(JSON.stringify({ error: 'take_two_unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

Deno.serve(handler);
