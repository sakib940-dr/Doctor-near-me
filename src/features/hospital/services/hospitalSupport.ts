import { requireSupabase } from '../../../lib/supabase';

export type HospitalSupportStatus = 'open' | 'answered' | 'closed';

export interface HospitalSupportThread {
  id: string;
  provider_id: string;
  subject: string;
  status: HospitalSupportStatus;
  last_message_at: string;
  created_at: string;
  message_count: number;
  last_message: string | null;
}

export interface HospitalSupportMessage {
  id: string;
  sender_id: string;
  sender_role: string;
  sender_name: string | null;
  message: string;
  created_at: string;
}

export interface HospitalSupportChat {
  thread: HospitalSupportThread;
  messages: HospitalSupportMessage[];
}

export async function getMyHospitalSupportThreads(providerId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_hospital_support_threads', { p_provider_id: providerId });
  if (error) throw error;
  return (data ?? []) as HospitalSupportThread[];
}

export async function getMyHospitalSupportChat(providerId: string, threadId: string) {
  const { data, error } = await requireSupabase().rpc('get_my_hospital_support_chat', {
    p_provider_id: providerId,
    p_thread_id: threadId,
  });
  if (error) throw error;
  return data as HospitalSupportChat;
}

export async function createMyHospitalSupportConversation(providerId: string, subject: string, message: string) {
  const { data, error } = await requireSupabase().rpc('create_my_hospital_support_conversation', {
    p_provider_id: providerId,
    p_subject: subject.trim(),
    p_message: message.trim(),
  });
  if (error) throw error;
  return String(data);
}

export async function sendMyHospitalSupportMessage(providerId: string, threadId: string, message: string) {
  const { data, error } = await requireSupabase().rpc('send_my_hospital_support_message', {
    p_provider_id: providerId,
    p_thread_id: threadId,
    p_message: message.trim(),
  });
  if (error) throw error;
  return String(data);
}
