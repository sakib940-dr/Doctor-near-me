export function normalizeAuthPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s().-]/g, '');

  if (/^01[3-9]\d{8}$/.test(compact)) return `+88${compact}`;
  if (/^8801[3-9]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+8801[3-9]\d{8}$/.test(compact)) return compact;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  return null;
}

export function isEmailIdentifier(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function validateEmail(value: string) {
  return isEmailIdentifier(value) ? null : 'সঠিক email address দিন।';
}

export function formatAuthPhoneForDisplay(value?: string | null) {
  if (!value) return '';
  if (/^\+8801[3-9]\d{8}$/.test(value)) return `0${value.slice(4)}`;
  return value;
}
