-- Blood request safety hardening
-- Keeps existing tables and adds duplicate protection without changing current flows.

create unique index if not exists idx_unique_active_direct_blood_request
on public.blood_request_responses(request_id, donor_id)
where status in ('pending','accepted');

create index if not exists idx_active_blood_requests_matching
on public.blood_requests(status, blood_group, district_id, created_at desc);

create index if not exists idx_blood_notifications_read_state
on public.notifications(recipient_id, read_at, created_at desc);

