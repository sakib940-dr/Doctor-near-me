# docbd.info Web Push production setup

The browser receives only `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`. Never place `VAPID_PRIVATE_KEY`, `PUSH_WORKER_SECRET`, `SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, or another backend secret in Vite/Vercel frontend variables.

## 1. Apply database migration

Run `supabase/51_web_push_notification_center.sql` after Step 50.

## 2. Generate VAPID keys

From the project root:

```bash
npm run push:keys
```

Copy the generated values. Keep the private key secret. The public key is intentionally shared with browsers.

Also create a separate random worker secret. One exact local command is:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Store the output as `PUSH_WORKER_SECRET`. Do not reuse a Supabase API key for this value.

## 3. Frontend environment (Vercel)

Set only:

```text
VITE_WEB_PUSH_VAPID_PUBLIC_KEY=<generated VAPID public key>
```

Rebuild/redeploy the frontend after changing a `VITE_` variable.

## 4. Supabase Edge Function secrets

Supabase-hosted Edge Functions provide `SUPABASE_URL` and backend secret-key environment values. The worker prefers `SUPABASE_SECRET_KEYS.default` and retains a legacy `SUPABASE_SERVICE_ROLE_KEY` fallback for projects that have not migrated API keys yet.

Add these project secrets:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY='<generated VAPID public key>' \
  VAPID_PRIVATE_KEY='<generated VAPID private key>' \
  VAPID_SUBJECT='mailto:admin@docbd.info' \
  PUSH_WORKER_SECRET='<random secret, minimum 32 characters>'
```

Deploy the cron-only worker without gateway JWT verification because it authenticates the scheduler request itself with the `x-docbd-push-secret` header:

```bash
supabase functions deploy send-web-push --no-verify-jwt
```

The worker uses a constant-time digest comparison before processing any queue work.

## 5. Schedule the worker every minute

Enable the `pg_cron`/Cron and `pg_net` extensions. Store the project URL and the dedicated worker secret in Supabase Vault, not in a migration committed to source control.

Replace the placeholders and run once in SQL Editor:

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'docbd_project_url');
select vault.create_secret('YOUR_RANDOM_PUSH_WORKER_SECRET', 'docbd_push_worker_secret');

select cron.schedule(
  'docbd-web-push-worker-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='docbd_project_url') || '/functions/v1/send-web-push',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-docbd-push-secret',(select decrypted_secret from vault.decrypted_secrets where name='docbd_push_worker_secret')
    ),
    body := jsonb_build_object('source','cron','time',now()),
    timeout_milliseconds := 10000
  ) as request_id;
  $$
);
```

The same worker calls `enqueue_due_appointment_reminders(30)` before processing the push outbox.

## 6. Rotation

If `PUSH_WORKER_SECRET` is rotated, update the Edge Function secret and Vault value together.

If VAPID keys are rotated, update the frontend public key and Edge Function public/private keys together. Existing browser subscriptions were created against the old application-server key and may need to subscribe again. Prefer retaining a protected VAPID pair long-term rather than routinely rotating it.
