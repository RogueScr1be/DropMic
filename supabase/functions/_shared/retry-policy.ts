export const MAX_PROVIDER_RETRIES = 2;

export function nextProviderRetryCount(retryCount: number) {
  return retryCount < MAX_PROVIDER_RETRIES ? retryCount + 1 : null;
}
