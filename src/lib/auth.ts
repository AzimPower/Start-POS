export async function hashPasswordForCache(password: string): Promise<string> {
  const normalized = String(password || '');

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  // Weak fallback only for environments without Web Crypto.
  return normalized;
}
