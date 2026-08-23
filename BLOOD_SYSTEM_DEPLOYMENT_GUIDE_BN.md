# Blood System Steps 70–72 Deployment Guide

এই package-এ Blood Bank push delivery, request expiry, distance/compatibility,
১২০ দিনের donor eligibility, unit fulfillment এবং anti-spam hardening আছে।

## Deployment order

Production-এ frontend-এর আগে backend deploy করুন, কারণ নতুন frontend নতুন RPC
parameters ও response fields ব্যবহার করে।

### ১. Backup

- Supabase Dashboard থেকে production database backup/snapshot নিশ্চিত করুন।
- বর্তমান Vercel deployment এবং environment variables সংরক্ষণ করুন।

### ২. Existing push Edge Function deploy

Supabase CLI linked project থেকে চালান:

```powershell
supabase functions deploy send-web-push --no-verify-jwt
```

Step 51-এর existing secrets অপরিবর্তিত রাখতে হবে:

- `PUSH_WORKER_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- Supabase service/admin secret configuration

Frontend/Vercel-এ শুধু `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` থাকবে। Private key বা
service-role key frontend-এ দেবেন না।

### ৩. SQL migrations apply

Supabase SQL Editor-এ নিচের files ঠিক এই ক্রমে সম্পূর্ণ execute করুন:

1. `supabase/70_blood_push_and_expiry_scheduler.sql`
2. `supabase/71_blood_distance_compatibility_eligibility.sql`
3. `supabase/72_blood_fulfillment_privacy_antispam.sql`

Expected final messages:

```text
STEP 70 BLOOD PUSH AND EXPIRY SCHEDULER PASSED
STEP 71 BLOOD DISTANCE COMPATIBILITY ELIGIBILITY PASSED
STEP 72 BLOOD FULFILLMENT PRIVACY ANTISPAM PASSED
```

Step 70-এ `pg_cron` permission error হলে Supabase Dashboard-এর Database →
Extensions/Cron থেকে `pg_cron` enable করে Step 70 আবার চালান। Migration নিজে
প্রতি ১৫ মিনিটের expiry job schedule করে; আলাদা HTTP scheduler secret লাগে না।

### ৪. Frontend deploy

ZIP extract করে Vercel project-এ deploy করুন অথবা repository-তে changes push
করুন। প্রয়োজনীয় frontend variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_WEB_PUSH_VAPID_PUBLIC_KEY
```

Build command `npm run build`; output directory `dist`।

## Post-deployment verification

Supabase SQL Editor:

```sql
select jobname,schedule,active
from cron.job
where jobname='docbd-expire-blood-requests-every-15-minutes';

select has_function_privilege(
  'anon',
  'public.get_recent_active_blood_requests(integer)',
  'EXECUTE'
) as anon_recent_request_access;

select has_function_privilege(
  'authenticated',
  'public.confirm_blood_donation(uuid,uuid,integer)',
  'EXECUTE'
) as authenticated_can_confirm;
```

Expected: cron row active, `anon_recent_request_access=false`, এবং
`authenticated_can_confirm=true`।

Staging/test patient accounts দিয়ে পরীক্ষা করুন:

1. Donor push permission চালু করে exact এবং direct blood request পাঠান।
2. Push click করলে `/blood?tab=respond` খুলছে নিশ্চিত করুন।
3. Past `needed_at` request সর্বোচ্চ ১৫ মিনিটের মধ্যে expired হচ্ছে দেখুন।
4. Saved coordinates থাকা donor search-এ distance দেখুন।
5. Compatible toggle default OFF এবং opt-in result পরীক্ষা করুন।
6. Recent donation করা donor search/response/direct request-এ block হচ্ছে দেখুন।
7. Donor response-এর পাশে `Mark as donated` ব্যবহার করে unit progress ও request
   status `partially_fulfilled`/`fulfilled` হচ্ছে দেখুন।
8. একই donor-কে ২৪ ঘণ্টার মধ্যে আবার direct request এবং ঘণ্টায় ১১তম direct
   request block হচ্ছে নিশ্চিত করুন।

বাস্তব রোগী, phone number বা medical data দিয়ে staging test করবেন না।
