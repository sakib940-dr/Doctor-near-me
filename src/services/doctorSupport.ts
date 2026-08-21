import { requireSupabase } from '../lib/supabase';

export interface DoctorSupportMessage {
  id: string;
  sender_id: string;
  sender_role: string;
  sender_name: string | null;
  message: string;
  created_at: string;
}

export interface DoctorSupportThread {
  id: string;
  doctor_id?: string;
  doctor_name?: string | null;
  subject: string;
  status: 'open' | 'closed';
  last_message_at: string;
}

export interface DoctorSupportChat {
  thread: DoctorSupportThread | null;
  messages: DoctorSupportMessage[];
}

export interface AdminDoctorSupportThread {
  thread_id: string;
  doctor_id: string;
  doctor_name: string | null;
  doctor_phone: string | null;
  doctor_email: string | null;
  subject: string;
  status: 'open' | 'closed';
  last_message_at: string;
  message_count: number;
}

export interface DoctorFeedbackReport {
  id: string;
  doctor_id?: string;
  doctor_name?: string | null;
  report_type: 'feedback' | 'bug';
  subject: string;
  message: string;
  status: 'open' | 'reviewed' | 'resolved';
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export async function getMyDoctorSupportChat() {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_support_chat');
  if (error) throw error;
  const raw = (data ?? { thread: null, messages: [] }) as DoctorSupportChat;
  return { thread: raw.thread ?? null, messages: Array.isArray(raw.messages) ? raw.messages : [] };
}

export async function sendMyDoctorSupportMessage(message: string) {
  const { data, error } = await requireSupabase().rpc('send_my_doctor_support_message', { p_message: message });
  if (error) throw error;
  return String(data);
}

export async function getAdminDoctorSupportThreads(limit = 50, offset = 0) {
  const { data, error } = await requireSupabase().rpc('admin_get_doctor_support_threads', { p_limit: limit, p_offset: offset });
  if (error) throw error;
  return (data ?? []).map((row: AdminDoctorSupportThread) => ({ ...row, message_count: Number(row.message_count ?? 0) })) as AdminDoctorSupportThread[];
}

export async function getAdminDoctorSupportChat(threadId: string) {
  const { data, error } = await requireSupabase().rpc('admin_get_doctor_support_chat', { p_thread_id: threadId });
  if (error) throw error;
  return (data ?? { thread: null, messages: [] }) as DoctorSupportChat;
}

export async function sendAdminDoctorSupportMessage(threadId: string, message: string) {
  const { data, error } = await requireSupabase().rpc('admin_send_doctor_support_message', { p_thread_id: threadId, p_message: message });
  if (error) throw error;
  return String(data);
}

export async function setAdminDoctorSupportStatus(threadId: string, status: 'open' | 'closed') {
  const { error } = await requireSupabase().rpc('admin_set_doctor_support_status', { p_thread_id: threadId, p_status: status });
  if (error) throw error;
}

export async function submitMyDoctorFeedback(reportType: 'feedback' | 'bug', subject: string, message: string) {
  const { data, error } = await requireSupabase().rpc('submit_my_doctor_feedback', {
    p_report_type: reportType,
    p_subject: subject,
    p_message: message,
  });
  if (error) throw error;
  return String(data);
}

export async function getMyDoctorFeedback() {
  const { data, error } = await requireSupabase().rpc('get_my_doctor_feedback');
  if (error) throw error;
  return (data ?? []) as DoctorFeedbackReport[];
}

export async function getAdminDoctorFeedback(limit = 100, offset = 0) {
  const { data, error } = await requireSupabase().rpc('admin_get_doctor_feedback', { p_limit: limit, p_offset: offset });
  if (error) throw error;
  return (data ?? []) as DoctorFeedbackReport[];
}

export async function updateAdminDoctorFeedback(id: string, status: DoctorFeedbackReport['status'], adminNote: string | null) {
  const { error } = await requireSupabase().rpc('admin_update_doctor_feedback', {
    p_id: id,
    p_status: status,
    p_admin_note: adminNote,
  });
  if (error) throw error;
}

export async function getDoctorHelpPages() {
  const { data, error } = await requireSupabase()
    .from('content_pages')
    .select('slug,title_bn,title_en,body_bn,body_en,updated_at')
    .in('slug', ['faq', 'help'])
    .eq('is_published', true)
    .order('slug');
  if (error) throw error;
  return (data ?? []) as Array<{
    slug: 'faq' | 'help';
    title_bn: string;
    title_en: string | null;
    body_bn: string;
    body_en: string | null;
    updated_at: string;
  }>;
}
