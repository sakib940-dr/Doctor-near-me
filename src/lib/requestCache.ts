type CacheEntry<T> = { value: T; expiresAt: number };

const valueCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const MAX_PUBLIC_CACHE_ENTRIES = 160;

function prunePublicCache(now = Date.now()) {
  for (const [key, entry] of valueCache) {
    if (entry.expiresAt <= now) valueCache.delete(key);
  }
  while (valueCache.size > MAX_PUBLIC_CACHE_ENTRIES) {
    const oldest = valueCache.keys().next().value as string | undefined;
    if (!oldest) break;
    valueCache.delete(oldest);
  }
}

export async function publicCachedRequest<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const now = Date.now();
  prunePublicCache(now);
  const cached = valueCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) valueCache.delete(key);

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = loader()
    .then((value) => {
      if (ttlMs > 0) {
        valueCache.set(key, { value, expiresAt: Date.now() + ttlMs });
        prunePublicCache();
      }
      return value;
    })
    .finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    });

  inFlight.set(key, pending);
  return pending;
}

export async function dedupeRequest<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = loader().finally(() => {
    if (inFlight.get(key) === pending) inFlight.delete(key);
  });
  inFlight.set(key, pending);
  return pending;
}

export function clearPublicRequestCache(prefix?: string) {
  if (!prefix) {
    valueCache.clear();
    return;
  }
  for (const key of valueCache.keys()) if (key.startsWith(prefix)) valueCache.delete(key);
}
