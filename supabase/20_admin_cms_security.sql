-- ============================================================
-- STEP 20 — ADMIN CMS + REFERENCE DATA SECURITY
-- Run after Step 19. Safe to re-run.
-- ============================================================

create or replace function public.get_admin_cms_snapshot()
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  return jsonb_build_object(
    'specialties',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'name_bn',s.name_bn,'name_en',s.name_en,'slug',s.slug,
      'icon_url',s.icon_url,'is_active',s.is_active,'sort_order',s.sort_order
    ) order by s.sort_order,s.id) from public.specialties s),'[]'::jsonb),
    'topics',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'name_bn',t.name_bn,'name_en',t.name_en,'slug',t.slug,
      'icon',t.icon,'description_bn',t.description_bn,
      'search_keywords',t.search_keywords,'is_active',t.is_active,
      'sort_order',t.sort_order,'specialty_ids',coalesce((select jsonb_agg(x.specialty_id order by x.specialty_id)
        from public.discovery_topic_specialties x where x.topic_id=t.id),'[]'::jsonb)
    ) order by t.sort_order,t.id) from public.discovery_topics t),'[]'::jsonb),
    'sections',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'section_key',s.section_key,'title_bn',s.title_bn,
      'title_en',s.title_en,'description_bn',s.description_bn,
      'data_source',s.data_source,'filter_config',s.filter_config,
      'view_all_path',s.view_all_path,'card_limit',s.card_limit,
      'is_active',s.is_active,'sort_order',s.sort_order
    ) order by s.sort_order,s.id) from public.homepage_sections s),'[]'::jsonb),
    'banners',coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.id,'title_bn',b.title_bn,'title_en',b.title_en,
      'subtitle_bn',b.subtitle_bn,'subtitle_en',b.subtitle_en,
      'image_path',b.image_path,'image_alt_bn',b.image_alt_bn,
      'target_url',b.target_url,'district_id',b.district_id,
      'starts_at',b.starts_at,'ends_at',b.ends_at,'is_active',b.is_active,
      'sort_order',b.sort_order
    ) order by b.sort_order,b.id) from public.homepage_banners b),'[]'::jsonb),
    'pages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'slug',p.slug,'title_bn',p.title_bn,'title_en',p.title_en,
      'body_bn',p.body_bn,'body_en',p.body_en,'seo_title',p.seo_title,
      'meta_description',p.meta_description,'is_published',p.is_published,
      'updated_at',p.updated_at
    ) order by p.slug) from public.content_pages p),'[]'::jsonb),
    'settings',coalesce((select jsonb_agg(jsonb_build_object(
      'setting_key',s.setting_key,'setting_value',s.setting_value,
      'is_public',s.is_public,'description',s.description,'updated_at',s.updated_at
    ) order by s.setting_key) from public.site_settings s
      where s.setting_key in ('public_brand','social_links','default_location')),'[]'::jsonb)
  );
end;
$$;

create or replace function public.save_admin_specialty(
  p_id bigint default null,p_name_bn text default null,p_name_en text default null,
  p_slug text default null,p_icon_url text default null,p_is_active boolean default true,
  p_sort_order integer default 0
)
returns bigint language plpgsql security definer set search_path=public
as $$
declare result_id bigint;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if length(trim(coalesce(p_name_bn,'')))<2 or length(trim(coalesce(p_name_en,'')))<2 then
    raise exception 'Bangla and English specialty names are required'; end if;
  if coalesce(trim(p_slug),'') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid specialty slug'; end if;
  if p_sort_order not between 0 and 100000 then raise exception 'Invalid sort order'; end if;
  if p_id is null then
    insert into public.specialties(name_bn,name_en,slug,icon_url,is_active,sort_order)
    values(trim(p_name_bn),trim(p_name_en),trim(p_slug),nullif(trim(p_icon_url),''),coalesce(p_is_active,true),p_sort_order)
    returning id into result_id;
  else
    update public.specialties set name_bn=trim(p_name_bn),name_en=trim(p_name_en),
      slug=trim(p_slug),icon_url=nullif(trim(p_icon_url),''),
      is_active=coalesce(p_is_active,true),sort_order=p_sort_order where id=p_id returning id into result_id;
    if result_id is null then raise exception 'Specialty not found'; end if;
  end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'cms_specialty_saved','specialty',result_id::text,
    jsonb_build_object('name_bn',trim(p_name_bn),'slug',trim(p_slug),'is_active',p_is_active,'sort_order',p_sort_order));
  return result_id;
exception when unique_violation then raise exception 'Specialty slug is already in use';
end;
$$;

