const SESSION_KEY = 'docbd-analytics-session-v1';
const recentClicks = new Map<string, number>();
let memorySessionId: string | null = null;

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getAnalyticsSessionId() {
  if (memorySessionId) return memorySessionId;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      memorySessionId = stored;
      return stored;
    }
    const created = randomId();
    sessionStorage.setItem(SESSION_KEY, created);
    memorySessionId = created;
    return created;
  } catch {
    memorySessionId = memorySessionId || randomId();
    return memorySessionId;
  }
}

export function analyticsDedupeKey(
  targetType: 'doctor' | 'provider',
  targetId: string,
  eventType: string,
) {
  const sessionId = getAnalyticsSessionId();
  // A profile view is counted at most once per target per 30-minute browsing window.
  // Clicks use a short server-side bucket in addition to the in-memory rapid-click guard.
  const bucketMs = eventType === 'profile_view' ? 30 * 60 * 1000 : 5 * 1000;
  const bucket = Math.floor(Date.now() / bucketMs);
  return `${sessionId}:${targetType}:${targetId}:${eventType}:${bucket}`;
}

export function shouldRecordInteraction(
  targetType: 'doctor' | 'provider',
  targetId: string,
  eventType: string,
) {
  if (eventType === 'profile_view') return true;
  const key = `${targetType}:${targetId}:${eventType}`;
  const now = Date.now();
  const previous = recentClicks.get(key) ?? 0;
  if (now - previous < 1200) return false;
  recentClicks.set(key, now);
  return true;
}
