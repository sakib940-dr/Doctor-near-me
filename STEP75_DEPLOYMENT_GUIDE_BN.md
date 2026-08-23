# Step 75 Corrected Deployment Guide

এই package-এ Step 74 এবং corrected Step 75—দুইটি migration আছে।

## SQL deployment order

- Step 74 আগে deploy করা থাকলে শুধু `supabase/75_remove_doctor_provider_invitations.sql` চালান।
- Step 74 এখনো deploy না করলে প্রথমে `supabase/74_independent_hospital_doctor_cards_reception.sql`, তারপর `supabase/75_remove_doctor_provider_invitations.sql` চালান।

Step 75 সফল হলে notice:

`STEP 75 DOCTOR PROVIDER INVITATION REMOVAL PASSED`

## Step 75 কী করবে

- পুরোনো external Hospital–Doctor invitation/link rows মুছে দেবে।
- সেই external links-এর পুরোনো chamber schedules মুছে দেবে।
- invitation/search/respond/remove/provider-schedule RPC-গুলো drop করবে।
- ভবিষ্যতে external link পুনরায় insert/update হওয়া trigger দিয়ে বন্ধ করবে।
- Doctor-এর নিজের owned chamber link এবং existing appointment history অক্ষত রাখবে।

## Frontend deploy

Existing environment variables রেখে source deploy করুন। Vercel build command `npm run build`, output directory `dist`।

## Smoke test

1. Sign In page-এ Terms checkbox নেই নিশ্চিত করুন।
2. Sign Up page-এ Terms/Privacy checkbox ছাড়া submit না হওয়া নিশ্চিত করুন।
3. Doctor dashboard → `Location ও Public Map` খুলুন।
4. Browser location permission Allow করে GPS থেকে Latitude/Longitude নিন এবং chamber save করুন।
5. Approved Doctor public profile-এ embedded Google map দেখা যাচ্ছে কি না পরীক্ষা করুন।
6. `Google Maps-এ খুলুন` button নতুন tab-এ সঠিক location খুলছে কি না পরীক্ষা করুন।
7. Hospital account-এ শুধু independent Reception Doctor Cards আছে এবং কোনো Doctor invitation/link UI নেই নিশ্চিত করুন।

## Validation

Packaging-এর আগে `npm install`, `npm run typecheck`, `npm run build` এবং `git diff --check` সফল হয়েছে।
