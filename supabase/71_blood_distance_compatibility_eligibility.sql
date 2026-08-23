-- STEP 71 — Blood distance ranking, compatibility and donor eligibility
-- Run after Step 70.
-- Reuses public.location_distance_km() from Step 02; PostGIS is not required.

-- Standard red-cell donor compatibility. The first argument is the recipient's
-- requested group and the second is the donor's group.
create or replace function public.is_blood_donor_compatible(
  p_recipient_blood_group text,
  p_donor_blood_group text
)
returns boolean
language sql
immutable
strict
set search_path=public
as $$
  select case upper(trim(p_recipient_blood_group))
    when 'O-'  then upper(trim(p_donor_blood_group)) in ('O-')
    when 'O+'  then upper(trim(p_donor_blood_group)) in ('O-','O+')
    when 'A-'  then upper(trim(p_donor_blood_group)) in ('O-','A-')
    when 'A+'  then upper(trim(p_donor_blood_group)) in ('O-','O+','A-','A+')
    when 'B-'  then upper(trim(p_donor_blood_group)) in ('O-','B-')
    when 'B+'  then upper(trim(p_donor_blood_group)) in ('O-','O+','B-','B+')
    when 'AB-' then upper(trim(p_donor_blood_group)) in ('O-','A-','B-','AB-')
    when 'AB+' then upper(trim(p_donor_blood_group)) in ('O-','O+','A-','A+','B-','B+','AB-','AB+')
    else false
  end;
$$;

revoke all on function public.is_blood_donor_compatible(text,text) from public,anon;
grant execute on function public.is_blood_donor_compatible(text,text) to authenticated,service_role;

-- Add the authenticated patient's last saved private location to their own
-- profile payload. No other user's exact coordinates are exposed.
create or replace function public.get_my_patient_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active'
  ) then
    raise exception 'Only active patient accounts can read the patient profile';
  end if;

  select jsonb_build_object(
    'user_id',p.id,
    'full_name',p.full_name,
    'email',p.email,
    'phone',p.phone,
    'date_of_birth',p.date_of_birth,
    'gender',p.gender,
    'blood_group',p.blood_group,
    'address_line',p.address_line,
    'district_id',p.district_id,
    'upazila_id',p.upazila_id,
    'emergency_contact_name',p.emergency_contact_name,
    'emergency_contact_phone',p.emergency_contact_phone,
    'preferred_language',p.preferred_language,
    'profile_completed',p.profile_completed,
    'latitude',l.latitude,
    'longitude',l.longitude
  )
  into result
  from public.profiles p
  left join public.user_current_locations l on l.user_id=p.id
  where p.id=auth.uid()
    and p.role='patient'
    and p.account_status='active';

  return result;
end;
$$;

revoke all on function public.get_my_patient_profile() from public,anon;
grant execute on function public.get_my_patient_profile() to authenticated,service_role;

-- The return shape and signature both change, so PostgreSQL requires replacing
-- the old function object while preserving its canonical RPC name.
drop function if exists public.search_blood_donors(text,bigint,bigint,integer,integer);

