const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WEBHOOK_BYTES = 128 * 1024;
const LIFETIME_EXPIRY = '9999-12-31T23:59:59.999Z';

export type RevenueCatSnapshot = {
  ownerId: string;
  productId: string;
  startedAt: string;
  expiresAt: string;
  graceExpiresAt: string | null;
  status: 'active' | 'grace' | 'expired';
  snapshotAt: string;
};

export type RevenueCatSnapshotResult =
  | { ownerId: string; hasEntitlement: true; snapshot: RevenueCatSnapshot }
  | { ownerId: string; hasEntitlement: false; snapshotAt: string };

type BillingEvent = {
  id: string;
  type: string;
  app_id: string;
  app_user_id?: string | null;
  event_timestamp_ms: number;
  transferred_from?: unknown;
  transferred_to?: unknown;
};

type WebhookDependencies = {
  authorization: string;
  appId: string;
  getSnapshot: (ownerId: string) => Promise<RevenueCatSnapshotResult>;
  applySnapshot: (event: { id: string; type: string; occurredAt: string }, result: RevenueCatSnapshotResult) => Promise<void>;
  now?: () => Date;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let i = 0; i < leftBytes.length; i += 1) difference |= leftBytes[i] ^ rightBytes[i];
  return difference === 0;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function eventFrom(value: unknown): BillingEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const event = (value as { event?: unknown }).event;
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const candidate = event as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' || candidate.id.trim().length < 1 || candidate.id.length > 200 ||
    typeof candidate.type !== 'string' || candidate.type.trim().length < 1 || candidate.type.length > 100 ||
    typeof candidate.app_id !== 'string' || candidate.app_id.trim().length < 1 ||
    typeof candidate.event_timestamp_ms !== 'number' || !Number.isSafeInteger(candidate.event_timestamp_ms) || candidate.event_timestamp_ms <= 0
  ) return null;
  return candidate as unknown as BillingEvent;
}

function uuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isUuid);
}

export function parseRevenueCatSubscriberSnapshot(ownerId: string, response: unknown, now = new Date()): RevenueCatSnapshotResult {
  if (!isUuid(ownerId) || !response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('Invalid RevenueCat subscriber response.');
  }
  const root = response as Record<string, unknown>;
  const subscriber = root.subscriber;
  if (!subscriber || typeof subscriber !== 'object' || Array.isArray(subscriber)) throw new Error('Missing subscriber.');
  const requestDate = typeof root.request_date === 'string' ? Date.parse(root.request_date) : Number.NaN;
  if (!Number.isFinite(requestDate)) throw new Error('Invalid subscriber snapshot time.');
  const snapshotAt = new Date(requestDate).toISOString();
  const entitlements = (subscriber as Record<string, unknown>).entitlements;
  if (!entitlements || typeof entitlements !== 'object' || Array.isArray(entitlements)) {
    return { ownerId, hasEntitlement: false, snapshotAt };
  }
  const plus = (entitlements as Record<string, unknown>).plus;
  if (!plus || typeof plus !== 'object' || Array.isArray(plus)) return { ownerId, hasEntitlement: false, snapshotAt };

  const entitlement = plus as Record<string, unknown>;
  const productId = typeof entitlement.product_identifier === 'string' ? entitlement.product_identifier.trim() : '';
  const startedAtMs = typeof entitlement.purchase_date === 'string' ? Date.parse(entitlement.purchase_date) : Number.NaN;
  const rawExpiry = entitlement.expires_date;
  const expiresAtMs = rawExpiry === null ? null : typeof rawExpiry === 'string' ? Date.parse(rawExpiry) : Number.NaN;
  const rawGraceExpiry = entitlement.grace_period_expires_date;
  const graceExpiryMs = rawGraceExpiry === null ? null : typeof rawGraceExpiry === 'string' ? Date.parse(rawGraceExpiry) : Number.NaN;
  if (
    !productId || productId.length > 200 || !Number.isFinite(startedAtMs) ||
    (expiresAtMs !== null && !Number.isFinite(expiresAtMs)) ||
    (graceExpiryMs !== null && !Number.isFinite(graceExpiryMs))
  ) throw new Error('Invalid Plus entitlement snapshot.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid server clock.');

  const activeLifetime = expiresAtMs === null;
  const activeUntil = activeLifetime || expiresAtMs! > now.getTime();
  const graceActive = expiresAtMs !== null && expiresAtMs! <= now.getTime() && graceExpiryMs !== null && graceExpiryMs > now.getTime();
  const status: RevenueCatSnapshot['status'] = activeUntil ? 'active' : graceActive ? 'grace' : 'expired';
  const expiresAt = activeLifetime ? LIFETIME_EXPIRY : new Date(expiresAtMs!).toISOString();
  const graceExpiresAt = graceExpiryMs === null ? null : new Date(graceExpiryMs).toISOString();

  return {
    ownerId,
    hasEntitlement: true,
    snapshot: {
      ownerId,
      productId,
      startedAt: new Date(startedAtMs).toISOString(),
      expiresAt,
      graceExpiresAt,
      status,
      snapshotAt,
    },
  };
}

export function createRevenueCatWebhookHandler(dependencies: WebhookDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!dependencies.authorization || !dependencies.appId) return json(503, { error: 'webhook_not_configured' });
    if (!safeEqual(request.headers.get('Authorization') ?? '', dependencies.authorization)) return json(401, { error: 'unauthorized' });

    const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) return json(413, { error: 'payload_too_large' });
    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_WEBHOOK_BYTES) return json(413, { error: 'payload_too_large' });

    let payload: unknown;
    try { payload = JSON.parse(body); } catch { return json(400, { error: 'invalid_json' }); }
    const event = eventFrom(payload);
    if (!event) return json(400, { error: 'invalid_event' });
    if (event.type === 'TEST') return json(200, { received: true, test: true });
    if (event.app_id !== dependencies.appId) return json(200, { received: true, ignored: true });

    const eventDate = new Date(event.event_timestamp_ms);
    if (!Number.isFinite(eventDate.getTime())) return json(400, { error: 'invalid_event_time' });
    const ownerIds = event.type === 'TRANSFER'
      ? [...new Set([...uuidList(event.transferred_from), ...uuidList(event.transferred_to)])]
      : isUuid(event.app_user_id) ? [event.app_user_id] : [];
    if (ownerIds.length === 0) return json(200, { received: true, ignored: true });
    if (ownerIds.length > 20) return json(400, { error: 'invalid_transfer' });

    try {
      for (const ownerId of ownerIds) {
        const snapshot = await dependencies.getSnapshot(ownerId);
        await dependencies.applySnapshot({ id: event.id, type: event.type, occurredAt: eventDate.toISOString() }, snapshot);
      }
      return json(200, { received: true });
    } catch {
      return json(503, { error: 'billing_sync_unavailable' });
    }
  };
}

export async function fetchRevenueCatSubscriberSnapshot(
  ownerId: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<RevenueCatSnapshotResult> {
  if (!isUuid(ownerId) || !apiKey.trim()) throw new Error('RevenueCat snapshot configuration is unavailable.');
  const response = await fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(ownerId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json', 'X-Platform': 'ios' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('RevenueCat subscriber lookup failed.');
  return parseRevenueCatSubscriberSnapshot(ownerId, await response.json(), now);
}
