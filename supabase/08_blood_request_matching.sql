-- ============================================================
-- STEP 8 — BLOOD REQUEST MATCHING + NOTIFICATION ENGINE
-- Run ONLY this file now.
-- Previous migrations are stored separately.
-- ============================================================

-- ------------------------------------------------------------
-- CREATE BLOOD REQUEST + NOTIFY MATCHING VOLUNTEERS
-- Matches exact blood group, prioritizing same upazila/district.
-- Phone is NOT exposed in the notification.
-- ------------------------------------------------------------
create or replace function public.create_blood_request_and_notify(
  p_patient_name text,
  p_blood_group text,
  p_units_needed integer default 1,
  p_hospital_name text default null,
  p_hospital_address text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_needed_at timestamptz default null,
  p_reason text default null,
  p_contact_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  new_request uuid;
  donor record;
  notified integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid()
      and role='patient'
      and account_status='active'
  ) then
    raise exception 'Only active patient accounts can create blood requests';
  end if;

  if p_patient_name is null or length(trim(p_patient_name)) < 2 then
    raise exception 'Patient name is required';
  end if;

  if p_blood_group is null or length(trim(p_blood_group))=0 then
    raise exception 'Blood group is required';
  end if;

  if p_units_needed not between 1 and 20 then
    raise exception 'Units must be between 1 and 20';
  end if;

  insert into public.blood_requests(
    requester_id,patient_name,blood_group,units_needed,
    hospital_name,hospital_address,district_id,upazila_id,
    needed_at,reason,contact_phone,status
  )
  values(
    auth.uid(),trim(p_patient_name),upper(trim(p_blood_group)),p_units_needed,
    nullif(trim(p_hospital_name),''),nullif(trim(p_hospital_address),''),
    p_district_id,p_upazila_id,p_needed_at,
    nullif(trim(p_reason),''),p_contact_phone,'open'
  )
  returning id into new_request;

  -- Notify up to 100 closest-area matching volunteers.
  for donor in
    select b.user_id
    from public.blood_donor_profiles b
    join public.profiles p on p.id=b.user_id
    where b.is_volunteer=true
      and b.available_for_requests=true
      and p.account_status='active'
      and upper(b.blood_group)=upper(trim(p_blood_group))
      and (
        p_upazila_id is null
        or b.upazila_id=p_upazila_id
        or (b.district_id=p_district_id and p_district_id is not null)
      )
    order by
      case when p_upazila_id is not null and b.upazila_id=p_upazila_id then 0 else 1 end,
      case when b.last_donation_date is null then 0 else 1 end,
      b.updated_at desc
    limit 100
  loop
    insert into public.notifications(
      recipient_id,sender_id,type,title_bn,body_bn,data
    )
    values(
      donor.user_id,
      auth.uid(),
      'blood_request',
      'জরুরি রক্তের অনুরোধ',
      'আপনার রক্তের গ্রুপের একজন রোগীর জন্য রক্তের প্রয়োজন হয়েছে। বিস্তারিত দেখতে অনুরোধটি খুলুন।',
      jsonb_build_object(
        'blood_request_id',new_request,
        'blood_group',upper(trim(p_blood_group)),
        'district_id',p_district_id,
        'upazila_id',p_upazila_id,
        'needed_at',p_needed_at
      )
    )
    on conflict do nothing;

    notified := notified + 1;
  end loop;

  return new_request;
end;
$$;

-- ------------------------------------------------------------
-- DONOR RESPONSE — ACCEPT / DECLINE
-- Only a registered volunteer can respond to a request.
-- ------------------------------------------------------------
create or replace function public.respond_to_blood_request(
  p_request_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  request_owner uuid;
  request_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('interested','accepted','declined') then
    raise exception 'Invalid response status';
  end if;

  select requester_id,status
    into request_owner,request_status
  from public.blood_requests
  where id=p_request_id;

  if request_owner is null then
    raise exception 'Blood request not found';
  end if;

  if request_status not in ('open','partially_fulfilled') then
    raise exception 'This blood request is no longer active';
  end if;

  if not exists(
    select 1
    from public.blood_donor_profiles b
    join public.profiles p on p.id=b.user_id
    where b.user_id=auth.uid()
      and b.is_volunteer=true
      and b.available_for_requests=true
      and p.account_status='active'
  ) then
    raise exception 'Only active voluntary donors can respond';
  end if;

  insert into public.blood_request_responses(
    request_id,donor_id,status
  )
  values(p_request_id,auth.uid(),p_status)
  on conflict(request_id,donor_id)
  do update set status=excluded.status,updated_at=now();

  if p_status in ('interested','accepted') then
    insert into public.notifications(
      recipient_id,sender_id,type,title_bn,body_bn,data
    )
    values(
      request_owner,
      auth.uid(),
      'blood_donor_response',
      'রক্তদাতার সাড়া পাওয়া গেছে',
      'একজন স্বেচ্ছাসেবী রক্তদাতা আপনার রক্তের অনুরোধে সাড়া দিয়েছেন।',
      jsonb_build_object(
        'blood_request_id',p_request_id,
        'response_status',p_status,
        'donor_id',auth.uid()
      )
    );
  end if;

  return true;
end;
$$;

-- ------------------------------------------------------------
-- REQUESTER: SEE RESPONSES
-- Donor phone is returned only when the donor explicitly made
-- the phone public. The requester can then contact the donor.
-- ------------------------------------------------------------
create or replace function public.get_my_blood_request_responses(
  p_request_id uuid
)
returns table(
  response_id uuid,
  donor_id uuid,
  donor_name text,
  phone text,
  blood_group text,
  district_id bigint,
  upazila_id bigint,
  last_donation_date date,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $$
  select r.id,
         r.donor_id,
         p.full_name,
         case when b.phone_public=true and p.public_phone=true then p.phone else null end,
         b.blood_group,
         b.district_id,
         b.upazila_id,
         b.last_donation_date,
         r.status,
         r.created_at
  from public.blood_request_responses r
  join public.blood_requests q on q.id=r.request_id
  join public.profiles p on p.id=r.donor_id
  join public.blood_donor_profiles b on b.user_id=r.donor_id
  where r.request_id=p_request_id
    and q.requester_id=auth.uid()
  order by
    case when r.status='accepted' then 0
         when r.status='interested' then 1
         else 2 end,
    r.created_at desc;
$$;

-- ------------------------------------------------------------
-- CANCEL BLOOD REQUEST
-- ------------------------------------------------------------
create or replace function public.cancel_my_blood_request(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.blood_requests
  set status='cancelled',updated_at=now()
  where id=p_request_id
    and requester_id=auth.uid()
    and status in ('open','partially_fulfilled');

  return found;
end;
$$;

-- ------------------------------------------------------------
-- AUTO-EXPIRE OLD REQUESTS
-- Can be called periodically by a scheduled job later.
-- ------------------------------------------------------------
create or replace function public.expire_old_blood_requests()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  affected integer;
begin
  update public.blood_requests
  set status='expired',updated_at=now()
  where status in ('open','partially_fulfilled')
    and needed_at is not null
    and needed_at < now();

  get diagnostics affected=row_count;
  return affected;
end;
$$;

create index if not exists idx_blood_donor_match
  on public.blood_donor_profiles(
    blood_group,is_volunteer,available_for_requests,
    upazila_id,district_id,updated_at desc
  );

create index if not exists idx_blood_response_donor
  on public.blood_request_responses(donor_id,status,created_at desc);

-- ============================================================
-- END STEP 8
-- ============================================================
