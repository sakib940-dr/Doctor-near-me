-- STEP 72 — Blood fulfillment ledger, recent-request privacy and direct-request anti-spam
-- Run after Step 71.

-- -----------------------------------------------------------------------------
-- 1) Auditable per-donor fulfillment ledger.
-- One donor can be confirmed once for a request, preventing accidental double
-- counting. Clients have no direct DML; all writes go through the owner RPC.
-- -----------------------------------------------------------------------------
create table if not exists public.blood_request_fulfillments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  confirmed_by uuid not null references public.profiles(id) on delete cascade,
  units integer not null check(units between 1 and 20),
  confirmed_at timestamptz not null default now(),
  unique(request_id,donor_id)
);

create index if not exists idx_blood_fulfillments_request
  on public.blood_request_fulfillments(request_id,confirmed_at desc);
create index if not exists idx_blood_fulfillments_donor
  on public.blood_request_fulfillments(donor_id,confirmed_at desc);

alter table public.blood_request_fulfillments enable row level security;

drop policy if exists "blood_fulfillments_participant_read" on public.blood_request_fulfillments;
create policy "blood_fulfillments_participant_read"
on public.blood_request_fulfillments
for select
using(
  donor_id=auth.uid()
  or exists(
    select 1 from public.blood_requests r
    where r.id=request_id and r.requester_id=auth.uid()
  )
  or public.is_admin_or_above()
);

revoke all on table public.blood_request_fulfillments from anon,authenticated;
grant select on table public.blood_request_fulfillments to service_role;

create or replace function public.confirm_blood_donation(
  p_request_id uuid,
  p_donor_id uuid,
  p_units integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  request_row public.blood_requests%rowtype;
  donor_response_status text;
  fulfilled_units integer;
  next_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active'
  ) then
    raise exception 'Only active patient accounts can confirm blood donations';
  end if;

  if p_units is null or p_units not between 1 and 20 then
    raise exception 'DONATION_UNITS_INVALID';
  end if;

  select * into request_row
  from public.blood_requests
  where id=p_request_id
  for update;

  if request_row.id is null then
    raise exception 'BLOOD_REQUEST_NOT_FOUND';
  end if;

  if request_row.requester_id<>auth.uid() then
    raise exception 'BLOOD_REQUEST_OWNER_REQUIRED';
  end if;

  if request_row.status not in ('open','partially_fulfilled') then
    raise exception 'BLOOD_REQUEST_NOT_ACTIVE';
  end if;

  if exists(
    select 1 from public.blood_request_fulfillments f
    where f.request_id=p_request_id and f.donor_id=p_donor_id
  ) then
    raise exception 'DONATION_ALREADY_CONFIRMED';
  end if;

  select r.status into donor_response_status
  from public.blood_request_responses r
  where r.request_id=p_request_id and r.donor_id=p_donor_id;

  if donor_response_status is null then
    raise exception 'DONOR_RESPONSE_REQUIRED';
  end if;

  if donor_response_status not in ('interested','accepted') then
    raise exception 'DONOR_RESPONSE_NOT_CONFIRMABLE';
  end if;

  insert into public.blood_request_fulfillments(
    request_id,donor_id,confirmed_by,units
  )
  values(p_request_id,p_donor_id,auth.uid(),p_units);

  select coalesce(sum(f.units),0)::integer into fulfilled_units
  from public.blood_request_fulfillments f
  where f.request_id=p_request_id;

  next_status:=case
    when fulfilled_units>=request_row.units_needed then 'fulfilled'
    else 'partially_fulfilled'
  end;

  update public.blood_requests
  set status=next_status,updated_at=now()
  where id=p_request_id;

  update public.blood_request_responses
  set status='completed',updated_at=now()
  where request_id=p_request_id and donor_id=p_donor_id;

  return jsonb_build_object(
    'request_id',p_request_id,
    'donor_id',p_donor_id,
    'units_fulfilled',fulfilled_units,
    'units_needed',request_row.units_needed,
    'status',next_status
  );
