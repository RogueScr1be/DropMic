import { resolveEntitlementAccess } from '../../../supabase/functions/_shared/entitlement';
import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';
import { SKILL_PACKS, type SkillPackId, type SkillPackPracticeContent } from '@/features/topics/skill-packs';

const ENTITLEMENT_FIELDS = 'entitlement_key,provider,product_id,status,started_at,expires_at,grace_expires_at,last_event_id,last_event_at,created_at,updated_at';
const DIFFICULTIES = [1, 2, 3, 4, 5];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validPrompt(value: unknown): value is SkillPackPracticeContent['prompts'][number] {
  return isRecord(value) &&
    typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 200 &&
    typeof value.prompt === 'string' && value.prompt.trim().length > 0 && value.prompt.length <= 500 &&
    typeof value.category === 'string' && value.category.length > 0 &&
    DIFFICULTIES.includes(value.difficulty as number) &&
    (value.challengeReady === undefined || typeof value.challengeReady === 'boolean');
}

export function parseSkillPackContent(value: unknown, expectedPackId: SkillPackId): SkillPackPracticeContent | null {
  if (!isRecord(value) || value.id !== expectedPackId || !Array.isArray(value.prompts)) return null;
  const prompts = value.prompts;
  if (prompts.length < 40 || prompts.length > 60 || !prompts.every(validPrompt) ||
      new Set(prompts.map((prompt) => (prompt as { id: string }).id)).size !== prompts.length ||
      !Array.isArray(value.drills) || value.drills.length !== 5 ||
      !value.drills.every((drill) => isRecord(drill) && typeof drill.id === 'string' && typeof drill.title === 'string' && typeof drill.instruction === 'string' && typeof drill.topicId === 'string' && prompts.some((prompt) => (prompt as { id: string }).id === drill.topicId)) ||
      !Array.isArray(value.terminology) || value.terminology.length < 5 ||
      !value.terminology.every((entry) => isRecord(entry) && typeof entry.term === 'string' && typeof entry.meaning === 'string') ||
      !isRecord(value.pressureTest) || !validPrompt(value.pressureTest) || value.pressureTest.category !== 'Pressure Test' ||
      typeof value.quickReadGuidance !== 'string' || value.quickReadGuidance.length > 1000) {
    return null;
  }

  const advancedRubric = value.advancedRubric;
  if (advancedRubric !== null && advancedRubric !== undefined &&
      (!isRecord(advancedRubric) || typeof advancedRubric.version !== 'string' || !Array.isArray(advancedRubric.criteria) ||
       advancedRubric.criteria.length < 3 || !advancedRubric.criteria.every((criterion) => isRecord(criterion) && typeof criterion.name === 'string' && typeof criterion.description === 'string'))) {
    return null;
  }

  return {
    id: expectedPackId,
    prompts: prompts as SkillPackPracticeContent['prompts'],
    drills: value.drills as SkillPackPracticeContent['drills'],
    terminology: value.terminology as SkillPackPracticeContent['terminology'],
    pressureTest: value.pressureTest as SkillPackPracticeContent['pressureTest'],
    quickReadGuidance: value.quickReadGuidance,
    advancedRubric: advancedRubric as SkillPackPracticeContent['advancedRubric'],
  };
}

export async function getOwnedSkillPackIds(now = new Date()): Promise<SkillPackId[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const session = await supabase.auth.getSession();
    if (session.error || !session.data.session?.user || session.data.session.user.is_anonymous) return [];
    const keys = SKILL_PACKS.map((pack) => pack.entitlementKey);
    const result = await supabase.from('billing_entitlements').select(ENTITLEMENT_FIELDS).in('entitlement_key', keys);
    if (result.error || !Array.isArray(result.data)) return [];
    return SKILL_PACKS.filter((pack) => result.data.some((row) =>
      resolveEntitlementAccess(row, pack.entitlementKey, now).allowed,
    )).map((pack) => pack.id);
  } catch {
    return [];
  }
}

export async function fetchSkillPackContent(packId: SkillPackId): Promise<SkillPackPracticeContent> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Skill Pack access is unavailable right now.');
  const response = await supabase.functions.invoke('skill-pack-content', { body: { packId } });
  if (response.error) {
    const code = typeof response.data?.error === 'string' ? response.data.error : '';
    if (code === 'skill_pack_not_owned' || code === 'permanent_account_required') {
      throw new Error('Sign in and restore this Skill Pack to use it.');
    }
    throw new Error('Skill Pack content could not be loaded. Try again when you are online.');
  }
  const parsed = parseSkillPackContent(response.data?.pack, packId);
  if (!parsed) throw new Error('Skill Pack content could not be verified.');
  return parsed;
}
