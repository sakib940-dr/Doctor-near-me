# Step 78 deployment — Contact, appointment, map এবং BMDC permission

এই package আগের Step 70–77 সহ সম্পূর্ণ deployable source। নতুন database পরিবর্তনটি
`supabase/78_public_profile_contact_map_independence.sql`-এ আছে।

## Deploy order

1. Supabase Dashboard → SQL Editor খুলুন।
2. `supabase/78_public_profile_contact_map_independence.sql` সম্পূর্ণ run করুন।
3. কোনো SQL error না থাকলে frontend source Vercel-এ deploy করুন।
4. Browser/PWA hard refresh করুন। Service Worker-এর পুরোনো cache থাকলে app একবার
   বন্ধ করে আবার খুলুন।

## Deploy-এর পর দ্রুত পরীক্ষা

- Pending/unverified Doctor profile-এ chamber phone থাকলে Call ও WhatsApp চালু।
- `accepting_appointments` চালু এবং visiting schedule থাকলে patient appointment নিতে পারে।
- Hospital/Chamber profile save-এর পর approval ছাড়াই public route, phone, WhatsApp ও
  reception appointment কাজ করে।
- GPS দিয়ে latitude/longitude save করার পর public profile-এর নিচে embedded map দেখা যায়
  এবং Google Maps-এ খোলা যায়।
- Doctor নিজের existing BMDC নম্বর বদলাতে গেলে `BMDC_CHANGE_REQUIRES_ADMIN` আসে।
- Admin/Super Admin → BMDC Correction থেকে Doctor UUID, নতুন BMDC ও reason দিয়ে
  সংশোধন করতে পারে।

## নীতির সীমা

Admin verification এখন identity/BMDC badge-এর জন্য; contact, map, chamber বা appointment
চালুর permission নয়। তবে report moderation-এ profile reject করা হলে, provider suspended
হলে অথবা account suspended/banned/deleted হলে public access বন্ধই থাকবে।
