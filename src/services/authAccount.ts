import { normalizeAuthPhone } from '../lib/authIdentifiers';

const DISABLED_MESSAGE = 'Phone verification এখন বন্ধ আছে। SMS/Phone provider configure করার পরে এই flow আবার enable করা হবে।';

/**
 * Temporary rollout guard.
 *
 * Keep the public service shape so a later provider rollout can restore native
 * Supabase phone identity linking without changing callers. Right now these
 * functions deliberately DO NOT call auth.updateUser(), verifyOtp(), or any SMS
 * provider. Guided onboarding is completely independent from phone verification.
 */
export async function startPhoneIdentityLink(phoneInput: string) {
  const phone = normalizeAuthPhone(phoneInput);
  if (!phone) throw new Error('সঠিক মোবাইল নম্বর দিন। বাংলাদেশি নম্বর 01XXXXXXXXX format-এ দিতে পারেন।');
  throw new Error(DISABLED_MESSAGE);
}

export async function verifyPhoneIdentityLink(phoneInput: string, _token: string) {
  const phone = normalizeAuthPhone(phoneInput);
  if (!phone) throw new Error('সঠিক মোবাইল নম্বর দিন।');
  throw new Error(DISABLED_MESSAGE);
}
