-- STEP 69 — Blood Alert Notification Enrichment
-- Non-destructive extension. Keeps existing table shapes, RPC names,
-- and parameter signatures untouched — only widens the JSON payload
-- already stored in public.notifications.data so the "respond" UI
-- (added in the app) has enough context to render without an extra
-- round trip, and so it degrades safely for any older, unread
-- notifications that predate this migration (missing keys are
-- treated as null by the frontend).

-- ------------------------------------------------------------
-- BROADCAST MATCH: create_blood_request_and_notify
-- Adds patient_name / hospital_name / units_needed to the
-- notification payload sent to each matching volunteer.
-- Still never includes contact_phone here — phone stays behind
-- the existing consent-gated response/reveal flow.
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
      'আপনার রক্তের গ্রুপের একজন রোগীর জন্য রক্তের প্রয়োজন হয়েছে। বিস্তারিত দেখতে অনুরোধটি খুলুন।',
      jsonb_build_object(
        'blood_request_id',new_request,
        'blood_group',upper(trim(p_blood_group)),
        'district_id',p_district_id,
        'upazila_id',p_upazila_id,
        'needed_at',p_needed_at,
        'patient_name',trim(p_patient_name),
        'hospital_name',nullif(trim(coalesce(p_hospital_name,'')),''),
        'units_needed',p_units_needed
      )
    )
    on conflict do nothing;

    notified := notified + 1;
  end loop;

  return new_request;
end;
$$;

-- ------------------------------------------------------------
-- DIRECT DONOR REQUEST: send_blood_request_to_donor
-- Previously the notification only carried blood_request_id,
-- forcing the donor to open a separate screen to learn anything
-- about the request. Now includes blood_group (from the donor's
-- own profile, unchanged behaviour), patient_name, hospital
-- context and needed_at directly in the payload.
-- Signature is unchanged — safe to re-run against an existing app.
-- ------------------------------------------------------------
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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into donor
  from public.blood_donor_profiles
  where user_id=p_donor_id
    and is_volunteer=true
    and available_for_requests=true;

  if donor.user_id is null then
    raise exception 'Donor is unavailable';
  end if;

  if exists(
    select 1 from public.blood_request_responses
    where request_id in (
      select id from public.blood_requests
      where requester_id=auth.uid()
        and status in ('open','partially_fulfilled')
    )
    and donor_id=p_donor_id
  ) then
    raise exception 'Duplicate donor request';
  end if;

  insert into public.blood_requests(
    requester_id, patient_name, blood_group,
    hospital_address, needed_at, contact_phone, reason, status,
    district_id, upazila_id
  )
  values(
    auth.uid(), p_patient_name, donor.blood_group,
    p_hospital_address, p_needed_at, p_contact_phone, p_message, 'open',
    donor.district_id, donor.upazila_id
  )
  returning id into request_id;

  insert into public.notifications(
    recipient_id, sender_id, type, title_bn, body_bn, data
  )
  values(
    p_donor_id, auth.uid(), 'blood_direct_request',
    'নতুন রক্তের অনুরোধ',
    'আপনার রক্তের গ্রুপের জন্য একটি নতুন অনুরোধ এসেছে।',
    jsonb_build_object(
      'blood_request_id',request_id,
      'blood_group',donor.blood_group,
      'district_id',donor.district_id,
      'upazila_id',donor.upazila_id,
      'needed_at',p_needed_at,
      'patient_name',p_patient_name,
      'hospital_address',nullif(trim(coalesce(p_hospital_address,'')),'')
    )
  );

  return request_id;
end;
$$;
