import { Share } from 'react-native';

import { trackEvent } from '@/features/analytics/analytics';
import { challengeShareText, containsPrivateChallengeData, type PublicChallenge } from '../../../supabase/functions/_shared/challenge-contract';

export type ShareCardInput = {
  prompt: string;
  challengeUrl: string;
  speakerVibe?: string | null;
  dropScore?: number | null;
};

export function buildShareCardText(input: ShareCardInput) {
  const lines = [
    'DROPMIC',
    input.prompt,
    input.speakerVibe ? `Speaker Vibe: ${input.speakerVibe}` : null,
    typeof input.dropScore === 'number' ? `Drop Score: ${input.dropScore}%` : null,
    'Take the challenge:',
    input.challengeUrl,
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n');
}

export function shareCardIsPrivateSafe(text: string) {
  return containsPrivateChallengeData(text) && !/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/iu.test(text);
}

export async function shareDropCard(input: ShareCardInput) {
  const message = buildShareCardText(input);
  if (!shareCardIsPrivateSafe(message)) {
    throw new Error('The share card contains data that is not safe to share.');
  }
  await trackEvent('share_card_generated');
  await trackEvent('native_share_sheet_opened');
  return Share.share({ message, title: 'DropMic challenge' });
}

export function challengeCardText(challenge: Pick<PublicChallenge, 'prompt' | 'durationSeconds'>, url: string) {
  return challengeShareText(challenge, url);
}
