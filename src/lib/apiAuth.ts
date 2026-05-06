import * as secureStorage from '@/lib/secureStorage';
import { markBackendReachable } from '@/lib/backend';

const AUTH_TOKEN_KEY = 'pos-auth-token';
const LEGACY_AUTH_TOKEN_KEYS = ['auth_token'];
let fetchInstalled = false;

async function mirrorAuthToken(token: string): Promise<void> {
  try {
    await secureStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (e) {
  }

  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    for (const key of LEGACY_AUTH_TOKEN_KEYS) {
      localStorage.setItem(key, token);
    }
  } catch (e) {
  }
}

export async function getAuthToken(): Promise<string | null> {
  try {
    const secureValue = await secureStorage.getItem(AUTH_TOKEN_KEY);
    if (secureValue) {
      await mirrorAuthToken(secureValue);
      return secureValue;
    }
  } catch (e) {
  }

  for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
    try {
      const secureLegacyValue = await secureStorage.getItem(legacyKey);
      if (secureLegacyValue) {
        await mirrorAuthToken(secureLegacyValue);
        return secureLegacyValue;
      }
    } catch (e) {
    }
  }

  try {
    const localValue = localStorage.getItem(AUTH_TOKEN_KEY);
    if (localValue) {
      return localValue;
    }

    for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
      const legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue) {
        void mirrorAuthToken(legacyValue);
        return legacyValue;
      }
    }

    const storedUser = localStorage.getItem('pos-user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      const sessionToken = String(parsed?.authToken || parsed?.token || '').trim();
      if (sessionToken) {
        void mirrorAuthToken(sessionToken);
        return sessionToken;
      }
    }
  } catch (e) {
  }

  return null;
}

export async function setAuthToken(token: string): Promise<void> {
  await mirrorAuthToken(token);
}

export async function clearAuthToken(): Promise<void> {
  try {
    await secureStorage.removeItem(AUTH_TOKEN_KEY);
    for (const key of LEGACY_AUTH_TOKEN_KEYS) {
      await secureStorage.removeItem(key);
    }
  } catch (e) {
  }

  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    for (const key of LEGACY_AUTH_TOKEN_KEYS) {
      localStorage.removeItem(key);
    }
  } catch (e) {
  }
}

export function requiresBackendAuth(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    const path = parsed.pathname;
    if (!path.includes('/backend/api/')) {
      return false;
    }

    return !path.endsWith('/auth_login.php') && !path.endsWith('/health.php');
  } catch (e) {
    return false;
  }
}

export async function hasAuthToken(): Promise<boolean> {
  return Boolean(await getAuthToken());
}

export async function buildAuthenticatedHeaders(initialHeaders?: HeadersInit, url?: string): Promise<Headers> {
  const headers = new Headers(initialHeaders || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (url && requiresBackendAuth(url) && !headers.has('Authorization')) {
    const token = await getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return headers;
}

export function installAuthenticatedFetch(): void {
  if (fetchInstalled || typeof window === 'undefined') {
    return;
  }

  fetchInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const isBackendApiRequest = (() => {
      try {
        const parsed = new URL(requestUrl, window.location.origin);
        return parsed.pathname.includes('/backend/api/');
      } catch (e) {
        return false;
      }
    })();

    if (!requiresBackendAuth(requestUrl)) {
      const response = await originalFetch(input, init);
      if (isBackendApiRequest) {
        markBackendReachable();
      }
      return response;
    }

    const existingHeaders = await buildAuthenticatedHeaders(
      init?.headers || (input instanceof Request ? input.headers : undefined),
      requestUrl
    );

    const response = await originalFetch(input, {
      ...init,
      headers: existingHeaders,
    });
    if (isBackendApiRequest) {
      markBackendReachable();
    }
    return response;
  };
}