create function public.search_blood_donors(
  p_blood_group text,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_include_compatible boolean default false
)
returns table(
  donor_id uuid,
  donor_name text,
  phone text,
  blood_group text,
  district_id bigint,
  upazila_id bigint,
  last_donation_date date,
  distance_km double precision
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
    raise exception 'Only active patient accounts can search the blood bank';
  end if;

  if nullif(trim(p_blood_group),'') is null
     or upper(trim(p_blood_group)) not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then
    raise exception 'Valid blood group is required';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be provided together';
  end if;

  if (p_latitude is not null and not (p_latitude between -90 and 90))
     or (p_longitude is not null and not (p_longitude between -180 and 180)) then
    raise exception 'Invalid search coordinates';
  end if;

  return query
  select
    p.id,
    p.full_name,
    case when b.phone_public=true and p.public_phone=true then p.phone else null end,
    b.blood_group,
    b.district_id,
    b.upazila_id,
    b.last_donation_date,
    case
      when p_latitude is not null and p_longitude is not null
       and b.latitude is not null and b.longitude is not null
       and b.latitude between -90 and 90 and b.longitude between -180 and 180
      then round(public.location_distance_km(
        p_latitude,p_longitude,b.latitude,b.longitude
      )::numeric,1)::double precision
      else null
    end
  from public.blood_donor_profiles b
  join public.profiles p on p.id=b.user_id
  where b.is_volunteer=true
    and b.available_for_requests=true
    and p.account_status='active'
    and p.role='patient'
    and (b.last_donation_date is null or b.last_donation_date<=current_date-120)
    and (
      (coalesce(p_include_compatible,false)=false and upper(b.blood_group)=upper(trim(p_blood_group)))
      or
      (coalesce(p_include_compatible,false)=true and public.is_blood_donor_compatible(p_blood_group,b.blood_group))
    )
    and (p_district_id is null or b.district_id=p_district_id)
    and (p_upazila_id is null or b.upazila_id=p_upazila_id)
  order by
    case
      when p_latitude is not null and p_longitude is not null
       and b.latitude is not null and b.longitude is not null
       and b.latitude between -90 and 90 and b.longitude between -180 and 180 then 0
      else 1
    end,
    case
      when p_latitude is not null and p_longitude is not null
       and b.latitude is not null and b.longitude is not null
       and b.latitude between -90 and 90 and b.longitude between -180 and 180
      then public.location_distance_km(p_latitude,p_longitude,b.latitude,b.longitude)
      else null
    end nulls last,
    case when p_upazila_id is not null and b.upazila_id=p_upazila_id then 0 else 1 end,
    case when p_district_id is not null and b.district_id=p_district_id then 0 else 1 end,
    case when upper(b.blood_group)=upper(trim(p_blood_group)) then 0 else 1 end,
    b.last_donation_date nulls first,
    p.full_name,p.id
  limit greatest(1,least(coalesce(p_limit,20),50))
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

revoke all on function public.search_blood_donors(text,bigint,bigint,integer,integer,double precision,double precision,boolean) from public,anon;
grant execute on function public.search_blood_donors(text,bigint,bigint,integer,integer,double precision,double precision,boolean) to authenticated,service_role;

-- Add configurable compatible-group broadcast matching. Default remains OFF.
drop function if exists public.create_blood_request_and_notify(text,text,integer,text,text,bigint,bigint,timestamptz,text,text);

create function public.create_blood_request_and_notify(
  p_patient_name text,
  p_blood_group text,
  p_units_needed integer default 1,
  p_hospital_name text default null,
  p_hospital_address text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_needed_at timestamptz default null,
  p_reason text default null,
  p_contact_phone text default null,
  p_include_compatible boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  new_request uuid;
  donor record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active'
  ) then
    raise exception 'Only active patient accounts can create blood requests';
  end if;

  if p_patient_name is null or length(trim(p_patient_name))<2 then
    raise exception 'Patient name is required';
  end if;

  if p_blood_group is null
     or upper(trim(p_blood_group)) not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then
    raise exception 'Valid blood group is required';
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
    nullif(trim(p_reason),''),nullif(trim(coalesce(p_contact_phone,'')),''),'open'
  )
  returning id into new_request;

  for donor in
    select b.user_id
    from public.blood_donor_profiles b
    join public.profiles p on p.id=b.user_id
    where b.is_volunteer=true
      and b.available_for_requests=true
      and p.role='patient'
      and p.account_status='active'
      and (b.last_donation_date is null or b.last_donation_date<=current_date-120)
      and (
        (coalesce(p_include_compatible,false)=false and upper(b.blood_group)=upper(trim(p_blood_group)))
        or
        (coalesce(p_include_compatible,false)=true and public.is_blood_donor_compatible(p_blood_group,b.blood_group))
      )
      and (
        p_upazila_id is null
        or b.upazila_id=p_upazila_id
        or (b.district_id=p_district_id and p_district_id is not null)
      )
    order by
      case when p_upazila_id is not null and b.upazila_id=p_upazila_id then 0 else 1 end,
      case when p_district_id is not null and b.district_id=p_district_id then 0 else 1 end,
      case when upper(b.blood_group)=upper(trim(p_blood_group)) then 0 else 1 end,
      b.last_donation_date nulls first,
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
        'units_needed',p_units_needed,
        'compatible_matching',coalesce(p_include_compatible,false),
        'deep_link','/blood?tab=respond'
      )
    );
  end loop;

  return new_request;
