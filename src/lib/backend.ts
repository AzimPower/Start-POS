// Lightweight backend reachability check with timeout
export async function backendAvailable(timeout = 5000): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch('https://mediumslateblue-cod-399211.hostingersite.com/backend/api/ping.php', {
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
