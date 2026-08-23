# Step 76 Deployment Guide

এই package আগের deployed Step 75-এর পরের update।

## Deploy order

1. Supabase Dashboard → SQL Editor খুলুন।
2. `supabase/76_doctor_upload_and_content_reliability.sql` সম্পূর্ণ run করুন।
3. SQL শেষে `STEP 76 DOCTOR UPLOAD AND CONTENT RELIABILITY PASSED` notice নিশ্চিত করুন।
4. এরপর এই ZIP-এর frontend Vercel/বর্তমান hosting-এ deploy করুন।
5. পুরোনো browser cache থাকলে hard refresh করুন।

## Quick verification

- নতুন Doctor account দিয়ে onboarding-এর BMDC photo/PDF upload করুন।
- upload-এর আগে BMDC/college/session field-এ লেখা দিয়ে upload করুন; লেখা আর মুছে যাবে না।
- ভুল/বড় file দিলে upload section-এর কাছেই error দেখা যাবে।
- onboarding-এ একটি service যোগ করে সঙ্গে সঙ্গে নিচের list-এ দেখা যাচ্ছে কিনা দেখুন।
- Doctor Public Content থেকে slider image ও service add/delete পরীক্ষা করুন।
- Hospital website slider/service form-এ save করার পর false error হচ্ছে কিনা পরীক্ষা করুন।

## Rollout note

Step 76 চালানোর আগে নতুন frontend deploy করলে Doctor slider/service mutation কাজ করবে না, কারণ frontend নতুন RPC ব্যবহার করে। তাই SQL আগে, frontend পরে deploy করতে হবে।
