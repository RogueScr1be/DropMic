import { createChallenge } from './challenge-service';
import { shareDropCard } from '@/features/share/share-service';
import type { ChallengeDuration } from '../../../supabase/functions/_shared/challenge-contract';
import { saveChallengeShareLink, type ChallengeShareLinkRecord } from './challenge-share-storage';

export type ChallengeShareInput = {
  attemptId: string;
  prompt: string;
  category: string;
  durationSeconds: ChallengeDuration;
};

type ChallengeCreationResult = {
  url: string;
  challengeId?: string | null;
  expiresAt?: string;
};

export type ChallengeShareDependencies = {
  createChallenge: (input: ChallengeShareInput) => Promise<ChallengeCreationResult>;
  shareDropCard: (input: { prompt: string; challengeUrl: string }) => Promise<unknown>;
  persistChallengeLink?: (record: ChallengeShareLinkRecord) => Promise<unknown>;
};

export type ChallengeShareEligibilityInput = {
  authenticatedUserId: string | null;
  savedDropOwnerId: string | null;
  persisted: boolean;
  localUriMatches: boolean;
  recordingCompleted: boolean;
  recordingUri: string | null;
  prompt: string | null;
  category: string | null;
  durationSeconds: number | null;
};

export function isChallengeShareEligible(input: ChallengeShareEligibilityInput) {
  return Boolean(
    input.authenticatedUserId &&
    input.savedDropOwnerId === input.authenticatedUserId &&
    input.persisted &&
    input.localUriMatches &&
    input.recordingCompleted &&
    input.recordingUri &&
    input.prompt?.trim() &&
    input.category?.trim() &&
    (input.durationSeconds === 30 || input.durationSeconds === 60 || input.durationSeconds === 90),
  );
}

export async function createAndShareChallenge(
  input: ChallengeShareInput,
  dependencies: ChallengeShareDependencies = { createChallenge, shareDropCard },
) {
  const challenge = await dependencies.createChallenge(input);
  await dependencies.shareDropCard({ prompt: input.prompt, challengeUrl: challenge.url });
}

export async function createPersistAndShareChallenge(
  input: ChallengeShareInput,
  ownerId: string,
  dependencies: ChallengeShareDependencies & {
    persistChallengeLink: (record: ChallengeShareLinkRecord) => Promise<unknown>;
  } = { createChallenge, shareDropCard, persistChallengeLink: saveChallengeShareLink },
): Promise<ChallengeCreationResult & { challengeId: string; expiresAt: string }> {
  const challenge = await dependencies.createChallenge(input);
  if (!challenge.challengeId || !challenge.expiresAt) {
    throw new Error('The challenge link could not be persisted safely.');
  }
  await dependencies.persistChallengeLink({
    version: 1,
    ownerId,
    attemptId: input.attemptId,
    challengeId: challenge.challengeId,
    url: challenge.url,
    expiresAt: challenge.expiresAt,
  });
  await dependencies.shareDropCard({ prompt: input.prompt, challengeUrl: challenge.url });
  return challenge as ChallengeCreationResult & { challengeId: string; expiresAt: string };
}
