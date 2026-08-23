-- ============================================================
-- STEP 76 — DOCTOR UPLOAD + PUBLIC CONTENT RELIABILITY
-- Run after Step 75.
-- Fixes Doctor/Provider verification-document Storage ownership and moves
-- Doctor slider/service/cost mutations behind authenticated owner RPCs.
-- ============================================================

begin;

create or replace function public.is_verification_object_owner(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,storage
as $$
declare parts text[]; entity_uuid uuid;
begin
  if auth.uid() is null then return false; end if;
  parts:=storage.foldername(p_name);
  if coalesce(array_length(parts,1),0)<2 then return false; end if;
  entity_uuid:=parts[2]::uuid;

  if parts[1]='doctors' then
    return entity_uuid=auth.uid() and exists(
      select 1 from public.doctors d join public.profiles p on p.id=d.id
      where d.id=entity_uuid and p.role='doctor' and p.account_status='active'
    );
  elsif parts[1]='providers' then
    return exists(
      select 1 from public.providers pr join public.profiles p on p.id=pr.owner_user_id
      where pr.id=entity_uuid and pr.owner_user_id=auth.uid()
        and p.role in ('hospital','chamber') and p.account_status='active'
    );
  elsif parts[1]='ambulances' then
    return public.is_ambulance_owner(entity_uuid);
  end if;
  return false;
exception when invalid_text_representation then return false;
end;
$$;

revoke all on function public.is_verification_object_owner(text) from public,anon;
grant execute on function public.is_verification_object_owner(text) to authenticated,service_role;

create or replace function public.mutate_my_doctor_slider_image(
  p_action text,p_id bigint default null,p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare r public.doctor_slider_images%rowtype; v_image text; v_caption jsonb;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists(
    select 1 from public.doctors d join public.profiles p on p.id=d.id
    where d.id=auth.uid() and p.role='doctor' and p.account_status='active'
  ) then raise exception 'ACTIVE_DOCTOR_REQUIRED'; end if;

  if p_action='create' then
    if (select count(*) from public.doctor_slider_images where doctor_id=auth.uid())>=4 then raise exception 'SLIDER_IMAGE_LIMIT_REACHED'; end if;
    v_image:=btrim(coalesce(p_payload->>'image',''));
    v_caption:=coalesce(p_payload->'caption','{}'::jsonb);
    if v_image='' or v_image not like auth.uid()::text||'/%' then raise exception 'INVALID_SLIDER_IMAGE_PATH'; end if;
    if jsonb_typeof(v_caption)<>'object' or char_length(coalesce(v_caption->>'bn',''))>300 or char_length(coalesce(v_caption->>'en',''))>300 then raise exception 'INVALID_SLIDER_CAPTION'; end if;
    insert into public.doctor_slider_images(doctor_id,image,caption,is_active,sort_order)
    values(auth.uid(),v_image,v_caption,coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'sort_order')::integer,0))
    returning * into r;
  elsif p_action='update' then
    select * into r from public.doctor_slider_images where id=p_id and doctor_id=auth.uid() for update;
    if not found then raise exception 'SLIDER_IMAGE_NOT_FOUND'; end if;
    v_image:=case when p_payload?'image' then btrim(coalesce(p_payload->>'image','')) else r.image end;
    v_caption:=case when p_payload?'caption' then p_payload->'caption' else r.caption end;
    if v_image='' or v_image not like auth.uid()::text||'/%' then raise exception 'INVALID_SLIDER_IMAGE_PATH'; end if;
    if jsonb_typeof(v_caption)<>'object' or char_length(coalesce(v_caption->>'bn',''))>300 or char_length(coalesce(v_caption->>'en',''))>300 then raise exception 'INVALID_SLIDER_CAPTION'; end if;
    update public.doctor_slider_images set image=v_image,caption=v_caption,
      is_active=case when p_payload?'is_active' then (p_payload->>'is_active')::boolean else is_active end,
      sort_order=case when p_payload?'sort_order' then (p_payload->>'sort_order')::integer else sort_order end
    where id=p_id returning * into r;
  elsif p_action='delete' then
    delete from public.doctor_slider_images where id=p_id and doctor_id=auth.uid() returning * into r;
    if not found then raise exception 'SLIDER_IMAGE_NOT_FOUND'; end if;
  else raise exception 'INVALID_SLIDER_ACTION'; end if;
  return to_jsonb(r);
end;
$$;

