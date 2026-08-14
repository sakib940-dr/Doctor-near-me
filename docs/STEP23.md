# Step 23 — Visitor Landing Page Redesign (Frontend Only)

এই ধাপে **backend/Supabase-এ কোনো পরিবর্তন করা হয়নি** — শুধু visitor/patient
landing experience-কে নতুন লেআউট অনুযায়ী পুনরায় সাজানো হয়েছে, বিদ্যমান
component/service ব্যবহার করে।

## নতুন ফাইল
- `src/pages/HomePage.tsx` — নতুন ভিজিটর ল্যান্ডিং পেজ (`App.tsx`-এর পুরনো
  inline `HomePage` সরিয়ে এখানে আনা হয়েছে)
- `src/pages/HospitalsListPage.tsx` — হাসপাতাল/চেম্বার ভার্টিক্যাল লিস্ট (২০/পেজ)
- `src/pages/HospitalProfilePage.tsx` — একক হাসপাতাল/চেম্বার প্রোফাইল
  (ডাক্তার লিস্ট + লোকেশন বক্স + Google Maps direction)
- `src/pages/BloodBankPage.tsx` — রক্তদাতা সার্চ পেজ
- `src/pages/AmbulancePage.tsx` — পাবলিক অ্যাম্বুলেন্স সার্চ পেজ
- `src/components/DoctorHorizontalCard.tsx`, `DoctorRow.tsx`,
  `ProviderCard.tsx`, `ProviderRow.tsx`, `LocationSearchBar.tsx`
- `src/hooks/useGeolocation.ts` — ব্রাউজার লোকেশন পারমিশন হ্যান্ডলার

## Route পরিবর্তন (`App.tsx`)
- `/` → লগইন করা থাকলে `/dashboard`-এ রিডাইরেক্ট (role অনুযায়ী `DashboardPage`
  নিজেই handle করে); লগইন না থাকলে নতুন visitor `HomePage`
- নতুন: `/hospitals`, `/hospitals/:providerId`, `/blood-bank`, `/ambulance`
- `PublicHeader`-এর নেভিগেশন লিংক আপডেট করা হয়েছে নতুন রুটে

## জানা সীমাবদ্ধতা (backend অপরিবর্তিত রাখার কারণে)
নিচের তিনটি বিদ্যমান RPC `SECURITY INVOKER` এবং `profiles` টেবিল জয়েন করে;
Step 12-এ anon role-এর জন্য `profiles` SELECT বন্ধ করা হয়েছিল বলে **লগইন
ছাড়া ভিজিটরদের জন্য এগুলো খালি ফলাফল দেবে** (এরর নয়, গ্রেসফুল fallback করা
আছে):
- `get_provider_doctors` — হাসপাতাল/চেম্বার প্রোফাইলে ডাক্তার লিস্ট
- `nearest_doctors` — GPS-ভিত্তিক "আপনার কাছাকাছি ডাক্তার"
- `search_blood_donors` — রক্তদাতা সার্চ

এগুলো লগইন করা ব্যবহারকারীর জন্য স্বাভাবিকভাবে কাজ করবে। অ্যানোনিমাস
ভিজিটরদের জন্য পুরোপুরি কাজ করাতে হলে ভবিষ্যতে এই তিনটি ফাংশনকে
`SECURITY DEFINER` করা প্রয়োজন হবে (এই ধাপে ইচ্ছাকৃতভাবে করা হয়নি)।

এছাড়া `search_doctors_advanced` / `doctors_by_area` কোনোটাই BMDC
রেজিস্ট্রেশন নম্বর রিটার্ন করে না (শুধু `get_doctor_public_profile` করে) —
তাই ডাক্তার লিস্ট কার্ডে BMDC তখনই দেখা যাবে যখন ডেটা থাকবে; প্রোফাইল
পেজে সবসময় দেখা যাবে।

"জনপ্রিয় ডাক্তার" নাম দিয়ে কোনো popularity/view-count মেট্রিক backend-এ
নেই, তাই সেই সেকশনটিকে honestly "সকল ডাক্তার" (নাম অনুযায়ী সাজানো) হিসেবে
রাখা হয়েছে।
