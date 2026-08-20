-- ============================================================
-- STEP 42 — PATIENT FOLLOW / SAVE COMPLETION
-- Depends on STEP 39 foundation and STEP 40 read layer.
-- Reuses patient_follows; no duplicate favorite/follower table.
-- Adds idempotent follow event history for owner analytics only.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Extend private interaction event history with follow gain/loss.
-- Public interaction RPC remains restricted to the original click/view events;
-- follow events can only be written by toggle_my_follow().
-- ------------------------------------------------------------
do $$
declare c_name text;
begin
  select c.conname into c_name
  from pg_constraint c
  where c.conrelid='public.profile_interactions'::regclass
    and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%event_type%'
  limit 1;
  if c_name is not null then
    execute format('alter table public.profile_interactions drop constraint %I',c_name);
  end if;
end $$;

alter table public.profile_interactions
  add constraint profile_interactions_event_type_check
  check(event_type in (
    'profile_view','call_click','whatsapp_click','appointment_click','map_click',
    'follow_gain','follow_loss'
  ));

-- ------------------------------------------------------------
-- 2) Idempotent Patient Follow/Save mutation.
-- Unique indexes from STEP 39 remain the canonical duplicate protection.
-- Follow events are logged only when a row actually changes.
-- ------------------------------------------------------------
create or replace function public.toggle_my_follow(
  p_doctor_id uuid default null,
  p_provider_id uuid default null,
  p_follow boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  total_followers bigint:=0;
  changed_rows integer:=0;
  now_following boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='patient' and account_status='active'
  ) then raise exception 'Only an active Patient account can follow/save profiles'; end if;
  if ((p_doctor_id is not null)::int + (p_provider_id is not null)::int)<>1 then
    raise exception 'Choose exactly one Doctor or Provider';
  end if;

  if p_doctor_id is not null and not public.is_doctor_publicly_listable(p_doctor_id) then
    raise exception 'Doctor is not available for public follow/save';
  end if;
  if p_provider_id is not null and not exists(
    select 1 from public.providers
    where id=p_provider_id and status='approved' and verified=true
  ) then raise exception 'Hospital/Provider is not available for public follow/save'; end if;

  if coalesce(p_follow,true) then
    insert into public.patient_follows(patient_id,doctor_id,provider_id)
    values(auth.uid(),p_doctor_id,p_provider_id)
    on conflict do nothing;
    get diagnostics changed_rows = row_count;

    if changed_rows>0 then
      insert into public.profile_interactions(
        doctor_id,provider_id,actor_user_id,event_type,source,metadata
      ) values(
        p_doctor_id,p_provider_id,auth.uid(),'follow_gain','patient_follow','{}'::jsonb
      );
    end if;
  else
    delete from public.patient_follows
    where patient_id=auth.uid()
      and doctor_id is not distinct from p_doctor_id
      and provider_id is not distinct from p_provider_id;
    get diagnostics changed_rows = row_count;

    if changed_rows>0 then
      insert into public.profile_interactions(
        doctor_id,provider_id,actor_user_id,event_type,source,metadata
      ) values(
        p_doctor_id,p_provider_id,auth.uid(),'follow_loss','patient_follow','{}'::jsonb
      );
    end if;
  end if;

  select exists(
    select 1 from public.patient_follows
    where patient_id=auth.uid()
      and doctor_id is not distinct from p_doctor_id
      and provider_id is not distinct from p_provider_id
  ) into now_following;

  if p_doctor_id is not null then
    select count(*) into total_followers
    from public.patient_follows where doctor_id=p_doctor_id;
  else
    select count(*) into total_followers
    from public.patient_follows where provider_id=p_provider_id;
  end if;

  return jsonb_build_object(
    'following',now_following,
    'follower_count',total_followers
  );
end;
$$;

revoke all on function public.toggle_my_follow(uuid,uuid,boolean) from public,anon;
grant execute on function public.toggle_my_follow(uuid,uuid,boolean)
to authenticated,service_role;

