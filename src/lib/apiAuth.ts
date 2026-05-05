import * as secureStorage from '@/lib/secureStorage';
import { markBackendReachable } from '@/lib/backend';

const AUTH_TOKEN_KEY = 'pos-auth-token';
let fetchInstalled = false;

export async function getAuthToken(): Promise<string | null> {
  try {
    const secureValue = await secureStorage.getItem(AUTH_TOKEN_KEY);
    if (secureValue) {
      try {
        localStorage.setItem(AUTH_TOKEN_KEY, secureValue);
      } catch (e) {
      }
      return secureValue;
    }
  } catch (e) {
  }

  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  try {
    await secureStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (e) {
  }

  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (e) {
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    await secureStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (e) {
  }

  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
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
