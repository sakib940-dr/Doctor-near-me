-- STEP 70 — Blood push integration verification + automatic request expiry
--
-- Step 51 already enqueues every public.notifications INSERT into the single
-- web_push_outbox pipeline. Blood notifications therefore require no second
-- queue or trigger. The existing send-web-push Edge Function supplies the
-- blood-specific lock-screen copy and deep link.

-- Supabase Cron runs inside Postgres, so no project URL, HTTP endpoint, Vault
-- secret, or parallel Edge Function is needed for request expiry.
create extension if not exists pg_cron with schema pg_catalog;

-- Keep the existing RPC name/signature, but make it system-only. The explicit
-- auth.uid() check blocks user sessions; service_role is retained for controlled
-- operational invocation, while postgres/supabase_admin covers pg_cron jobs
-- created from the Supabase migration/SQL environment.
create or replace function public.expire_old_blood_requests()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  affected integer;
begin
  if auth.uid() is not null then
    raise exception 'System context required';
  end if;

  if coalesce(auth.role(),'') <> 'service_role'
     and session_user not in ('postgres','supabase_admin') then
    raise exception 'Service role or database scheduler required';
  end if;

  update public.blood_requests
  set status='expired',updated_at=now()
  where status in ('open','partially_fulfilled')
    and needed_at is not null
    and needed_at < now();

  get diagnostics affected=row_count;
  return affected;
end;
$$;

revoke all on function public.expire_old_blood_requests() from public,anon,authenticated;
grant execute on function public.expire_old_blood_requests() to service_role;

-- Donors must only see notifications whose underlying request is still active.
-- This preserves the canonical notifications table while avoiding stale
-- cancelled/fulfilled/expired cards in the Blood Bank response tab.
create or replace function public.get_my_active_blood_alerts(
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  notification_id uuid,
  type text,
  title_bn text,
  body_bn text,
  data jsonb,
  is_read boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not exists(
    select 1
    from public.profiles p
    where p.id=auth.uid()
      and p.role='patient'
      and p.account_status='active'
  ) then
    raise exception 'Only active patient accounts can read blood alerts';
  end if;

  return query
  select
    n.id,
    n.type,
    n.title_bn,
    n.body_bn,
    coalesce(n.data,'{}'::jsonb),
    n.read_at is not null,
    n.created_at
  from public.notifications n
  join public.blood_requests r
    on r.id::text=n.data->>'blood_request_id'
  where n.recipient_id=auth.uid()
    and n.type in ('blood_request','blood_direct_request')
    and r.status in ('open','partially_fulfilled')
    and (r.needed_at is null or r.needed_at>=now())
  order by n.created_at desc,n.id
  limit greatest(1,least(coalesce(p_limit,30),50))
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

revoke all on function public.get_my_active_blood_alerts(integer,integer) from public,anon;
grant execute on function public.get_my_active_blood_alerts(integer,integer) to authenticated,service_role;

-- Idempotently replace the job if the migration is re-applied.
select cron.unschedule(jobid)
from cron.job
where jobname='docbd-expire-blood-requests-every-15-minutes';

select cron.schedule(
  'docbd-expire-blood-requests-every-15-minutes',
  '*/15 * * * *',
  $cron$select public.expire_old_blood_requests();$cron$
);

do $$
begin
  if not exists(
    select 1 from pg_trigger
    where tgname='trg_notifications_enqueue_web_push'
      and not tgisinternal
  ) then
    raise exception 'STEP 70 failed: Step 51 notification push trigger is missing';
  end if;

  if has_function_privilege('authenticated','public.expire_old_blood_requests()','EXECUTE') then
    raise exception 'STEP 70 failed: authenticated can execute expiry mutation';
  end if;

  if not exists(
    select 1 from cron.job
    where jobname='docbd-expire-blood-requests-every-15-minutes'
  ) then
    raise exception 'STEP 70 failed: blood expiry cron job is missing';
  end if;
end;
$$;

select 'STEP 70 BLOOD PUSH AND EXPIRY SCHEDULER PASSED' as result;
