const NS = 'https://rill.cache.invalid/';

function keyUrl(key: string): string {
  return NS + encodeURIComponent(key);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const hit = await caches.default.match(keyUrl(key));
    return hit ? ((await hit.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function cachePut(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const res = new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${Math.max(1, Math.floor(ttlSeconds))}` },
    });
    await caches.default.put(keyUrl(key), res);
  } catch {
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try { await caches.default.delete(keyUrl(key)); } catch {}
}

export async function memo<T>(key: string, ttlSeconds: number, produce: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await produce();
  if (value !== undefined && value !== null) await cachePut(key, value, ttlSeconds);
  return value;
}

export interface FetchJsonOptions extends RequestInit {
  ttl?: number;
  timeoutMs?: number;
  cacheScope?: string;
}

export async function fetchJson<T = any>(url: string, opts: FetchJsonOptions = {}): Promise<T | null> {
  const { ttl = 0, timeoutMs = 12000, cacheScope = '', ...init } = opts;
  const method = (init.method || 'GET').toUpperCase();
  const key = `json:${cacheScope}:${url}`;
  if (method === 'GET' && ttl > 0) {
    const hit = await cacheGet<T>(key);
    if (hit !== null) return hit;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    if (method === 'GET' && ttl > 0 && data !== null && data !== undefined) await cachePut(key, data, ttl);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
