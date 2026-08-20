-- ============================================================
-- STEP 53 — ADMIN DASHBOARD SUMMARY METRICS
-- Extends the existing admin operational summary RPC only.
-- No new tables, no parallel admin system, no SEO/domain changes.
-- Safe to re-run.
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
    'pending_premium_memberships',(select count(*) from public.premium_memberships where status='pending'),

    'appointments_today',(select count(*) from public.appointments where appointment_date=current_date),
    'pending_appointments',(select count(*) from public.appointments where status='pending'),
    'appointments_last_30_days',(select count(*) from public.appointments where created_at>=now()-interval '30 days'),
    'role_counts',coalesce((select jsonb_object_agg(role::text,total) from (
      select role,count(*)::bigint total from public.profiles group by role
    ) role_totals),'{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_operational_summary() from public,anon;
grant execute on function public.get_admin_operational_summary() to authenticated,service_role;

select 'STEP 53 ADMIN DASHBOARD SUMMARY METRICS PASSED' as result;