create or replace function public.mutate_my_doctor_content_item(
  p_table text,p_action text,p_id bigint default null,p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare s public.doctor_services%rowtype; t public.doctor_treatment_costs%rowtype; i public.doctor_investigation_costs%rowtype; v_name jsonb;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists(
    select 1 from public.doctors d join public.profiles p on p.id=d.id
    where d.id=auth.uid() and p.role='doctor' and p.account_status='active'
  ) then raise exception 'ACTIVE_DOCTOR_REQUIRED'; end if;
  if p_table not in ('doctor_services','doctor_treatment_costs','doctor_investigation_costs') then raise exception 'INVALID_CONTENT_TABLE'; end if;
  if p_action not in ('create','update','delete') then raise exception 'INVALID_CONTENT_ACTION'; end if;

  if p_table='doctor_services' then
    if p_action='create' then
      v_name:=coalesce(p_payload->'name','{}'::jsonb);
      if btrim(coalesce(v_name->>'bn',v_name->>'en',''))='' then raise exception 'SERVICE_NAME_REQUIRED'; end if;
      insert into public.doctor_services(doctor_id,name,description,icon,is_active,sort_order)
      values(auth.uid(),v_name,coalesce(p_payload->'description','{}'::jsonb),nullif(btrim(coalesce(p_payload->>'icon','')),''),coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'sort_order')::integer,0)) returning * into s;
    elsif p_action='update' then
      select * into s from public.doctor_services where id=p_id and doctor_id=auth.uid() for update;
      if not found then raise exception 'CONTENT_ITEM_NOT_FOUND'; end if;
      v_name:=case when p_payload?'name' then p_payload->'name' else s.name end;
      if btrim(coalesce(v_name->>'bn',v_name->>'en',''))='' then raise exception 'SERVICE_NAME_REQUIRED'; end if;
      update public.doctor_services set name=v_name,
        description=case when p_payload?'description' then p_payload->'description' else description end,
        icon=case when p_payload?'icon' then nullif(btrim(coalesce(p_payload->>'icon','')),'') else icon end,
        is_active=case when p_payload?'is_active' then (p_payload->>'is_active')::boolean else is_active end,
        sort_order=case when p_payload?'sort_order' then (p_payload->>'sort_order')::integer else sort_order end
      where id=p_id returning * into s;
    else delete from public.doctor_services where id=p_id and doctor_id=auth.uid() returning * into s;
      if not found then raise exception 'CONTENT_ITEM_NOT_FOUND'; end if;
    end if;
    return to_jsonb(s);
  elsif p_table='doctor_treatment_costs' then
    if p_action='create' then
      v_name:=coalesce(p_payload->'name','{}'::jsonb); if btrim(coalesce(v_name->>'bn',v_name->>'en',''))='' then raise exception 'CONTENT_NAME_REQUIRED'; end if;
      insert into public.doctor_treatment_costs(doctor_id,name,cost,sort_order) values(auth.uid(),v_name,coalesce(p_payload->'cost','{}'::jsonb),coalesce((p_payload->>'sort_order')::integer,0)) returning * into t;
    elsif p_action='update' then
      update public.doctor_treatment_costs set name=case when p_payload?'name' then p_payload->'name' else name end,cost=case when p_payload?'cost' then p_payload->'cost' else cost end,sort_order=case when p_payload?'sort_order' then (p_payload->>'sort_order')::integer else sort_order end where id=p_id and doctor_id=auth.uid() returning * into t;
      if not found then raise exception 'CONTENT_ITEM_NOT_FOUND'; end if;
    else delete from public.doctor_treatment_costs where id=p_id and doctor_id=auth.uid() returning * into t; if not found then raise exception 'CONTENT_ITEM_NOT_FOUND'; end if; end if;
    return to_jsonb(t);
  else
    if p_action='create' then
      v_name:=coalesce(p_payload->'name','{}'::jsonb); if btrim(coalesce(v_name->>'bn',v_name->>'en',''))='' then raise exception 'CONTENT_NAME_REQUIRED'; end if;
      insert into public.doctor_investigation_costs(doctor_id,name,cost,sort_order) values(auth.uid(),v_name,coalesce(p_payload->'cost','{}'::jsonb),coalesce((p_payload->>'sort_order')::integer,0)) returning * into i;
    elsif p_action='update' then
      update public.doctor_investigation_costs set name=case when p_payload?'name' then p_payload->'name' else name end,cost=case when p_payload?'cost' then p_payload->'cost' else cost end,sort_order=case when p_payload?'sort_order' then (p_payload->>'sort_order')::integer else sort_order end where id=p_id and doctor_id=auth.uid() returning * into i;
      if not found then raise exception 'CONTENT_ITEM_NOT_FOUND'; end if;
    else delete from public.doctor_investigation_costs where id=p_id and doctor_id=auth.uid() returning * into i; if not found then raise exception 'CONTENT_ITEM_NOT_FOUND'; end if; end if;
    return to_jsonb(i);
  end if;
end;
$$;

revoke all on table public.doctor_slider_images,public.doctor_services,public.doctor_treatment_costs,public.doctor_investigation_costs from authenticated;
grant select on table public.doctor_slider_images,public.doctor_services,public.doctor_treatment_costs,public.doctor_investigation_costs to authenticated;
revoke all on sequence public.doctor_slider_images_id_seq,public.doctor_services_id_seq,public.doctor_treatment_costs_id_seq,public.doctor_investigation_costs_id_seq from authenticated;

revoke all on function public.mutate_my_doctor_slider_image(text,bigint,jsonb) from public,anon;
revoke all on function public.mutate_my_doctor_content_item(text,text,bigint,jsonb) from public,anon;
grant execute on function public.mutate_my_doctor_slider_image(text,bigint,jsonb) to authenticated,service_role;
grant execute on function public.mutate_my_doctor_content_item(text,text,bigint,jsonb) to authenticated,service_role;

do $$ begin
  if not public.is_verification_object_owner('doctors/'||auth.uid()::text||'/test.webp') and auth.uid() is not null then raise exception 'STEP 76 failed: Doctor storage ownership'; end if;
  if has_table_privilege('authenticated','public.doctor_services','INSERT') then raise exception 'STEP 76 failed: direct Doctor content mutation remains'; end if;
  raise notice 'STEP 76 DOCTOR UPLOAD AND CONTENT RELIABILITY PASSED';
end $$;

commit;
