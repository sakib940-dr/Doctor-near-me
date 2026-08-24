-- ============================================================
-- STEP 82 — HOSPITAL PREMIUM COMPLETION
-- Hospital-only gallery reliability + Admin support messaging.
-- Run after Step 81. Safe to re-run.
-- Does not alter Doctor, Patient, Visitor or Admin module tables/functions.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Hospital gallery storage reliability
-- ------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('public-images','public-images',true,5242880,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set
  public=true,
  file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif'];

drop policy if exists "hospital_gallery_media_insert" on storage.objects;
create policy "hospital_gallery_media_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='public-images'
  and (storage.foldername(name))[1]=auth.uid()::text
  and coalesce((storage.foldername(name))[3],'')='website'
  and coalesce((storage.foldername(name))[4],'')='slider'
  and exists(
    select 1 from public.providers pr
    join public.profiles owner on owner.id=pr.owner_user_id
    where pr.id::text=(storage.foldername(name))[2]
      and pr.owner_user_id=auth.uid()
      and pr.provider_type='hospital'
      and owner.role='hospital'
      and owner.account_status='active'
  )
);

drop policy if exists "hospital_gallery_media_delete" on storage.objects;
create policy "hospital_gallery_media_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='public-images'
  and owner_id=auth.uid()::text
  and (storage.foldername(name))[1]=auth.uid()::text
  and coalesce((storage.foldername(name))[3],'')='website'
  and coalesce((storage.foldername(name))[4],'')='slider'
  and not public.storage_object_is_referenced(bucket_id,name)
  and exists(
    select 1 from public.providers pr
    join public.profiles owner on owner.id=pr.owner_user_id
    where pr.id::text=(storage.foldername(name))[2]
      and pr.owner_user_id=auth.uid()
      and pr.provider_type='hospital'
      and owner.role='hospital'
      and owner.account_status='active'
  )
);

create or replace function public.enforce_hospital_slider_limit()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.providers p where p.id=new.provider_id and p.provider_type='hospital')
     and (select count(*) from public.provider_slider_images s
          where s.provider_id=new.provider_id and s.id<>coalesce(new.id,-1))>=4 then
    raise exception 'HOSPITAL_GALLERY_LIMIT_REACHED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hospital_slider_limit on public.provider_slider_images;
create trigger trg_hospital_slider_limit
before insert or update of provider_id on public.provider_slider_images
for each row execute function public.enforce_hospital_slider_limit();

-- ------------------------------------------------------------
-- 2) Independent Hospital ↔ Admin support messaging
-- ------------------------------------------------------------
create table if not exists public.hospital_support_threads (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  subject text not null check(char_length(btrim(subject)) between 3 and 160),
  status text not null default 'open' check(status in ('open','answered','closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hospital_support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.hospital_support_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check(char_length(btrim(message)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists idx_hospital_support_owner
  on public.hospital_support_threads(provider_id,last_message_at desc,id);
create index if not exists idx_hospital_support_admin_queue
  on public.hospital_support_threads(status,last_message_at desc,id);
create index if not exists idx_hospital_support_messages_thread
  on public.hospital_support_messages(thread_id,created_at,id);

drop trigger if exists trg_hospital_support_threads_updated_at on public.hospital_support_threads;
create trigger trg_hospital_support_threads_updated_at before update on public.hospital_support_threads
for each row execute function public.set_updated_at();

alter table public.hospital_support_threads enable row level security;
alter table public.hospital_support_messages enable row level security;
revoke all on table public.hospital_support_threads,public.hospital_support_messages from public,anon,authenticated;
grant all on table public.hospital_support_threads,public.hospital_support_messages to service_role;

create or replace function public.get_my_hospital_support_threads(p_provider_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'provider_id',t.provider_id,'subject',t.subject,'status',t.status,
    'last_message_at',t.last_message_at,'created_at',t.created_at,
    'message_count',(select count(*) from public.hospital_support_messages m where m.thread_id=t.id),
    'last_message',(select m.message from public.hospital_support_messages m where m.thread_id=t.id order by m.created_at desc,m.id desc limit 1)
  ) order by t.last_message_at desc,t.id desc),'[]'::jsonb) into result
  from public.hospital_support_threads t where t.provider_id=p_provider_id and t.created_by=auth.uid();
  return result;
end;
$$;

create or replace function public.get_my_hospital_support_chat(p_provider_id uuid,p_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  select jsonb_build_object(
    'thread',jsonb_build_object('id',t.id,'provider_id',t.provider_id,'subject',t.subject,'status',t.status,'last_message_at',t.last_message_at,'created_at',t.created_at),
    'messages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'sender_id',m.sender_id,'sender_role',p.role::text,'sender_name',p.full_name,
      'message',m.message,'created_at',m.created_at
    ) order by m.created_at,m.id) from public.hospital_support_messages m join public.profiles p on p.id=m.sender_id where m.thread_id=t.id),'[]'::jsonb)
  ) into result from public.hospital_support_threads t
  where t.id=p_thread_id and t.provider_id=p_provider_id and t.created_by=auth.uid();
  if result is null then raise exception 'HOSPITAL_SUPPORT_THREAD_NOT_FOUND'; end if;
  return result;
