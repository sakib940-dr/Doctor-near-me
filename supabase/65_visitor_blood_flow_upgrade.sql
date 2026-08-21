-- STEP 65 Visitor blood flow upgrade
-- Non destructive extension for visitor blood request experience.

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
 limit greatest(1,least(p_limit,10));
$$;

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
    hospital_address, needed_at, contact_phone, reason, status
  )
  values(
    auth.uid(), p_patient_name, donor.blood_group,
    p_hospital_address, p_needed_at, p_contact_phone, p_message, 'open'
  )
  returning id into request_id;

  insert into public.notifications(
    recipient_id, sender_id, type, title_bn, body_bn, data
  )
  values(
    p_donor_id, auth.uid(), 'blood_direct_request',
    'নতুন রক্তের অনুরোধ',
    'আপনার রক্তের গ্রুপের জন্য একটি নতুন অনুরোধ এসেছে।',
    jsonb_build_object('blood_request_id',request_id)
  );

  return request_id;
end;
$$;