create or replace function public.save_admin_discovery_topic(
  p_id bigint default null,p_name_bn text default null,p_name_en text default null,
  p_slug text default null,p_icon text default null,p_description_bn text default null,
  p_search_keywords text[] default null,p_specialty_ids bigint[] default null,
  p_is_active boolean default true,p_sort_order integer default 0
)
returns bigint language plpgsql security definer set search_path=public
as $$
declare result_id bigint; clean_specialty_ids bigint[];
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if length(trim(coalesce(p_name_bn,'')))<2 then raise exception 'Bangla topic name is required'; end if;
  if coalesce(trim(p_slug),'') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid topic slug'; end if;
  if cardinality(coalesce(p_search_keywords,'{}'::text[]))>30 then raise exception 'Too many search keywords'; end if;
  if p_sort_order not between 0 and 100000 then raise exception 'Invalid sort order'; end if;
  select coalesce(array_agg(distinct x),'{}'::bigint[]) into clean_specialty_ids
  from unnest(coalesce(p_specialty_ids,'{}'::bigint[])) x
  where exists(select 1 from public.specialties s where s.id=x);
  if p_id is null then
    insert into public.discovery_topics(name_bn,name_en,slug,icon,description_bn,search_keywords,is_active,sort_order)
    values(trim(p_name_bn),nullif(trim(p_name_en),''),trim(p_slug),nullif(trim(p_icon),''),
      nullif(trim(p_description_bn),''),coalesce(p_search_keywords,'{}'::text[]),coalesce(p_is_active,true),p_sort_order)
    returning id into result_id;
  else
    update public.discovery_topics set name_bn=trim(p_name_bn),name_en=nullif(trim(p_name_en),''),
      slug=trim(p_slug),icon=nullif(trim(p_icon),''),description_bn=nullif(trim(p_description_bn),''),
      search_keywords=coalesce(p_search_keywords,'{}'::text[]),is_active=coalesce(p_is_active,true),sort_order=p_sort_order
    where id=p_id returning id into result_id;
    if result_id is null then raise exception 'Discovery topic not found'; end if;
  end if;
  delete from public.discovery_topic_specialties where topic_id=result_id;
  insert into public.discovery_topic_specialties(topic_id,specialty_id)
  select result_id,x from unnest(clean_specialty_ids) x;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'cms_topic_saved','discovery_topic',result_id::text,
    jsonb_build_object('name_bn',trim(p_name_bn),'slug',trim(p_slug),'is_active',p_is_active,
      'sort_order',p_sort_order,'specialty_ids',to_jsonb(clean_specialty_ids)));
  return result_id;
exception when unique_violation then raise exception 'Topic slug is already in use';
end;
$$;

create or replace function public.save_admin_homepage_section(
  p_id uuid default null,p_section_key text default null,p_title_bn text default null,
  p_title_en text default null,p_description_bn text default null,p_data_source text default null,
  p_filter_config jsonb default '{}'::jsonb,p_view_all_path text default null,
  p_card_limit integer default 10,p_is_active boolean default true,p_sort_order integer default 0
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare result_id uuid;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if coalesce(trim(p_section_key),'') !~ '^[a-z][a-z0-9_]*$' then raise exception 'Invalid section key'; end if;
  if length(trim(coalesce(p_title_bn,'')))<2 then raise exception 'Bangla section title is required'; end if;
  if p_data_source not in ('doctor','provider','ambulance','topic','custom') then raise exception 'Invalid data source'; end if;
  if jsonb_typeof(coalesce(p_filter_config,'{}'::jsonb))<>'object' then raise exception 'Filter config must be a JSON object'; end if;
  if p_card_limit not between 1 and 30 or p_sort_order not between 0 and 100000 then raise exception 'Invalid limit or sort order'; end if;
  if p_view_all_path is not null and trim(p_view_all_path)<>'' and trim(p_view_all_path) !~ '^/' then raise exception 'View-all path must start with /'; end if;
  if p_id is null then
    insert into public.homepage_sections(section_key,title_bn,title_en,description_bn,data_source,filter_config,view_all_path,card_limit,is_active,sort_order,created_by)
    values(trim(p_section_key),trim(p_title_bn),nullif(trim(p_title_en),''),nullif(trim(p_description_bn),''),p_data_source,
      coalesce(p_filter_config,'{}'::jsonb),nullif(trim(p_view_all_path),''),p_card_limit,coalesce(p_is_active,true),p_sort_order,auth.uid())
    returning id into result_id;
  else
    update public.homepage_sections set section_key=trim(p_section_key),title_bn=trim(p_title_bn),title_en=nullif(trim(p_title_en),''),
      description_bn=nullif(trim(p_description_bn),''),data_source=p_data_source,filter_config=coalesce(p_filter_config,'{}'::jsonb),
      view_all_path=nullif(trim(p_view_all_path),''),card_limit=p_card_limit,is_active=coalesce(p_is_active,true),sort_order=p_sort_order
    where id=p_id returning id into result_id;
    if result_id is null then raise exception 'Homepage section not found'; end if;
  end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'cms_section_saved','homepage_section',result_id::text,
    jsonb_build_object('section_key',trim(p_section_key),'data_source',p_data_source,'is_active',p_is_active,'sort_order',p_sort_order));
  return result_id;
