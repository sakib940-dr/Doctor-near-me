export function safeDate(value: unknown, dateOnlyAtNoon = false): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (value == null) return null;

  const text = String(value).trim();
  if (!text || text === 'null' || text === 'undefined') return null;

  const normalized = dateOnlyAtNoon && /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T12:00:00`
    : text;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function safeDateTimestamp(value: unknown): number {
  return safeDate(value)?.getTime() ?? 0;
}

export function safeDateOnly(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return safeDate(text, true) ? text : null;
}

export function formatDateSafe(
  value: unknown,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  fallback = '—',
  dateOnlyAtNoon = false,
): string {
  const date = safeDate(value, dateOnlyAtNoon);
  if (!date) return fallback;
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return fallback;
  }
}