end;
$$;

create or replace function public.create_my_hospital_support_conversation(p_provider_id uuid,p_subject text,p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare tid uuid; clean_subject text:=btrim(coalesce(p_subject,'')); clean_message text:=btrim(coalesce(p_message,''));
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  if char_length(clean_subject) not between 3 and 160 then raise exception 'INVALID_SUPPORT_SUBJECT'; end if;
  if char_length(clean_message) not between 1 and 4000 then raise exception 'INVALID_SUPPORT_MESSAGE'; end if;
  insert into public.hospital_support_threads(provider_id,created_by,subject,status,last_message_at)
  values(p_provider_id,auth.uid(),clean_subject,'open',now()) returning id into tid;
  insert into public.hospital_support_messages(thread_id,sender_id,message) values(tid,auth.uid(),clean_message);
  return tid;
end;
$$;

create or replace function public.send_my_hospital_support_message(p_provider_id uuid,p_thread_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare mid uuid; clean_message text:=btrim(coalesce(p_message,''));
begin
  if not public.is_my_active_hospital(p_provider_id) then raise exception 'HOSPITAL_OWNER_REQUIRED'; end if;
  if char_length(clean_message) not between 1 and 4000 then raise exception 'INVALID_SUPPORT_MESSAGE'; end if;
  if not exists(select 1 from public.hospital_support_threads t where t.id=p_thread_id and t.provider_id=p_provider_id and t.created_by=auth.uid() and t.status<>'closed') then
    raise exception 'HOSPITAL_SUPPORT_THREAD_NOT_AVAILABLE';
  end if;
  insert into public.hospital_support_messages(thread_id,sender_id,message) values(p_thread_id,auth.uid(),clean_message) returning id into mid;
  update public.hospital_support_threads set status='open',last_message_at=now(),updated_at=now() where id=p_thread_id;
  return mid;
end;
$$;

create or replace function public.admin_get_hospital_support_threads(p_limit integer default 50,p_offset integer default 0)
returns table(thread_id uuid,provider_id uuid,hospital_name text,owner_id uuid,owner_name text,subject text,status text,last_message_at timestamptz,message_count bigint)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_admin_or_above() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  return query select t.id,t.provider_id,pr.name_bn,t.created_by,p.full_name,t.subject,t.status,t.last_message_at,
    (select count(*) from public.hospital_support_messages m where m.thread_id=t.id)
  from public.hospital_support_threads t
  join public.providers pr on pr.id=t.provider_id
  join public.profiles p on p.id=t.created_by
  order by t.last_message_at desc,t.id desc
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function public.admin_get_hospital_support_chat(p_thread_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.is_admin_or_above() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  select jsonb_build_object(
    'thread',jsonb_build_object('id',t.id,'provider_id',t.provider_id,'hospital_name',pr.name_bn,'subject',t.subject,'status',t.status,'last_message_at',t.last_message_at,'created_at',t.created_at),
    'messages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'sender_id',m.sender_id,'sender_role',p.role::text,'sender_name',p.full_name,
      'message',m.message,'created_at',m.created_at
    ) order by m.created_at,m.id) from public.hospital_support_messages m join public.profiles p on p.id=m.sender_id where m.thread_id=t.id),'[]'::jsonb)
  ) into result from public.hospital_support_threads t join public.providers pr on pr.id=t.provider_id where t.id=p_thread_id;
  if result is null then raise exception 'HOSPITAL_SUPPORT_THREAD_NOT_FOUND'; end if;
  return result;