exception when unique_violation then raise exception 'Section key is already in use';
end;
$$;

create or replace function public.save_admin_homepage_banner(
  p_id uuid default null,p_title_bn text default null,p_title_en text default null,
  p_subtitle_bn text default null,p_subtitle_en text default null,p_image_path text default null,
  p_image_alt_bn text default null,p_target_url text default null,p_district_id bigint default null,
  p_starts_at timestamptz default null,p_ends_at timestamptz default null,
  p_is_active boolean default true,p_sort_order integer default 0
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare result_id uuid;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if length(trim(coalesce(p_title_bn,'')))<2 then raise exception 'Bangla banner title is required'; end if;
  if coalesce(trim(p_image_path),'') not like auth.uid()::text||'/cms/%'
     and not exists(
       select 1 from public.homepage_banners existing
       where existing.id=p_id and existing.image_path=trim(p_image_path)
     ) then raise exception 'Invalid Admin-owned banner path'; end if;
  if p_target_url is not null and trim(p_target_url)<>'' and trim(p_target_url) !~ '^(\/|https:\/\/)' then raise exception 'Target URL must be an internal path or HTTPS URL'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at then raise exception 'Banner end must be after start'; end if;
  if p_district_id is not null and not exists(select 1 from public.districts where id=p_district_id and is_active) then raise exception 'District not found'; end if;
  if p_sort_order not between 0 and 100000 then raise exception 'Invalid sort order'; end if;
  if p_id is null then
    insert into public.homepage_banners(title_bn,title_en,subtitle_bn,subtitle_en,image_path,image_alt_bn,target_url,district_id,starts_at,ends_at,is_active,sort_order,created_by)
    values(trim(p_title_bn),nullif(trim(p_title_en),''),nullif(trim(p_subtitle_bn),''),nullif(trim(p_subtitle_en),''),trim(p_image_path),
      nullif(trim(p_image_alt_bn),''),nullif(trim(p_target_url),''),p_district_id,p_starts_at,p_ends_at,coalesce(p_is_active,true),p_sort_order,auth.uid()) returning id into result_id;
  else
    update public.homepage_banners set title_bn=trim(p_title_bn),title_en=nullif(trim(p_title_en),''),subtitle_bn=nullif(trim(p_subtitle_bn),''),
      subtitle_en=nullif(trim(p_subtitle_en),''),image_path=trim(p_image_path),image_alt_bn=nullif(trim(p_image_alt_bn),''),
      target_url=nullif(trim(p_target_url),''),district_id=p_district_id,starts_at=p_starts_at,ends_at=p_ends_at,
      is_active=coalesce(p_is_active,true),sort_order=p_sort_order where id=p_id returning id into result_id;
    if result_id is null then raise exception 'Homepage banner not found'; end if;
  end if;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'cms_banner_saved','homepage_banner',result_id::text,
    jsonb_build_object('title_bn',trim(p_title_bn),'district_id',p_district_id,'is_active',p_is_active,'sort_order',p_sort_order));
  return result_id;
end;
$$;

create or replace function public.save_admin_content_page(
  p_slug text,p_title_bn text,p_title_en text default null,p_body_bn text default '',
  p_body_en text default null,p_seo_title text default null,p_meta_description text default null,
  p_is_published boolean default false
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare result_id uuid;
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_slug not in ('about','terms','privacy','faq','help') then raise exception 'Unsupported content page'; end if;
  if length(trim(coalesce(p_title_bn,'')))<2 then raise exception 'Bangla page title is required'; end if;
  if coalesce(p_is_published,false) and length(trim(coalesce(p_body_bn,'')))<20 then raise exception 'Published Bangla content must be at least 20 characters'; end if;
  insert into public.content_pages(slug,title_bn,title_en,body_bn,body_en,seo_title,meta_description,is_published,updated_by)
  values(p_slug,trim(p_title_bn),nullif(trim(p_title_en),''),coalesce(p_body_bn,''),nullif(p_body_en,''),nullif(trim(p_seo_title),''),
    nullif(trim(p_meta_description),''),coalesce(p_is_published,false),auth.uid())
  on conflict(slug) do update set title_bn=excluded.title_bn,title_en=excluded.title_en,body_bn=excluded.body_bn,body_en=excluded.body_en,
    seo_title=excluded.seo_title,meta_description=excluded.meta_description,is_published=excluded.is_published,updated_by=auth.uid(),updated_at=now()
  returning id into result_id;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'cms_page_saved','content_page',result_id::text,jsonb_build_object('slug',p_slug,'is_published',p_is_published));
  return result_id;
