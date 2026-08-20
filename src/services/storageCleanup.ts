import { requireSupabase } from '../lib/supabase';
import type { AdminStorageCleanupObject, AdminStorageCleanupResult, AdminStorageCleanupSummary } from '../types';

const MANAGED_BUCKETS = new Set(['avatars', 'public-images', 'verification-documents']);

function normalizeSummary(value: unknown): AdminStorageCleanupSummary {
  const row = (value ?? {}) as Record<string, unknown>;
  const number = (key: string) => Number(row[key] ?? 0);
  const nullableNumber = (key: string) => row[key] == null ? null : Number(row[key]);
  const warning = String(row.warning_level ?? 'unknown');
  return {
    total_files: number('total_files'),
    referenced_files: number('referenced_files'),
    orphan_files: number('orphan_files'),
    recent_unreferenced_files: number('recent_unreferenced_files'),
    total_bytes: number('total_bytes'),
    orphan_bytes: number('orphan_bytes'),
    grace_hours: number('grace_hours') || 24,
    quota_bytes: nullableNumber('quota_bytes'),
    usage_percent: nullableNumber('usage_percent'),
    warning_level: ['unknown', 'normal', 'notice', 'warning', 'critical'].includes(warning)
      ? warning as AdminStorageCleanupSummary['warning_level'] : 'unknown',
    notice_percent: number('notice_percent') || 70,
    warning_percent: number('warning_percent') || 85,
    critical_percent: number('critical_percent') || 95,
    expired_push_subscriptions: number('expired_push_subscriptions'),
  };
}

export async function getAdminStorageCleanupSummary() {
  const { data, error } = await requireSupabase().rpc('get_admin_storage_cleanup_summary');
  if (error) throw error;
  return normalizeSummary(data);
}

export async function getAdminStorageCleanupPreview(limit = 100) {
  const { data, error } = await requireSupabase().rpc('get_admin_storage_cleanup_preview', {
    p_limit: Math.max(1, Math.min(500, Math.trunc(limit))),
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    bucket_id: String(row.bucket_id) as AdminStorageCleanupObject['bucket_id'],
    name: String(row.name ?? ''),
    size_bytes: Number(row.size_bytes ?? 0),
    created_at: String(row.created_at ?? ''),
    age_hours: Number(row.age_hours ?? 0),
  })).filter((row: AdminStorageCleanupObject) => MANAGED_BUCKETS.has(row.bucket_id) && row.name);
}

export async function saveAdminStorageCleanupPolicy(quotaBytes: number | null, graceHours: number) {
  const { data, error } = await requireSupabase().rpc('save_admin_storage_cleanup_policy', {
    p_quota_bytes: quotaBytes,
    p_grace_hours: Math.max(1, Math.min(168, Math.trunc(graceHours))),
  });
  if (error) throw error;
  return Boolean(data);
}

async function removeOne(row: AdminStorageCleanupObject) {
  const { data, error } = await requireSupabase().storage.from(row.bucket_id).remove([row.name]);
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) throw new Error('Storage object was not removed. It may now be referenced or grace-protected.');
}

export async function safeCleanupStorageObjects(rows: AdminStorageCleanupObject[]): Promise<AdminStorageCleanupResult> {
  const unique = new Map<string, AdminStorageCleanupObject>();
  for (const row of rows) {
    if (!MANAGED_BUCKETS.has(row.bucket_id) || !row.name) continue;
    unique.set(`${row.bucket_id}:${row.name}`, row);
  }

  let deletedObjects = 0;
  let deletedBytes = 0;
  let failedObjects = 0;

  // Delete individually on purpose: Storage RLS re-checks current reference + grace
  // for every object, making stale Admin previews safe if a file became referenced.
  for (const row of unique.values()) {
    try {
      await removeOne(row);
      deletedObjects += 1;
      deletedBytes += Math.max(0, row.size_bytes || 0);
    } catch {
      failedObjects += 1;
    }
  }

  const { data, error } = await requireSupabase().rpc('admin_finalize_storage_cleanup', {
    p_deleted_count: deletedObjects,
    p_deleted_bytes: deletedBytes,
    p_failed_count: failedObjects,
  });
  if (error) throw error;
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    deleted_objects: deletedObjects,
    deleted_bytes: deletedBytes,
    failed_objects: failedObjects,
    expired_push_subscriptions_deleted: Number(result.expired_push_subscriptions_deleted ?? 0),
  };
}
