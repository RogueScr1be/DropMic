import AsyncStorage from '@react-native-async-storage/async-storage';

export const CHALLENGE_SHARE_LINKS_KEY = '@micdrop/launch/challenge-share-links';
export const CHALLENGE_SHARE_LINKS_VERSION = 1 as const;

export type ChallengeShareLinkRecord = {
  version: typeof CHALLENGE_SHARE_LINKS_VERSION;
  ownerId: string;
  attemptId: string;
  challengeId: string;
  url: string;
  expiresAt: string;
};

const CHALLENGE_TOKEN = /^[A-Za-z0-9_-]{24,}$/u;

export function isValidChallengeUrl(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'thedropmic.com' ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return false;
    }
    const segments = parsed.pathname.split('/');
    if (segments.length !== 3 || segments[1] !== 'challenge' || !segments[2]) {
      return false;
    }
    const token = decodeURIComponent(segments[2]);
    return token === segments[2] && CHALLENGE_TOKEN.test(token);
  } catch {
    return false;
  }
}

function isChallengeShareLinkRecord(value: unknown): value is ChallengeShareLinkRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<ChallengeShareLinkRecord>;
  return (
    record.version === CHALLENGE_SHARE_LINKS_VERSION &&
    typeof record.ownerId === 'string' && record.ownerId.trim() !== '' &&
    typeof record.attemptId === 'string' && record.attemptId.trim() !== '' &&
    typeof record.challengeId === 'string' && record.challengeId.trim() !== '' &&
    isValidChallengeUrl(record.url) &&
    typeof record.expiresAt === 'string' && Number.isFinite(Date.parse(record.expiresAt))
  );
}

async function readRecords() {
  const raw = await AsyncStorage.getItem(CHALLENGE_SHARE_LINKS_KEY);
  if (!raw) {
    return [] as ChallengeShareLinkRecord[];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isChallengeShareLinkRecord) : [];
  } catch {
    return [] as ChallengeShareLinkRecord[];
  }
}

async function writeRecords(records: ChallengeShareLinkRecord[]) {
  await AsyncStorage.setItem(CHALLENGE_SHARE_LINKS_KEY, JSON.stringify(records));
}

export async function saveChallengeShareLink(record: ChallengeShareLinkRecord) {
  if (!isChallengeShareLinkRecord(record) || Date.parse(record.expiresAt) <= Date.now()) {
    throw new Error('The challenge link is invalid or expired.');
  }
  const records = await readRecords();
  const next = records.filter((item) => !(item.ownerId === record.ownerId && item.attemptId === record.attemptId));
  await writeRecords([...next, record]);
  return record;
}

export async function getChallengeShareLink(ownerId: string | null, attemptId: string | null) {
  if (!ownerId || !attemptId) {
    return null;
  }
  const records = await readRecords();
  const matching = records.find((item) => item.ownerId === ownerId && item.attemptId === attemptId) ?? null;
  if (!matching) {
    return null;
  }
  if (Date.parse(matching.expiresAt) <= Date.now()) {
    await clearChallengeShareLink(ownerId, attemptId);
    return null;
  }
  return matching;
}

export async function clearChallengeShareLink(ownerId: string, attemptId: string) {
  const records = await readRecords();
  const next = records.filter((item) => !(item.ownerId === ownerId && item.attemptId === attemptId));
  if (next.length !== records.length) {
    await writeRecords(next);
  }
}