end;
$$;

revoke all on function public.create_blood_request_and_notify(text,text,integer,text,text,bigint,bigint,timestamptz,text,text,boolean) from public,anon;
grant execute on function public.create_blood_request_and_notify(text,text,integer,text,text,bigint,bigint,timestamptz,text,text,boolean) to authenticated,service_role;

-- A donor cannot be targeted directly until the 120-day interval has passed.
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

-- Eligibility and blood compatibility are authoritative at response time too;
-- notification visibility or frontend state can never bypass these checks.
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
  requested_group text;
  donor record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_status not in ('interested','accepted','declined') then
    raise exception 'Invalid response status';
  end if;

  select requester_id,status,blood_group
  into request_owner,request_status,requested_group
  from public.blood_requests
  where id=p_request_id;

  if request_owner is null then
    raise exception 'Blood request not found';
  end if;

  if request_status not in ('open','partially_fulfilled') then
    raise exception 'This blood request is no longer active';
  end if;

  select b.* into donor
  from public.blood_donor_profiles b
  join public.profiles p on p.id=b.user_id
  where b.user_id=auth.uid()
    and b.is_volunteer=true
    and b.available_for_requests=true
    and p.role='patient'
    and p.account_status='active';

  if donor.user_id is null then
    raise exception 'Only active voluntary donors can respond';
  end if;

  if donor.last_donation_date is not null
     and donor.last_donation_date>current_date-120 then
    raise exception 'DONOR_NOT_ELIGIBLE_YET: eligible on %',donor.last_donation_date+120;
  end if;

  if not public.is_blood_donor_compatible(requested_group,donor.blood_group) then
    raise exception 'DONOR_BLOOD_GROUP_INCOMPATIBLE';
  end if;

  insert into public.blood_request_responses(request_id,donor_id,status)
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
        'donor_id',auth.uid(),
        'deep_link','/blood?tab=request'
      )
    );
  end if;

  return true;
end;
$$;

revoke all on function public.respond_to_blood_request(uuid,text) from public,anon;
grant execute on function public.respond_to_blood_request(uuid,text) to authenticated,service_role;

do $$
begin
  if to_regprocedure('public.location_distance_km(double precision,double precision,double precision,double precision)') is null then
    raise exception 'STEP 71 failed: location_distance_km helper is missing';
  end if;

  if to_regprocedure('public.search_blood_donors(text,bigint,bigint,integer,integer,double precision,double precision,boolean)') is null then
    raise exception 'STEP 71 failed: distance-aware donor search is missing';
  end if;

  if to_regprocedure('public.create_blood_request_and_notify(text,text,integer,text,text,bigint,bigint,timestamp with time zone,text,text,boolean)') is null then
    raise exception 'STEP 71 failed: configurable compatible broadcast is missing';
  end if;

  if has_function_privilege('anon','public.search_blood_donors(text,bigint,bigint,integer,integer,double precision,double precision,boolean)','EXECUTE') then
    raise exception 'STEP 71 failed: anon donor search access remains';
  end if;

  if has_function_privilege('anon','public.respond_to_blood_request(uuid,text)','EXECUTE') then
    raise exception 'STEP 71 failed: anon donor response access remains';
  end if;
end;
$$;

select 'STEP 71 BLOOD DISTANCE COMPATIBILITY ELIGIBILITY PASSED' as result;
