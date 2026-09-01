export const PLUS_ENTITLEMENT_KEY = 'plus' as const;
export const REVENUECAT_PROVIDER = 'revenuecat' as const;

const ENTITLEMENT_STATUSES = ['active', 'grace', 'expired', 'revoked'] as const;

type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export type PlusAccessReason =
  | 'allowed'
  | 'missing'
  | 'malformed'
  | 'expired'
  | 'grace_expired'
  | 'revoked';

export type PlusAccessDecision = {
  allowed: boolean;
  reason: PlusAccessReason;
};

function denied(reason: Exclude<PlusAccessReason, 'allowed'>): PlusAccessDecision {
  return { allowed: false, reason };
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isStatus(value: unknown): value is EntitlementStatus {
  return typeof value === 'string' && (ENTITLEMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Resolve Plus access from a server-selected entitlement row.
 *
 * The caller must select the row through a server-owned identity boundary.
 * This helper intentionally accepts no client-supplied owner id and performs
 * no provider or purchase-SDK calls.
 */
export function resolvePlusAccess(row: unknown, now: Date = new Date()): PlusAccessDecision {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    return denied('missing');
  }

  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return denied('malformed');
  }

  const state = row as Record<string, unknown>;
  if (
    state.entitlement_key !== PLUS_ENTITLEMENT_KEY ||
    state.provider !== REVENUECAT_PROVIDER ||
    typeof state.product_id !== 'string' ||
    state.product_id.trim() === '' ||
    typeof state.last_event_id !== 'string' ||
    state.last_event_id.trim() === '' ||
    !isStatus(state.status)
  ) {
    return denied('malformed');
  }

  const requiredTimestamps = [
    state.started_at,
    state.expires_at,
    state.last_event_at,
    state.created_at,
    state.updated_at,
  ];
  if (requiredTimestamps.some((value) => parseTimestamp(value) === null)) {
    return denied('malformed');
  }

  const expiresAt = parseTimestamp(state.expires_at);
  const graceExpiresAt = state.grace_expires_at === null
    ? null
    : parseTimestamp(state.grace_expires_at);
  if (
    expiresAt === null ||
    (state.grace_expires_at !== null && graceExpiresAt === null) ||
    (state.status === 'grace' && graceExpiresAt === null)
  ) {
    return denied('malformed');
  }

  const nowMilliseconds = now.getTime();
  switch (state.status) {
    case 'active':
      return nowMilliseconds < expiresAt
        ? { allowed: true, reason: 'allowed' }
        : denied('expired');
    case 'grace':
      return graceExpiresAt !== null && nowMilliseconds < graceExpiresAt
        ? { allowed: true, reason: 'allowed' }
        : denied('grace_expired');
    case 'expired':
      return denied('expired');
    case 'revoked':
      return denied('revoked');
  }
}
