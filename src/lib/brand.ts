export const SITE_NAME = 'docbd.info';
export const SITE_TAGLINE = 'স্বাস্থ্যের বিশ্বস্ত ঠিকানা';

export function makePageTitle(page?: string | null) {
  const label = page?.trim();
  return label ? `${label} | ${SITE_NAME}` : SITE_NAME;
}