end;
$$;

create or replace function public.save_admin_public_setting(
  p_setting_key text,p_setting_value jsonb,p_is_public boolean default true
)
returns boolean language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin_or_above() then raise exception 'Admin access required'; end if;
  if p_setting_key not in ('public_brand','social_links','default_location') then raise exception 'This setting is Super Admin-only or unsupported'; end if;
  if jsonb_typeof(p_setting_value)<>'object' then raise exception 'Setting value must be a JSON object'; end if;
  insert into public.site_settings(setting_key,setting_value,is_public,updated_by)
  values(p_setting_key,p_setting_value,coalesce(p_is_public,true),auth.uid())
  on conflict(setting_key) do update set setting_value=excluded.setting_value,is_public=excluded.is_public,updated_by=auth.uid(),updated_at=now();
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'cms_setting_saved','site_setting',p_setting_key,jsonb_build_object('is_public',p_is_public));
  return true;
end;
$$;

revoke insert,update,delete on table public.specialties,public.discovery_topics,
  public.discovery_topic_specialties,public.homepage_sections,public.homepage_banners,
  public.content_pages,public.site_settings from public,anon,authenticated;

revoke all on function public.get_admin_cms_snapshot() from public,anon;
grant execute on function public.get_admin_cms_snapshot() to authenticated,service_role;
revoke all on function public.save_admin_specialty(bigint,text,text,text,text,boolean,integer) from public,anon;
grant execute on function public.save_admin_specialty(bigint,text,text,text,text,boolean,integer) to authenticated,service_role;
revoke all on function public.save_admin_discovery_topic(bigint,text,text,text,text,text,text[],bigint[],boolean,integer) from public,anon;
grant execute on function public.save_admin_discovery_topic(bigint,text,text,text,text,text,text[],bigint[],boolean,integer) to authenticated,service_role;
revoke all on function public.save_admin_homepage_section(uuid,text,text,text,text,text,jsonb,text,integer,boolean,integer) from public,anon;
grant execute on function public.save_admin_homepage_section(uuid,text,text,text,text,text,jsonb,text,integer,boolean,integer) to authenticated,service_role;
revoke all on function public.save_admin_homepage_banner(uuid,text,text,text,text,text,text,text,bigint,timestamptz,timestamptz,boolean,integer) from public,anon;
grant execute on function public.save_admin_homepage_banner(uuid,text,text,text,text,text,text,text,bigint,timestamptz,timestamptz,boolean,integer) to authenticated,service_role;
revoke all on function public.save_admin_content_page(text,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.save_admin_content_page(text,text,text,text,text,text,text,boolean) to authenticated,service_role;
revoke all on function public.save_admin_public_setting(text,jsonb,boolean) from public,anon;
grant execute on function public.save_admin_public_setting(text,jsonb,boolean) to authenticated,service_role;

do $assert$
begin
  if has_function_privilege('anon','public.get_admin_cms_snapshot()','EXECUTE')
     or has_function_privilege('anon','public.save_admin_specialty(bigint,text,text,text,text,boolean,integer)','EXECUTE') then
    raise exception 'Step 20 failed: anonymous CMS RPC access remains'; end if;
  if not has_function_privilege('authenticated','public.save_admin_homepage_section(uuid,text,text,text,text,text,jsonb,text,integer,boolean,integer)','EXECUTE') then
    raise exception 'Step 20 failed: authenticated CMS RPC grant missing'; end if;
  if has_table_privilege('authenticated','public.homepage_sections','UPDATE')
     or has_table_privilege('authenticated','public.homepage_banners','INSERT')
     or has_table_privilege('authenticated','public.site_settings','DELETE') then
    raise exception 'Step 20 failed: direct CMS mutation grant remains'; end if;
end;
$assert$;

select 'STEP 20 ADMIN CMS SECURITY PASSED' as result;
