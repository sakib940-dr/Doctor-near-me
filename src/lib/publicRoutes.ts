export function doctorPublicPath(slug: string | null | undefined, doctorId?: string | null) {
  const identifier = slug?.trim() || doctorId?.trim() || '';
  return `/doctor/${encodeURIComponent(identifier)}`;
}

export function hospitalPublicPath(slug: string | null | undefined, providerId?: string | null) {
  const identifier = slug?.trim() || providerId?.trim() || '';
  return `/hospital/${encodeURIComponent(identifier)}`;
}

export function chamberPublicPath(slug: string | null | undefined, providerId?: string | null) {
  const identifier = slug?.trim() || providerId?.trim() || '';
  return `/chamber/${encodeURIComponent(identifier)}`;
}

export function providerPublicPath(
  providerType: 'hospital' | 'chamber' | null | undefined,
  slug: string | null | undefined,
  providerId?: string | null,
) {
  return providerType === 'chamber'
    ? chamberPublicPath(slug, providerId)
    : hospitalPublicPath(slug, providerId);
}