end;
$$;

create or replace function public.admin_send_hospital_support_message(p_thread_id uuid,p_message text)
returns uuid language plpgsql security definer set search_path=public as $$
declare mid uuid; clean_message text:=btrim(coalesce(p_message,''));
begin
  if not public.is_admin_or_above() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if char_length(clean_message) not between 1 and 4000 then raise exception 'INVALID_SUPPORT_MESSAGE'; end if;
  if not exists(select 1 from public.hospital_support_threads where id=p_thread_id) then raise exception 'HOSPITAL_SUPPORT_THREAD_NOT_FOUND'; end if;
  insert into public.hospital_support_messages(thread_id,sender_id,message) values(p_thread_id,auth.uid(),clean_message) returning id into mid;
  update public.hospital_support_threads set status='answered',last_message_at=now(),updated_at=now() where id=p_thread_id;
  return mid;
end;
$$;

create or replace function public.admin_set_hospital_support_status(p_thread_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin_or_above() then raise exception 'ADMIN_ACCESS_REQUIRED'; end if;
  if p_status not in ('open','answered','closed') then raise exception 'INVALID_SUPPORT_STATUS'; end if;
  update public.hospital_support_threads set status=p_status,updated_at=now() where id=p_thread_id;
  if not found then raise exception 'HOSPITAL_SUPPORT_THREAD_NOT_FOUND'; end if;
  return true;
end;
$$;

revoke all on function public.get_my_hospital_support_threads(uuid) from public,anon;
revoke all on function public.get_my_hospital_support_chat(uuid,uuid) from public,anon;
revoke all on function public.create_my_hospital_support_conversation(uuid,text,text) from public,anon;
revoke all on function public.send_my_hospital_support_message(uuid,uuid,text) from public,anon;
revoke all on function public.admin_get_hospital_support_threads(integer,integer) from public,anon;
revoke all on function public.admin_get_hospital_support_chat(uuid) from public,anon;
revoke all on function public.admin_send_hospital_support_message(uuid,text) from public,anon;
revoke all on function public.admin_set_hospital_support_status(uuid,text) from public,anon;

grant execute on function public.get_my_hospital_support_threads(uuid) to authenticated,service_role;
grant execute on function public.get_my_hospital_support_chat(uuid,uuid) to authenticated,service_role;
grant execute on function public.create_my_hospital_support_conversation(uuid,text,text) to authenticated,service_role;
grant execute on function public.send_my_hospital_support_message(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.admin_get_hospital_support_threads(integer,integer) to authenticated,service_role;
grant execute on function public.admin_get_hospital_support_chat(uuid) to authenticated,service_role;
grant execute on function public.admin_send_hospital_support_message(uuid,text) to authenticated,service_role;
grant execute on function public.admin_set_hospital_support_status(uuid,text) to authenticated,service_role;

do $$
begin
  if not exists(select 1 from storage.buckets where id='public-images' and public=true and file_size_limit=5242880) then
    raise exception 'STEP82: public-images bucket is not ready';
  end if;
  if has_table_privilege('authenticated','public.hospital_support_threads','SELECT')
     or has_table_privilege('authenticated','public.hospital_support_messages','INSERT') then
    raise exception 'STEP82: Hospital support direct table access must remain blocked';
  end if;
  if not has_function_privilege('authenticated','public.get_my_hospital_support_threads(uuid)','EXECUTE') then
    raise exception 'STEP82: Hospital support RPC grant missing';
  end if;
  raise notice 'STEP 82 HOSPITAL PREMIUM COMPLETION PASSED';
end;
$$;

commit;