end;
$$;

revoke all on function public.confirm_blood_donation(uuid,uuid,integer) from public,anon;
grant execute on function public.confirm_blood_donation(uuid,uuid,integer) to authenticated,service_role;

-- Return the fulfillment total with each owner request. PostgreSQL requires the
-- old function object to be replaced because its table return shape changes.
drop function if exists public.get_my_blood_requests();

create function public.get_my_blood_requests()
returns table(
  request_id uuid,
  patient_name text,
  blood_group text,
  units_needed integer,
  units_fulfilled integer,
  hospital_name text,
  hospital_address text,
  district_id bigint,
  upazila_id bigint,
  needed_at timestamptz,
  reason text,
  contact_phone text,
  status text,
  response_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='patient' and p.account_status='active'
  ) then
    raise exception 'Only active patient accounts can read blood requests';
  end if;

  return query
  select
    r.id,r.patient_name,r.blood_group,r.units_needed,
    coalesce((
      select sum(f.units)::integer
      from public.blood_request_fulfillments f
      where f.request_id=r.id
    ),0),
    r.hospital_name,r.hospital_address,r.district_id,r.upazila_id,
    r.needed_at,r.reason,r.contact_phone,r.status,
    (select count(*) from public.blood_request_responses x where x.request_id=r.id),
    r.created_at,r.updated_at
  from public.blood_requests r
  where r.requester_id=auth.uid()
  order by r.created_at desc,r.id;
end;
$$;

revoke all on function public.get_my_blood_requests() from public,anon;
grant execute on function public.get_my_blood_requests() to authenticated,service_role;

-- -----------------------------------------------------------------------------
-- 2) The recent request feed is used only inside the authenticated /blood route.
-- Keep contact_phone available to authenticated patients, but make anonymous
-- execution impossible and enforce the same role boundary inside the RPC.
-- -----------------------------------------------------------------------------
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
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='patient' and p.account_status='active'
  ) then
    raise exception 'Only active patient accounts can read recent blood requests';
  end if;

  return query
  select r.id,r.patient_name,r.blood_group,r.district_id,r.upazila_id,
         r.contact_phone,r.needed_at,r.status,r.created_at
  from public.blood_requests r
  where r.status in ('open','partially_fulfilled')
    and (r.needed_at is null or r.needed_at>=now())
  order by r.created_at desc,r.id
  limit greatest(1,least(coalesce(p_limit,10),10));
end;
$$;

revoke all on function public.get_recent_active_blood_requests(integer) from public,anon;
grant execute on function public.get_recent_active_blood_requests(integer) to authenticated,service_role;

-- -----------------------------------------------------------------------------
-- 3) Direct-request cooldown and rolling rate limit.
-- Canonical notifications provide an immutable-enough delivery trail across
-- open, cancelled, fulfilled and expired request states. Broadcast delivery is
-- included in the same-donor cooldown to prevent an immediate direct follow-up.
-- -----------------------------------------------------------------------------
create index if not exists idx_blood_notification_sender_recipient_rate
  on public.notifications(sender_id,recipient_id,type,created_at desc)
  where type in ('blood_request','blood_direct_request');

