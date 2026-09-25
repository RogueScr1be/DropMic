import AsyncStorage from '@react-native-async-storage/async-storage';

import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';

export const ANALYTICS_KEY = '@micdrop/launch/analytics-events';
export const ANALYTICS_EVENTS = [
  'app_opened', 'prompt_viewed', 'recording_started', 'recording_completed',
  'quick_read_requested', 'quick_read_completed', 'quick_read_failed',
  'share_card_generated', 'native_share_sheet_opened', 'challenge_link_created',
  'challenge_link_opened', 'challenge_accepted', 'challenge_recording_completed',
  'paywall_viewed', 'product_selected', 'purchase_completed', 'purchase_cancelled',
  'purchase_failed', 'restore_completed', 'saved_drop_limit_reached',
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

type LocalEvent = { name: AnalyticsEventName; key: string; occurredAt: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHALLENGE_TOKEN_PATTERN = /[a-f0-9]{64}/iu;
const PRIVATE_KEY_PATTERN = /(transcript|recording|storage|access[_-]?token|provider[_-]?response|email)/iu;

function safeDedupeKey(value: string) {
  return !UUID_PATTERN.test(value) && !CHALLENGE_TOKEN_PATTERN.test(value) && !PRIVATE_KEY_PATTERN.test(value);
}

function isEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

export async function trackEvent(name: AnalyticsEventName, options: { dedupeKey?: string } = {}) {
  try {
    if (!isEventName(name)) return false;
    const requestedKey = options.dedupeKey;
    const key = requestedKey && safeDedupeKey(requestedKey)
      ? requestedKey
      : name + ':' + new Date().toISOString().slice(0, 10);
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    let events: LocalEvent[] = [];
    try {
      const parsed = raw ? JSON.parse(raw) as unknown : [];
      events = Array.isArray(parsed) ? parsed.filter((event): event is LocalEvent => Boolean(event && typeof event === 'object' && isEventName((event as LocalEvent).name) && typeof (event as LocalEvent).key === 'string')) : [];
    } catch {
      events = [];
    }
    if (events.some((event) => event.key === key)) return false;
    const event: LocalEvent = { name, key, occurredAt: new Date().toISOString() };
    await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify([...events, event].slice(-500)));

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('analytics_events').insert({ event_name: name, event_key: key, occurred_at: event.occurredAt });
      } catch {
        // Analytics transport failures must never block product flows.
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function getTrackedEvents() {
  const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
  try {
    return raw ? JSON.parse(raw) as LocalEvent[] : [];
  } catch {
    return [];
  }
}
