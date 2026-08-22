-- STEP 68 Visitor Blood Flow Final Hardening
-- Backward compatible: keeps existing blood tables and RPC contracts.

-- Ensure recent public requests only expose active requests.
create or replace function public.get_recent_active_blood_requests(
  p_limit integer default 10
)
returns table(
  request_id uuid,
  patient_name text,
  blood_group text,
  district_id bigint,
  upazila_id bigint,
  contact_phone text,
  needed_at timestamptz,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select id, patient_name, blood_group, district_id, upazila_id,
         contact_phone, needed_at, status, created_at
  from public.blood_requests
  where status in ('open','partially_fulfilled')
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit,10),10));
$$;

-- Direct donor request safety:
-- same visitor cannot create duplicate active request to same donor.
create unique index if not exists ux_active_direct_blood_request_pair
on public.blood_request_responses(request_id, donor_id)
where status in ('pending','interested','accepted');

create index if not exists idx_blood_donor_match_active_group_district
on public.blood_donor_profiles(blood_group,district_id,available_for_requests,is_volunteer);

-- Notification read state remains managed by existing notification module.
create index if not exists idx_notifications_blood_unread
on public.notifications(recipient_id, read_at, created_at desc);
