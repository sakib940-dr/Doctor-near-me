-- ============================================================
-- STEP 57 — ADMIN ACTION CENTER + PREMIUM MANAGEMENT SUPPORT
-- Extends the existing Admin summary RPC only.
-- Premium membership tables, RLS and decision RPC remain unchanged.
-- No SEO/domain changes. Safe to re-run.
-- ============================================================

create or replace function public.get_admin_operational_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_admin_or_above() then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'total_users',(select count(*) from public.profiles),
    'active_users',(select count(*) from public.profiles where account_status='active'),
    'suspended_users',(select count(*) from public.profiles where account_status='suspended'),
    'banned_users',(select count(*) from public.profiles where account_status='banned'),

    'doctors',(select count(*) from public.doctors),
    'providers',(select count(*) from public.providers),
    'ambulances',(select count(*) from public.ambulance_services),
    'patients',(select count(*) from public.profiles where role::text='patient'),
    'hospitals',(select count(*) from public.providers where provider_type='hospital'),
    'premium_members',(
      select count(*) from public.premium_memberships
      where status='active' and (expires_at is null or expires_at>now())
    ),
    'verified_doctors',(select count(*) from public.doctors where verification_status='approved'),
    'total_appointments',(select count(*) from public.appointments),
    'total_prescriptions',(select count(*) from public.doctor_prescriptions),
    'total_reviews',
      (select count(*) from public.doctor_reviews)+
      (select count(*) from public.provider_reviews),

    'pending_doctors',(select count(*) from public.doctors where verification_status='pending'),
    'pending_providers',(select count(*) from public.providers where status='pending'),
    'pending_ambulances',(select count(*) from public.ambulance_services where status='pending'),
    'pending_verifications',
      (select count(*) from public.doctors where verification_status='pending')+
      (select count(*) from public.providers where status='pending')+
      (select count(*) from public.ambulance_services where status='pending'),

    -- Action Center: split the important queues without creating new counters.
    'pending_doctor_verifications',(select count(*) from public.doctors where verification_status='pending'),
    'pending_hospital_verifications',(
      select count(*) from public.providers
      where provider_type='hospital' and status='pending'
    ),
    'pending_premium_memberships',(select count(*) from public.premium_memberships where status='pending'),
    'premium_requests',(select count(*) from public.premium_memberships where status='pending'),
    'expiring_premium_memberships',(
      select count(*) from public.premium_memberships
      where status='active'
        and expires_at is not null
        and expires_at>now()
        and expires_at<=now()+interval '30 days'
    ),

    -- There is currently no review-report/flag table in the existing project.
    -- UI must not invent a moderation queue; it stays hidden until such a source exists.
    'flagged_reviews_supported',false,
    'flagged_reviews',0,

    'appointments_today',(select count(*) from public.appointments where appointment_date=current_date),
    'pending_appointments',(select count(*) from public.appointments where status='pending'),
    'appointments_last_30_days',(select count(*) from public.appointments where created_at>=now()-interval '30 days'),

    -- Existing Web Push outbox is a real operational source. Only failed rows are surfaced.
    'failed_push_deliveries',(select count(*) from public.web_push_outbox where status='failed'),

    'role_counts',coalesce((select jsonb_object_agg(role::text,total) from (
      select role,count(*)::bigint total from public.profiles group by role
    ) role_totals),'{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_operational_summary() from public,anon;
grant execute on function public.get_admin_operational_summary() to authenticated,service_role;

-- Safety assertions: Premium remains Admin-controlled through the existing
-- admin_decide_premium_membership() RPC. Doctor/Hospital owners still cannot
-- directly mutate Premium membership rows.
do $assert$
begin
  if has_table_privilege('authenticated','public.premium_memberships','INSERT') then
    raise exception 'STEP57: authenticated direct Premium INSERT grant detected';
  end if;
  if has_table_privilege('authenticated','public.premium_memberships','UPDATE') then
    raise exception 'STEP57: authenticated direct Premium UPDATE grant detected';
  end if;
  if has_table_privilege('authenticated','public.premium_memberships','DELETE') then
    raise exception 'STEP57: authenticated direct Premium DELETE grant detected';
  end if;
end;
$assert$;

select 'STEP 57 ADMIN ACTION CENTER + PREMIUM MANAGEMENT PASSED' as result;