create or replace function public.send_blood_request_to_donor(
  p_donor_id uuid,
  p_patient_name text,
  p_hospital_address text default null,
  p_needed_at timestamptz default null,
  p_contact_phone text default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  request_id uuid;
  donor record;
  recent_direct_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active'
  ) then
    raise exception 'Only active patient accounts can send blood requests';
  end if;

  if p_patient_name is null or length(trim(p_patient_name))<2 then
    raise exception 'Patient name is required';
  end if;

  select b.* into donor
  from public.blood_donor_profiles b
  join public.profiles p on p.id=b.user_id
  where b.user_id=p_donor_id
    and b.is_volunteer=true
    and b.available_for_requests=true
    and p.role='patient'
    and p.account_status='active';

  if donor.user_id is null then
    raise exception 'Donor is unavailable';
  end if;

  if donor.last_donation_date is not null
     and donor.last_donation_date>current_date-120 then
    raise exception 'DONOR_NOT_ELIGIBLE_YET: eligible on %',donor.last_donation_date+120;
  end if;

  -- Serialize direct-request checks per requester so concurrent calls cannot
  -- race through the cooldown/rate-limit windows.
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));

  if exists(
    select 1
    from public.notifications n
    where n.sender_id=auth.uid()
      and n.recipient_id=p_donor_id
      and n.type in ('blood_request','blood_direct_request')
      and n.created_at>=now()-interval '24 hours'
  ) then
    raise exception 'BLOOD_DONOR_COOLDOWN_ACTIVE';
  end if;

  select count(*)::integer into recent_direct_count
  from public.notifications n
  where n.sender_id=auth.uid()
    and n.type='blood_direct_request'
    and n.created_at>=now()-interval '1 hour';

  if recent_direct_count>=10 then
    raise exception 'BLOOD_DIRECT_REQUEST_RATE_LIMIT';
  end if;

  insert into public.blood_requests(
    requester_id,patient_name,blood_group,
    hospital_address,needed_at,contact_phone,reason,status,
    district_id,upazila_id
  )
  values(
    auth.uid(),trim(p_patient_name),donor.blood_group,
    nullif(trim(coalesce(p_hospital_address,'')),''),p_needed_at,
    nullif(trim(coalesce(p_contact_phone,'')),''),nullif(trim(coalesce(p_message,'')),''),'open',
    donor.district_id,donor.upazila_id
  )
  returning id into request_id;

  insert into public.notifications(
    recipient_id,sender_id,type,title_bn,body_bn,data
  )
  values(
    p_donor_id,auth.uid(),'blood_direct_request',
    'নতুন রক্তের অনুরোধ',
    'আপনার রক্তের গ্রুপের জন্য একটি নতুন অনুরোধ এসেছে।',
    jsonb_build_object(
      'blood_request_id',request_id,
      'blood_group',donor.blood_group,
      'district_id',donor.district_id,
      'upazila_id',donor.upazila_id,
      'needed_at',p_needed_at,
      'patient_name',trim(p_patient_name),
      'hospital_address',nullif(trim(coalesce(p_hospital_address,'')),''),
      'deep_link','/blood?tab=respond'
    )
  );

  return request_id;
end;
$$;

revoke all on function public.send_blood_request_to_donor(uuid,text,text,timestamptz,text,text) from public,anon;
grant execute on function public.send_blood_request_to_donor(uuid,text,text,timestamptz,text,text) to authenticated,service_role;

do $$
begin
  if not exists(
    select 1 from information_schema.tables
    where table_schema='public' and table_name='blood_request_fulfillments'
  ) then
    raise exception 'STEP 72 failed: fulfillment ledger is missing';
  end if;

  if to_regprocedure('public.confirm_blood_donation(uuid,uuid,integer)') is null then
    raise exception 'STEP 72 failed: confirm_blood_donation RPC is missing';
  end if;

  if has_function_privilege('anon','public.get_recent_active_blood_requests(integer)','EXECUTE') then
    raise exception 'STEP 72 failed: anon recent blood request access remains';
  end if;

  if not has_function_privilege('authenticated','public.get_recent_active_blood_requests(integer)','EXECUTE') then
    raise exception 'STEP 72 failed: authenticated recent blood request access is missing';
  end if;

  if has_table_privilege('authenticated','public.blood_request_fulfillments','INSERT')
     or has_table_privilege('authenticated','public.blood_request_fulfillments','UPDATE')
     or has_table_privilege('authenticated','public.blood_request_fulfillments','DELETE') then
    raise exception 'STEP 72 failed: direct fulfillment table mutation remains';
  end if;
end;
$$;

select 'STEP 72 BLOOD FULFILLMENT PRIVACY ANTISPAM PASSED' as result;