-- ------------------------------------------------------------
-- 3) Owner analytics: total + gross gains/losses/net during period.
-- Events before STEP 42 are not reconstructed; current total remains exact.
-- ------------------------------------------------------------
create or replace function public.get_my_doctor_interaction_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  days_back integer:=greatest(1,least(coalesce(p_days,30),365));
  gains bigint:=0;
  losses bigint:=0;
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and account_status='active'
  ) then raise exception 'Active Doctor account required'; end if;

  select count(*) into gains
  from public.profile_interactions
  where doctor_id=auth.uid() and event_type='follow_gain'
    and occurred_at>=now()-(days_back||' days')::interval;

  select count(*) into losses
  from public.profile_interactions
  where doctor_id=auth.uid() and event_type='follow_loss'
    and occurred_at>=now()-(days_back||' days')::interval;

  return jsonb_build_object(
    'profile_views',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='profile_view' and occurred_at>=now()-(days_back||' days')::interval),
    'call_clicks',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='call_click' and occurred_at>=now()-(days_back||' days')::interval),
    'whatsapp_clicks',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='whatsapp_click' and occurred_at>=now()-(days_back||' days')::interval),
    'appointment_clicks',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='appointment_click' and occurred_at>=now()-(days_back||' days')::interval),
    'map_clicks',(select count(*) from public.profile_interactions where doctor_id=auth.uid() and event_type='map_click' and occurred_at>=now()-(days_back||' days')::interval),
    'followers',(select count(*) from public.patient_follows where doctor_id=auth.uid()),
    'followers_new',gains,
    'followers_lost',losses,
    'followers_net',gains-losses,
    'reviews',(select count(*) from public.doctor_reviews where doctor_id=auth.uid() and is_published=true),
    'average_rating',(select round(avg(rating),2) from public.doctor_reviews where doctor_id=auth.uid() and is_published=true),
    'days',days_back
  );
end;
$$;

create or replace function public.get_my_provider_interaction_summary(
  p_provider_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  days_back integer:=greatest(1,least(coalesce(p_days,30),365));
  gains bigint:=0;
  losses bigint:=0;
begin
  if not exists(
    select 1 from public.providers p
    join public.profiles me on me.id=auth.uid()
    where p.id=p_provider_id and p.owner_user_id=auth.uid()
      and me.account_status='active' and me.role in ('hospital','chamber')
  ) then raise exception 'Owned active Hospital/Provider required'; end if;

  select count(*) into gains
  from public.profile_interactions
  where provider_id=p_provider_id and event_type='follow_gain'
    and occurred_at>=now()-(days_back||' days')::interval;

  select count(*) into losses
  from public.profile_interactions
  where provider_id=p_provider_id and event_type='follow_loss'
    and occurred_at>=now()-(days_back||' days')::interval;

  return jsonb_build_object(
    'profile_views',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='profile_view' and occurred_at>=now()-(days_back||' days')::interval),
    'call_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='call_click' and occurred_at>=now()-(days_back||' days')::interval),
    'whatsapp_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='whatsapp_click' and occurred_at>=now()-(days_back||' days')::interval),
    'appointment_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='appointment_click' and occurred_at>=now()-(days_back||' days')::interval),
    'map_clicks',(select count(*) from public.profile_interactions where provider_id=p_provider_id and event_type='map_click' and occurred_at>=now()-(days_back||' days')::interval),
    'followers',(select count(*) from public.patient_follows where provider_id=p_provider_id),
    'followers_new',gains,
    'followers_lost',losses,
    'followers_net',gains-losses,
    'reviews',(select count(*) from public.provider_reviews r join public.provider_review_authors a on a.review_id=r.id where r.provider_id=p_provider_id and r.is_published=true),
    'average_rating',(select round(avg(coalesce(r.structured_rating,r.rating::numeric)),2) from public.provider_reviews r join public.provider_review_authors a on a.review_id=r.id where r.provider_id=p_provider_id and r.is_published=true),
    'days',days_back
  );
end;
$$;

revoke all on function public.get_my_doctor_interaction_summary(integer) from public,anon;
grant execute on function public.get_my_doctor_interaction_summary(integer)
to authenticated,service_role;
revoke all on function public.get_my_provider_interaction_summary(uuid,integer) from public,anon;
grant execute on function public.get_my_provider_interaction_summary(uuid,integer)
to authenticated,service_role;

-- ------------------------------------------------------------
-- 4) Deployment assertions.
-- ------------------------------------------------------------
do $$
begin
  if not exists(
    select 1 from pg_indexes
    where schemaname='public' and indexname='ux_patient_follows_doctor'
  ) then raise exception 'STEP 42 failed: Doctor follow uniqueness missing'; end if;
  if not exists(
    select 1 from pg_indexes
    where schemaname='public' and indexname='ux_patient_follows_provider'
  ) then raise exception 'STEP 42 failed: Provider follow uniqueness missing'; end if;
  if has_table_privilege('authenticated','public.patient_follows','INSERT') then
    raise exception 'STEP 42 failed: direct Patient follow INSERT must stay revoked';
  end if;
  if has_function_privilege('anon','public.toggle_my_follow(uuid,uuid,boolean)','EXECUTE') then
    raise exception 'STEP 42 failed: anonymous follow mutation must stay revoked';
  end if;
  if not has_function_privilege('authenticated','public.toggle_my_follow(uuid,uuid,boolean)','EXECUTE') then
    raise exception 'STEP 42 failed: authenticated Patient follow RPC grant missing';
  end if;
end $$;
