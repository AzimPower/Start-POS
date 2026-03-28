const BACKEND_BASE = 'https://mediumslateblue-cod-399211.hostingersite.com/backend';

export function normalizeImageUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (/^(data:|blob:|https?:\/\/)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${BACKEND_BASE}${trimmed}`;
  return `${BACKEND_BASE}/${trimmed}`;
}

// Lightweight backend reachability check with timeout
export async function backendAvailable(timeout = 5000): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${BACKEND_BASE}/api/ping.php`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(id);
    return res.ok;
  } catch (e) {
    clearTimeout(id);
    return false;
  }
}
