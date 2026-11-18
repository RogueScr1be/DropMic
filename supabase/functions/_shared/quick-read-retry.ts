export const QUICK_READ_MANUAL_RETRY_CODES = [
  'invalid_model_response_shape',
  'invalid_model_json',
  'invalid_model_schema',
  'unscorable_evaluation',
  'feedback_provider_rejected',
  'transcription_provider_rejected',
  'invalid_transcription_response',
] as const;

export type FailedQuickReadRetryCandidate = {
  status: string;
  safeErrorCode: string | null;
  audioCleanupStatus: string;
  audioExpiresAt: string;
  retryCount: number;
  manualRetryCount: number;
  hasResult: boolean;
};

export function canRetryFailedQuickRead(candidate: FailedQuickReadRetryCandidate, now = new Date()) {
  const expiresAt = Date.parse(candidate.audioExpiresAt);
  return candidate.status === 'failed'
    && QUICK_READ_MANUAL_RETRY_CODES.includes(candidate.safeErrorCode as (typeof QUICK_READ_MANUAL_RETRY_CODES)[number])
    && candidate.audioCleanupStatus === 'pending'
    && Number.isFinite(expiresAt)
    && expiresAt > now.getTime()
    && Number.isInteger(candidate.retryCount)
    && candidate.retryCount >= 0
    && candidate.retryCount < 2
    && candidate.manualRetryCount === 0
    && !candidate.hasResult;
}
