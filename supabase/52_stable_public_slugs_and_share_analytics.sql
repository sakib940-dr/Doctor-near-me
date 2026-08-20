-- ============================================================
-- STEP 52 — STABLE PUBLIC SLUGS + PROFILE SHARE ANALYTICS
-- Depends on STEP 51. Domain/SEO independent.
-- Reuses doctors.profile_slug, providers.slug and profile_interactions.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Slug helpers. Existing valid slugs are preserved.
-- ------------------------------------------------------------
create or replace function public.docbd_bn_to_latin(p_value text)
returns text
language plpgsql
immutable
set search_path=public
as $$
declare v text:=coalesce(p_value,'');
begin
  v:=translate(v,'০১২৩৪৫৬৭৮৯','0123456789');
  v:=replace(v,'অ','a'); v:=replace(v,'আ','a'); v:=replace(v,'ই','i'); v:=replace(v,'ঈ','i');
  v:=replace(v,'উ','u'); v:=replace(v,'ঊ','u'); v:=replace(v,'ঋ','ri'); v:=replace(v,'এ','e');
  v:=replace(v,'ঐ','oi'); v:=replace(v,'ও','o'); v:=replace(v,'ঔ','ou');
  v:=replace(v,'ক','k'); v:=replace(v,'খ','kh'); v:=replace(v,'গ','g'); v:=replace(v,'ঘ','gh'); v:=replace(v,'ঙ','ng');
  v:=replace(v,'চ','ch'); v:=replace(v,'ছ','chh'); v:=replace(v,'জ','j'); v:=replace(v,'ঝ','jh'); v:=replace(v,'ঞ','n');
  v:=replace(v,'ট','t'); v:=replace(v,'ঠ','th'); v:=replace(v,'ড','d'); v:=replace(v,'ঢ','dh'); v:=replace(v,'ণ','n');
  v:=replace(v,'ত','t'); v:=replace(v,'থ','th'); v:=replace(v,'দ','d'); v:=replace(v,'ধ','dh'); v:=replace(v,'ন','n');
  v:=replace(v,'প','p'); v:=replace(v,'ফ','f'); v:=replace(v,'ব','b'); v:=replace(v,'ভ','bh'); v:=replace(v,'ম','m');
  v:=replace(v,'য','j'); v:=replace(v,'য়','y'); v:=replace(v,'র','r'); v:=replace(v,'ল','l');
  v:=replace(v,'শ','sh'); v:=replace(v,'ষ','sh'); v:=replace(v,'স','s'); v:=replace(v,'হ','h');
  v:=replace(v,'ড়','r'); v:=replace(v,'ঢ়','rh'); v:=replace(v,'ৎ','t');
  v:=replace(v,'ং','ng'); v:=replace(v,'ঃ','h'); v:=replace(v,'ঁ','n');
  v:=replace(v,'া','a'); v:=replace(v,'ি','i'); v:=replace(v,'ী','i'); v:=replace(v,'ু','u'); v:=replace(v,'ূ','u');
  v:=replace(v,'ৃ','ri'); v:=replace(v,'ে','e'); v:=replace(v,'ৈ','oi'); v:=replace(v,'ো','o'); v:=replace(v,'ৌ','ou');
  v:=replace(v,'্','');
  return v;
end;
$$;

