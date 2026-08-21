-- Doctor/Hospital public content update policy fix
-- Chamber/visiting card changes do not trigger verification reset.
-- BMDC verification remains separate.

create or replace function public.save_my_doctor_chamber_v2(
  p_provider_id uuid default null,
  p_name_bn text default null,
  p_address text default null,
  p_district_id bigint default null,
  p_upazila_id bigint default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare result_id uuid; old_provider public.providers%rowtype; identity_or_location_changed boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and role='doctor' and account_status='active') then raise exception 'Active doctor account required'; end if;
  if length(trim(coalesce(p_name_bn,'')))<2 then raise exception 'Chamber name is required'; end if;
  if length(trim(coalesce(p_address,'')))<3 then raise exception 'Chamber address is required'; end if;
  if p_district_id is null or not exists(select 1 from public.districts x where x.id=p_district_id and x.is_active) then raise exception 'Valid district is required'; end if;
  if p_upazila_id is not null and not exists(select 1 from public.upazilas u where u.id=p_upazila_id and u.district_id=p_district_id and u.is_active) then raise exception 'Upazila does not belong to selected district'; end if;
  if (p_latitude is null) <> (p_longitude is null) then raise exception 'Latitude and longitude must be provided together'; end if;
  if (p_latitude is not null and (p_latitude < -90 or p_latitude > 90)) or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then raise exception 'Invalid map coordinates'; end if;

  if p_provider_id is null then
    result_id:=gen_random_uuid();
    insert into public.providers(id,owner_user_id,provider_type,name_bn,slug,phone,whatsapp,address,district_id,upazila_id,latitude,longitude,status,verified)
    values(result_id,auth.uid(),'chamber',trim(p_name_bn),'doctor-chamber-'||replace(result_id::text,'-',''),
      nullif(trim(p_phone),''),nullif(trim(p_whatsapp),''),trim(p_address),p_district_id,p_upazila_id,p_latitude,p_longitude,'pending',false);
    insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
    values(auth.uid(),result_id,'approved',auth.uid()) on conflict(doctor_id,provider_id) do update set status='approved',invited_by=auth.uid();
    identity_or_location_changed:=true;
  else
    select * into old_provider from public.providers
    where id=p_provider_id and owner_user_id=auth.uid() and provider_type='chamber' for update;
    if not found then raise exception 'Doctor-owned chamber not found'; end if;
    identity_or_location_changed:=old_provider.name_bn is distinct from trim(p_name_bn)
      or old_provider.address is distinct from trim(p_address) or old_provider.district_id is distinct from p_district_id
      or old_provider.upazila_id is distinct from p_upazila_id or old_provider.latitude is distinct from p_latitude
      or old_provider.longitude is distinct from p_longitude;
    update public.providers set name_bn=trim(p_name_bn),phone=nullif(trim(p_phone),''),whatsapp=nullif(trim(p_whatsapp),''),
      address=trim(p_address),district_id=p_district_id,upazila_id=p_upazila_id,latitude=p_latitude,longitude=p_longitude,
      status=status,
      verified=verified,
      verification_note=verification_note,
      verified_by=verified_by,
      verified_at=verified_at,updated_at=now()
    where id=p_provider_id;
    insert into public.doctor_provider_links(doctor_id,provider_id,status,invited_by)
    values(auth.uid(),p_provider_id,'approved',auth.uid()) on conflict(doctor_id,provider_id) do update set status='approved';
    result_id:=p_provider_id;
  end if;
  return jsonb_build_object('provider_id',result_id,'verification_reset',false);
end;
$$;