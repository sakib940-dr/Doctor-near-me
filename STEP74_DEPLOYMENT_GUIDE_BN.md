# Step 74 Deployment Guide

এই ZIP-এ সম্পূর্ণ frontend source, `supabase/` migration history এবং Edge Functions রয়েছে। আগের Step 1–73 ইতিমধ্যে deploy করা থাকলে শুধু নিচের ধাপগুলো অনুসরণ করুন।

## 1. Database migration

Supabase Dashboard → SQL Editor-এ নিচের file-এর সম্পূর্ণ SQL একবার চালান:

`supabase/74_independent_hospital_doctor_cards_reception.sql`

Success হলে শেষে এই notice দেখা যাবে:

`STEP 74 INDEPENDENT HOSPITAL DOCTOR CARDS AND RECEPTION PASSED`

Migration পুনরায় চালানোর প্রয়োজন নেই। এটি existing Doctor/provider links, appointments বা অন্য table drop/rename করে না।

## 2. Frontend deploy

Project root-এ environment values configure করুন (`.env.example` অনুসরণ করুন), তারপর:

```bash
npm install
npm run typecheck
npm run build
```

Vercel ব্যবহার করলে repository/source upload করে existing environment variables রেখেই production deploy দিন। Build command `npm run build`; output directory `dist`।

## 3. অতিরিক্ত configuration

- নতুন Edge Function deploy করতে হবে না। Reception appointment notifications existing `notifications` → Web Push outbox pipeline reuse করে।
- Terms ও Privacy content চাইলে Admin CMS থেকে `terms` এবং `privacy` page publish করুন। Publish না থাকলে নিরাপদ fallback message দেখাবে।
- Hospital/Chamber profile public ও verified থাকলে তাদের active Reception Doctor cards visitor page-এ দেখা যাবে।
- Hospital profile-এ reception phone/WhatsApp ঠিকভাবে save করা আছে কি না যাচাই করুন; managed Doctor card-এ personal phone field নেই।

## 4. Smoke test

1. Login/Register page-এ eye icon ও Terms checkbox পরীক্ষা করুন।
2. Hospital account → Reception Doctor Cards থেকে একটি card তৈরি করুন।
3. Hospital public profile-এ card, Reception Call/WhatsApp ও Appointment/Serial পরীক্ষা করুন।
4. Patient account থেকে serial request পাঠান।
5. Hospital → Reception appointments থেকে request confirm করে serial দিন।
6. Patient appointments ও notification center-এ confirmed serial দেখুন।

## Validation status

Packaging-এর আগে `npm install`, `npm run typecheck`, `npm run build`, `npm run push:validate` এবং `git diff --check` সফল হয়েছে।