create or replace function public.docbd_slugify(p_value text)
returns text
language sql
immutable
set search_path=public
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(lower(public.docbd_bn_to_latin(coalesce(p_value,''))), '[^a-z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ));
$$;

create or replace function public.docbd_doctor_slug_base(p_name text,p_id uuid)
returns text
language plpgsql
immutable
set search_path=public
as $$
declare n text:=coalesce(p_name,''); b text;
begin
  n:=regexp_replace(n,'^\s*(ডা\.?|ডাঃ|ডাক্তার)\s*','', 'i');
  n:=regexp_replace(n,'^\s*(dr\.?|doctor)\s+','', 'i');
  b:=public.docbd_slugify(n);
  if b='' then b:=substr(replace(p_id::text,'-',''),1,8); end if;
  return left('dr-'||b,64);
end;
$$;

create or replace function public.docbd_provider_slug_base(p_name_en text,p_name_bn text,p_type text,p_id uuid)
returns text
language plpgsql
immutable
set search_path=public
as $$
declare b text;
begin
  b:=public.docbd_slugify(coalesce(nullif(trim(p_name_en),''),nullif(trim(p_name_bn),''),''));
  if b='' then b:=coalesce(nullif(public.docbd_slugify(p_type),''),'provider')||'-'||substr(replace(p_id::text,'-',''),1,8); end if;
  return left(b,64);
end;
$$;

revoke all on function public.docbd_bn_to_latin(text) from public,anon,authenticated;
revoke all on function public.docbd_slugify(text) from public,anon,authenticated;
revoke all on function public.docbd_doctor_slug_base(text,uuid) from public,anon,authenticated;
revoke all on function public.docbd_provider_slug_base(text,text,text,uuid) from public,anon,authenticated;

-- Old provider auto-slugs can be upgraded without breaking existing shared links.
create table if not exists public.public_slug_aliases(
  entity_type text not null check(entity_type in ('doctor','provider')),
  entity_id uuid not null,
  slug text not null,
  created_at timestamptz not null default now(),
  primary key(entity_type,slug)
);
create index if not exists idx_public_slug_aliases_entity on public.public_slug_aliases(entity_type,entity_id);
alter table public.public_slug_aliases enable row level security;
revoke all on public.public_slug_aliases from public,anon,authenticated;

create or replace function public.docbd_unique_doctor_slug(p_doctor_id uuid,p_name text)
returns text
language plpgsql
stable
security definer
set search_path=public
as $$
declare base text:=public.docbd_doctor_slug_base(p_name,p_doctor_id); candidate text; suffix text; counter integer:=2;
begin
  candidate:=base;
  if not exists(select 1 from public.doctors where profile_slug=candidate and id<>p_doctor_id)
     and not exists(select 1 from public.public_slug_aliases where entity_type='doctor' and slug=candidate and entity_id<>p_doctor_id) then return candidate; end if;
  suffix:=lpad(mod(hashtext(p_doctor_id::text)::bigint+2147483648,100000)::text,5,'0');
  candidate:=left(base,58)||'-'||suffix;
  while exists(select 1 from public.doctors where profile_slug=candidate and id<>p_doctor_id)
     or exists(select 1 from public.public_slug_aliases where entity_type='doctor' and slug=candidate and entity_id<>p_doctor_id) loop
    candidate:=left(base,54)||'-'||suffix||'-'||counter::text;
    counter:=counter+1;
  end loop;
  return candidate;
end;
$$;

create or replace function public.docbd_unique_provider_slug(p_provider_id uuid,p_name_en text,p_name_bn text,p_type text)
returns text
language plpgsql
stable
security definer
set search_path=public
as $$
declare base text:=public.docbd_provider_slug_base(p_name_en,p_name_bn,p_type,p_provider_id); candidate text; suffix text; counter integer:=2;
begin
  candidate:=base;
  if not exists(select 1 from public.providers where slug=candidate and id<>p_provider_id)
     and not exists(select 1 from public.public_slug_aliases where entity_type='provider' and slug=candidate and entity_id<>p_provider_id) then return candidate; end if;
  suffix:=lpad(mod(hashtext(p_provider_id::text)::bigint+2147483648,100000)::text,5,'0');
  candidate:=left(base,58)||'-'||suffix;
  while exists(select 1 from public.providers where slug=candidate and id<>p_provider_id)
     or exists(select 1 from public.public_slug_aliases where entity_type='provider' and slug=candidate and entity_id<>p_provider_id) loop
    candidate:=left(base,54)||'-'||suffix||'-'||counter::text;
    counter:=counter+1;
  end loop;
  return candidate;
end;
$$;

revoke all on function public.docbd_unique_doctor_slug(uuid,text) from public,anon,authenticated;
revoke all on function public.docbd_unique_provider_slug(uuid,text,text,text) from public,anon,authenticated;

-- One-time Doctor backfill. Valid current slugs remain untouched.
do $$
declare r record; new_slug text;
begin
  for r in
    select d.id,d.profile_slug,p.full_name
    from public.doctors d join public.profiles p on p.id=d.id
    where d.profile_slug is null or trim(d.profile_slug)=''
       or d.profile_slug<>lower(d.profile_slug)
       or d.profile_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    order by d.created_at,d.id
  loop
    new_slug:=public.docbd_unique_doctor_slug(r.id,r.full_name);
    if nullif(trim(coalesce(r.profile_slug,'')),'') is not null and lower(r.profile_slug)<>new_slug then
      insert into public.public_slug_aliases(entity_type,entity_id,slug)
      values('doctor',r.id,lower(trim(r.profile_slug))) on conflict do nothing;
    end if;
    update public.doctors set profile_slug=new_slug where id=r.id;
  end loop;
end $$;

-- Upgrade only legacy UUID-style Provider slugs or invalid/missing slugs.
do $$
declare r record; new_slug text;
begin
  for r in
    select id,provider_type,name_bn,name_en,slug
    from public.providers
    where slug is null or trim(slug)=''
       or slug<>lower(slug)
       or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or slug ~ '^(hospital|chamber)-[0-9a-f]{32}$|^doctor-chamber-[0-9a-f]{32}$'
    order by created_at,id
  loop
    new_slug:=public.docbd_unique_provider_slug(r.id,r.name_en,r.name_bn,r.provider_type);
    if nullif(trim(coalesce(r.slug,'')),'') is not null and lower(r.slug)<>new_slug then
      insert into public.public_slug_aliases(entity_type,entity_id,slug)
      values('provider',r.id,lower(trim(r.slug))) on conflict do nothing;
    end if;
    update public.providers set slug=new_slug where id=r.id;
  end loop;
end $$;

-- New rows get stable friendly slugs once; owner name edits do not regenerate them.
create or replace function public.ensure_doctor_slug_on_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare doctor_name text;
begin
  if nullif(trim(coalesce(new.profile_slug,'')),'') is null then
    select full_name into doctor_name from public.profiles where id=new.id;
    new.profile_slug:=public.docbd_unique_doctor_slug(new.id,doctor_name);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_doctor_slug_on_insert on public.doctors;
create trigger trg_ensure_doctor_slug_on_insert before insert on public.doctors
for each row execute function public.ensure_doctor_slug_on_insert();

create or replace function public.ensure_provider_slug_on_insert()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if nullif(trim(coalesce(new.slug,'')),'') is null or new.slug ~ '^(hospital|chamber)-[0-9a-f]{32}$|^doctor-chamber-[0-9a-f]{32}$' then
    new.slug:=public.docbd_unique_provider_slug(new.id,new.name_en,new.name_bn,new.provider_type);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_provider_slug_on_insert on public.providers;
create trigger trg_ensure_provider_slug_on_insert before insert on public.providers
for each row execute function public.ensure_provider_slug_on_insert();

-- Authenticated owners cannot manually swap a stable slug. Admin/system operations
-- remain able to intentionally regenerate through trusted server/database paths.
create or replace function public.protect_stable_doctor_slug()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.profile_slug is distinct from new.profile_slug then
    if auth.uid() is not null and not public.is_admin_or_above() then
      new.profile_slug:=old.profile_slug;
    else
      new.profile_slug:=lower(trim(coalesce(new.profile_slug,'')));
      if new.profile_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid Doctor public slug'; end if;
      if exists(select 1 from public.public_slug_aliases where entity_type='doctor' and slug=new.profile_slug and entity_id<>new.id) then
        raise exception 'Doctor public slug is reserved by an existing route';
      end if;
      if nullif(trim(coalesce(old.profile_slug,'')),'') is not null then
        insert into public.public_slug_aliases(entity_type,entity_id,slug)
        values('doctor',old.id,lower(trim(old.profile_slug))) on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_stable_doctor_slug on public.doctors;
create trigger trg_protect_stable_doctor_slug before update of profile_slug on public.doctors
for each row execute function public.protect_stable_doctor_slug();

create or replace function public.protect_stable_provider_slug()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.slug is distinct from new.slug then
    if auth.uid() is not null and not public.is_admin_or_above() then
      new.slug:=old.slug;
    else
      new.slug:=lower(trim(coalesce(new.slug,'')));
      if new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid Provider public slug'; end if;
      if exists(select 1 from public.public_slug_aliases where entity_type='provider' and slug=new.slug and entity_id<>new.id) then
        raise exception 'Provider public slug is reserved by an existing route';
      end if;
      if nullif(trim(coalesce(old.slug,'')),'') is not null then
        insert into public.public_slug_aliases(entity_type,entity_id,slug)
        values('provider',old.id,lower(trim(old.slug))) on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_stable_provider_slug on public.providers;
create trigger trg_protect_stable_provider_slug before update of slug on public.providers
for each row execute function public.protect_stable_provider_slug();

-- ------------------------------------------------------------
-- 2) Public-safe route resolution + batch slug hydration.
-- ------------------------------------------------------------
create or replace function public.resolve_public_doctor_route(p_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare v text:=lower(trim(coalesce(p_identifier,''))); result_id uuid; result_slug text;
begin
  if v='' then return null; end if;
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select d.id,d.profile_slug into result_id,result_slug from public.doctors d
    where d.id=v::uuid and public.is_doctor_publicly_listable(d.id);
  else
    select d.id,d.profile_slug into result_id,result_slug from public.doctors d
    where d.profile_slug=v and public.is_doctor_publicly_listable(d.id);
    if result_id is null then
      select d.id,d.profile_slug into result_id,result_slug
      from public.public_slug_aliases a join public.doctors d on d.id=a.entity_id
      where a.entity_type='doctor' and a.slug=v and public.is_doctor_publicly_listable(d.id);
    end if;
  end if;
  if result_id is null or result_slug is null then return null; end if;
  return jsonb_build_object('id',result_id,'slug',result_slug);
end;
$$;

create or replace function public.resolve_public_provider_route(p_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare v text:=lower(trim(coalesce(p_identifier,''))); result_id uuid; result_slug text;
begin
  if v='' then return null; end if;
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id,p.slug into result_id,result_slug from public.providers p
    where p.id=v::uuid and p.status='approved' and p.verified=true;
  else
    select p.id,p.slug into result_id,result_slug from public.providers p
    where p.slug=v and p.status='approved' and p.verified=true;
    if result_id is null then
      select p.id,p.slug into result_id,result_slug
      from public.public_slug_aliases a join public.providers p on p.id=a.entity_id
      where a.entity_type='provider' and a.slug=v and p.status='approved' and p.verified=true;
    end if;
  end if;
  if result_id is null or result_slug is null then return null; end if;
  return jsonb_build_object('id',result_id,'slug',result_slug);
end;
$$;

create or replace function public.get_public_profile_slugs(
  p_doctor_ids uuid[] default null,
  p_provider_ids uuid[] default null
)
returns table(target_type text,target_id uuid,slug text)
language sql
stable
security definer
set search_path=public
as $$
  select 'doctor'::text,d.id,d.profile_slug
  from public.doctors d
  where d.profile_slug is not null
    and p_doctor_ids is not null
    and d.id=any(p_doctor_ids)
    and public.is_doctor_publicly_listable(d.id)
  union all
  select 'provider'::text,p.id,p.slug
  from public.providers p
  where p.slug is not null
    and p_provider_ids is not null
    and p.id=any(p_provider_ids)
    and p.status='approved' and p.verified=true;
$$;

revoke all on function public.resolve_public_doctor_route(text) from public;
grant execute on function public.resolve_public_doctor_route(text) to anon,authenticated,service_role;
revoke all on function public.resolve_public_provider_route(text) from public;
grant execute on function public.resolve_public_provider_route(text) to anon,authenticated,service_role;
revoke all on function public.get_public_profile_slugs(uuid[],uuid[]) from public;
grant execute on function public.get_public_profile_slugs(uuid[],uuid[]) to anon,authenticated,service_role;

-- ------------------------------------------------------------
-- 3) Share analytics: reuse canonical profile_interactions.
-- ------------------------------------------------------------
alter table public.profile_interactions drop constraint if exists profile_interactions_event_type_check;
alter table public.profile_interactions add constraint profile_interactions_event_type_check
check(event_type in (
  'profile_view','call_click','whatsapp_click','appointment_click','appointment_submitted',
  'follow_gain','follow_loss','map_click','review_submitted','review_edited',
  'share_click','share_native','share_copy'
));

create or replace function public.record_public_profile_interaction(
  p_doctor_id uuid default null,
  p_provider_id uuid default null,
  p_event_type text default 'profile_view',
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=null;
  key_value text:=nullif(trim(coalesce(p_metadata->>'dedupe_key','')),'');
  clean_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb)-'dedupe_key';
  changed_rows integer:=0;
begin
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then raise exception 'Choose exactly one Doctor or Provider'; end if;
  if p_event_type not in ('profile_view','call_click','whatsapp_click','appointment_click','map_click','share_click','share_native','share_copy') then
    raise exception 'Unsupported public interaction type';
  end if;
  if length(coalesce(p_source,''))>80 then raise exception 'Interaction source is too long'; end if;
  if key_value is not null and length(key_value)>180 then raise exception 'Interaction dedupe key is too long'; end if;
  if pg_column_size(clean_metadata)>2048 then raise exception 'Interaction metadata is too large'; end if;
  if p_doctor_id is not null and not public.is_doctor_publicly_listable(p_doctor_id) then return false; end if;
  if p_provider_id is not null and not exists(select 1 from public.providers where id=p_provider_id and status='approved' and verified=true) then return false; end if;
  if auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then actor:=auth.uid(); end if;
  if actor is not null and p_doctor_id is not null and actor=p_doctor_id then return false; end if;
  if actor is not null and p_provider_id is not null and exists(select 1 from public.providers where id=p_provider_id and owner_user_id=actor) then return false; end if;

  insert into public.profile_interactions(doctor_id,provider_id,actor_user_id,event_type,source,metadata,dedupe_key)
  values(p_doctor_id,p_provider_id,actor,p_event_type,nullif(trim(p_source),''),clean_metadata,key_value)
  on conflict do nothing;
  get diagnostics changed_rows=row_count;
  return changed_rows>0;
end;
$$;

revoke all on function public.record_public_profile_interaction(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.record_public_profile_interaction(uuid,uuid,text,text,jsonb) to anon,authenticated,service_role;

create or replace function public.get_my_profile_share_metrics(
  p_provider_id uuid default null,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare role_value public.user_role; start_ts timestamptz; target_doctor uuid:=null; target_provider uuid:=null;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_days not in (0,7,30) then raise exception 'Analytics period must be 7, 30 or 0'; end if;
  select role into role_value from public.profiles where id=auth.uid() and account_status='active';
  if role_value='doctor' then
    if p_provider_id is not null then raise exception 'Doctor analytics does not accept Provider ID'; end if;
    target_doctor:=auth.uid();
  elsif role_value in ('hospital','chamber') then
    if p_provider_id is null or not exists(select 1 from public.providers where id=p_provider_id and owner_user_id=auth.uid()) then
      raise exception 'Owned Provider required';
    end if;
    target_provider:=p_provider_id;
  else
    raise exception 'Profile owner account required';
  end if;

  start_ts:=case when p_days=0 then '-infinity'::timestamptz else now()-(p_days||' days')::interval end;
  return jsonb_build_object(
    'share_clicks',(select count(*) from public.profile_interactions i where i.occurred_at>=start_ts and i.event_type='share_click' and ((target_doctor is not null and i.doctor_id=target_doctor) or (target_provider is not null and i.provider_id=target_provider))),
    'native_share_initiated',(select count(*) from public.profile_interactions i where i.occurred_at>=start_ts and i.event_type='share_native' and ((target_doctor is not null and i.doctor_id=target_doctor) or (target_provider is not null and i.provider_id=target_provider))),
    'copy_link',(select count(*) from public.profile_interactions i where i.occurred_at>=start_ts and i.event_type='share_copy' and ((target_doctor is not null and i.doctor_id=target_doctor) or (target_provider is not null and i.provider_id=target_provider))),
    'profile_shares',(select count(*) from public.profile_interactions i where i.occurred_at>=start_ts and i.event_type in ('share_native','share_copy') and ((target_doctor is not null and i.doctor_id=target_doctor) or (target_provider is not null and i.provider_id=target_provider)))
  );
end;
$$;

revoke all on function public.get_my_profile_share_metrics(uuid,integer) from public,anon;
grant execute on function public.get_my_profile_share_metrics(uuid,integer) to authenticated,service_role;

-- ------------------------------------------------------------
-- 4) Assertions.
-- ------------------------------------------------------------
do $$
begin
  if exists(select 1 from public.doctors where profile_slug is null or profile_slug='' or profile_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$') then
    raise exception 'STEP 52 failed: Doctor slug backfill incomplete';
  end if;
  if exists(select profile_slug from public.doctors group by profile_slug having count(*)>1) then
    raise exception 'STEP 52 failed: duplicate Doctor slug';
  end if;
  if exists(select slug from public.providers group by slug having count(*)>1) then
    raise exception 'STEP 52 failed: duplicate Provider slug';
  end if;
  if not has_function_privilege('anon','public.resolve_public_doctor_route(text)','EXECUTE') then
    raise exception 'STEP 52 failed: public Doctor route resolver unavailable';
  end if;
  if not has_function_privilege('anon','public.resolve_public_provider_route(text)','EXECUTE') then
    raise exception 'STEP 52 failed: public Provider route resolver unavailable';
  end if;
  if has_function_privilege('anon','public.get_my_profile_share_metrics(uuid,integer)','EXECUTE') then
    raise exception 'STEP 52 failed: owner share analytics exposed to anon';
  end if;
end $$;

select 'STEP 52 STABLE PUBLIC SLUGS + SHARE ANALYTICS PASSED' as result;
