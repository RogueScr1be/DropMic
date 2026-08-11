export type AuthCallbackPayload = {
  accessToken: string;
  refreshToken: string;
};

export type AuthCallbackParseResult =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | ({ kind: 'session' } & AuthCallbackPayload);

const INVALID_CALLBACK_MESSAGE = 'This verification link is invalid or expired.';

function callbackParams(url: string) {
  const parsedUrl = new URL(url);
  const params = new URLSearchParams(parsedUrl.search);

  if (parsedUrl.hash) {
    for (const [key, value] of new URLSearchParams(parsedUrl.hash.slice(1))) {
      params.set(key, value);
    }
  }

  return params;
}

export function parseAuthCallbackUrl(url: string | null): AuthCallbackParseResult {
  if (!url) {
    return { kind: 'empty' };
  }

  try {
    const params = callbackParams(url);
    if (params.has('error') || params.has('error_code')) {
      return { kind: 'error', message: INVALID_CALLBACK_MESSAGE };
    }

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken && !refreshToken) {
      return { kind: 'empty' };
    }
    if (!accessToken || !refreshToken) {
      return { kind: 'error', message: INVALID_CALLBACK_MESSAGE };
    }

    return { kind: 'session', accessToken, refreshToken };
  } catch {
    return { kind: 'error', message: INVALID_CALLBACK_MESSAGE };
  }
}

export const AUTH_CALLBACK_SUCCESS_HREF = '/?auth=complete' as const;
