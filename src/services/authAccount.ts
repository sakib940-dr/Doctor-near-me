import { requireSupabase } from '../lib/supabase';
import { normalizeAuthPhone } from '../lib/authIdentifiers';

export async function startPhoneIdentityLink(phoneInput: string) {
  const phone = normalizeAuthPhone(phoneInput);
  if (!phone) throw new Error('সঠিক মোবাইল নম্বর দিন। বাংলাদেশি নম্বর 01XXXXXXXXX format-এ দিতে পারেন।');

  const client = requireSupabase();
  const { data: prepared, error: prepareError } = await client.rpc('prepare_my_phone_link', { p_phone: phone });
  if (prepareError) throw prepareError;

  const { error } = await client.auth.updateUser({ phone });
  if (error) throw error;
  return (prepared as { phone: string }).phone || phone;
}

export async function verifyPhoneIdentityLink(phoneInput: string, token: string) {
  const phone = normalizeAuthPhone(phoneInput);
  if (!phone) throw new Error('সঠিক মোবাইল নম্বর দিন।');
  if (!/^\d{6}$/.test(token.trim())) throw new Error('৬ সংখ্যার verification code দিন।');

  const client = requireSupabase();
  const { error: prepareError } = await client.rpc('prepare_my_phone_link', { p_phone: phone });
  if (prepareError) throw prepareError;

  const { error } = await client.auth.verifyOtp({ phone, token: token.trim(), type: 'phone_change' });
  if (error) throw error;

  const { data, error: confirmError } = await client.rpc('confirm_my_verified_phone');
  if (confirmError) throw confirmError;
  await client.auth.refreshSession();
  return data as { phone: string; verified: boolean };
}
