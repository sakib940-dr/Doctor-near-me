-- ============================================================
-- STEP 22 — PROVIDER WEBSITE CONTENT
-- Run after Step 21. Safe to re-run.
-- ============================================================

create table if not exists public.provider_services (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers(id) on delete cascade,
  name jsonb not null,
  description jsonb,
  icon text,
  image text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.provider_gallery_images (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers(id) on delete cascade,
  category_id text,
  image text,
  caption jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.provider_slider_images (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers(id) on delete cascade,
  image text,
  icon text,
  caption jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.provider_reviews (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  name text not null,
  rating smallint not null check (rating between 1 and 5),
  text jsonb,
  comment text,
  reply jsonb,
  replied_at timestamptz,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.provider_treatment_costs (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers(id) on delete cascade,
  name jsonb not null,
  cost jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.provider_investigation_costs (
  id bigint generated always as identity primary key,
  provider_id uuid not null references public.providers(id) on delete cascade,
  name jsonb not null,
  cost jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_provider_services_provider on public.provider_services(provider_id,sort_order,id);
create index if not exists idx_provider_gallery_provider on public.provider_gallery_images(provider_id,sort_order,id);
create index if not exists idx_provider_slider_provider on public.provider_slider_images(provider_id,sort_order,id);
create index if not exists idx_provider_reviews_provider on public.provider_reviews(provider_id,is_published,sort_order,created_at desc);
create index if not exists idx_provider_treatment_provider on public.provider_treatment_costs(provider_id,sort_order,id);
create index if not exists idx_provider_investigation_provider on public.provider_investigation_costs(provider_id,sort_order,id);

-- Reuse the project's generic updated_at trigger helper.
drop trigger if exists trg_provider_services_updated_at on public.provider_services;
create trigger trg_provider_services_updated_at before update on public.provider_services for each row execute procedure public.set_updated_at();
drop trigger if exists trg_provider_treatment_costs_updated_at on public.provider_treatment_costs;
create trigger trg_provider_treatment_costs_updated_at before update on public.provider_treatment_costs for each row execute procedure public.set_updated_at();
drop trigger if exists trg_provider_investigation_costs_updated_at on public.provider_investigation_costs;
create trigger trg_provider_investigation_costs_updated_at before update on public.provider_investigation_costs for each row execute procedure public.set_updated_at();

-- Public website needs full approved+verified provider contact/about fields.
create or replace view public.public_provider_directory with (security_invoker=true) as
select
  id,
  provider_type,
  name_bn,
  name_en,
  slug,
  logo_url,
  banner_url,
  phone,
  address,
  district_id,
  upazila_id,
  latitude,
  longitude,
  coalesce(google_maps_url, map_url) as map_url,
  verified,
  -- Keep all pre-existing view columns above in their original order.
  -- PostgreSQL CREATE OR REPLACE VIEW only allows new columns to be appended.
  short_description,
  whatsapp,
  email,
  facebook_url,
  website_url,
  opening_note,
  emergency_available
from public.providers
where status='approved' and verified=true;

-- Common RLS expression: owner may see everything; public may see content only when
-- its parent provider is approved + verified.
DO $$
DECLARE t text; visibility text;
BEGIN
  FOREACH t IN ARRAY ARRAY['provider_services','provider_gallery_images','provider_slider_images','provider_reviews','provider_treatment_costs','provider_investigation_costs'] LOOP
    visibility := case
      when t in ('provider_services','provider_gallery_images','provider_slider_images') then ' and is_active=true'
      when t='provider_reviews' then ' and is_published=true'
      else ''
    end;
    EXECUTE format('alter table public.%I enable row level security',t);
    EXECUTE format('drop policy if exists %I on public.%I',t||'_select',t);
    EXECUTE format('drop policy if exists %I on public.%I',t||'_insert',t);
    EXECUTE format('drop policy if exists %I on public.%I',t||'_update',t);
    EXECUTE format('drop policy if exists %I on public.%I',t||'_delete',t);
    EXECUTE format($p$create policy %I on public.%I for select using (
      exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
      or (exists(select 1 from public.providers p where p.id=provider_id and p.status='approved' and p.verified=true)%s)
    )$p$,t||'_select',t,visibility);
    EXECUTE format($p$create policy %I on public.%I for insert with check (
      exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
    )$p$,t||'_insert',t);
    EXECUTE format($p$create policy %I on public.%I for update using (
      exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
    ) with check (
      exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
    )$p$,t||'_update',t);
    EXECUTE format($p$create policy %I on public.%I for delete using (
      exists(select 1 from public.providers p where p.id=provider_id and p.owner_user_id=auth.uid())
    )$p$,t||'_delete',t);
  END LOOP;
END $$;

grant select on public.provider_services,public.provider_gallery_images,public.provider_slider_images,public.provider_reviews,public.provider_treatment_costs,public.provider_investigation_costs to anon,authenticated;
grant insert,update,delete on public.provider_services,public.provider_gallery_images,public.provider_slider_images,public.provider_reviews,public.provider_treatment_costs,public.provider_investigation_costs to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- Storage stays in existing public-images bucket. Existing project policies scope writes
-- by the first path segment = auth.uid(); frontend uses <user>/<provider>/website/...
