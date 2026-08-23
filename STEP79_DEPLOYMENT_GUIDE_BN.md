# Step 79 deployment — Hospital-only directory ও Doctor Chamber scope

এই package-এ আগের সব migration/source আছে। নতুন database পরিবর্তন:
`supabase/79_hospital_only_public_directory_doctor_chamber_scope.sql`।

## Deploy order

1. Supabase Dashboard → SQL Editor খুলুন।
2. `supabase/79_hospital_only_public_directory_doctor_chamber_scope.sql` সম্পূর্ণ run করুন।
3. SQL সফল হলে একই package-এর frontend Vercel-এ deploy করুন।
4. Browser/PWA hard refresh করুন।

## নতুন কার্যনীতি

- Visitor Hospital directory-তে শুধু `hospital` account-এর approved এবং verified
  Hospital দেখা যাবে।
- Doctor account থেকে তৈরি Chamber Hospital directory বা standalone Hospital profile-এ
  দেখা যাবে না।
- Doctor-owned Chamber-এর আলাদা Provider verification লাগবে না এবং verification staff
  queue/count-এ সেটি থাকবে না।
- Chamber-এর নাম, ঠিকানা, ফোন, WhatsApp, map এবং visiting schedule শুধু সংশ্লিষ্ট Doctor
  details/appointment flow-তে দেখা ও ব্যবহার করা যাবে।
- Hospital account-এর Hospital আগের মতো আলাদা verification-এর পরেই public হবে।

## Deploy-এর পর পরীক্ষা

- একটি approved কিন্তু unverified Hospital `/providers` তালিকায় আসে না।
- একটি approved+verified Hospital তালিকা ও public profile-এ আসে।
- Doctor dashboard থেকে Chamber save করলে verification চায় না।
- সেই Chamber `/providers` তালিকায় আসে না, কিন্তু Doctor public details-এ schedule/mapসহ আসে।
- Verification staff queue-তে Doctor-owned Chamber নেই; pending Hospital আছে।
