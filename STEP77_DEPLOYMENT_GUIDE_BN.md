# Step 77 — 5 MB Image Upload Deployment

## Deploy order

1. আগের `supabase/76_doctor_upload_and_content_reliability.sql` deploy না হয়ে থাকলে আগে সেটি run করুন। BMDC/verification Storage path permission fix Step 76-এ আছে।
2. Supabase SQL Editor-এ `supabase/77_global_5mb_image_compression_policy.sql` সম্পূর্ণ run করুন।
3. `STEP 77 GLOBAL 5 MB IMAGE POLICY PASSED` notice নিশ্চিত করুন।
4. এরপর এই package-এর frontend deploy করুন।
5. Browser/PWA cache এড়াতে deploy শেষে hard refresh করুন অথবা installed PWA একবার বন্ধ করে আবার খুলুন।

## নতুন image policy

- JPG, PNG, WebP ও AVIF source image সর্বোচ্চ 5 MB।
- Upload-এর আগে browser image-কে WebP-তে compress করবে।
- Master image-এর hard maximum 200 KB; সাধারণ output target 100–200 KB।
- Compression ব্যর্থ হলে original image upload হবে না; upload field-এর কাছে error দেখাবে।
- Verification PDF image policy-এর অংশ নয় এবং সর্বোচ্চ 10 MB অপরিবর্তিত।

## Quick test

- Doctor onboarding → BMDC certificate হিসেবে 1–5 MB JPG/PNG দিন এবং Upload চাপুন।
- একই page-এ college/session/BMDC লেখা upload-এর পরও আছে কিনা দেখুন।
- 5 MB-এর বড় image select করলে সঙ্গে সঙ্গে Bengali error দেখা উচিত।
- Doctor/Hospital slider, profile photo, gallery ও Reception Doctor photo দিয়ে একই পরীক্ষা করুন।
