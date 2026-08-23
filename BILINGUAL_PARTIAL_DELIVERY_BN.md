# Bilingual UI — বর্তমান আংশিক ডেলিভারি

এই package-এ বাংলা default এবং shared header/dashboard language toggle-এর বর্তমান
সম্পন্ন কাজ আছে। এটি frontend-only update; নতুন SQL migration নেই। আগের migrations
ও existing functionality package-এ অক্ষত আছে।

## এখন পর্যন্ত bilingual করা হয়েছে

- Public header, account role label, desktop/mobile dashboard language toggle
- Visitor bottom navigation
- Visitor homepage-এর search, location picker, category/doctor/provider sections
- Doctor এবং Hospital public listing cards
- Doctor directory ও filters
- Hospital/Chamber directory ও filters
- Patient profile, appointment list এবং Doctor booking flow
- Doctor appointment management-এর প্রধান UI
- Hospital profile editor, reception Doctor cards ও reception appointment queue-এর প্রধান UI
- Provider website এবং Terms/Privacy public pages
- Route/document title-এর মূল public labels

বাংলা copy-তে word-by-word replacement নয়, অর্থ ও context অনুযায়ী স্বাভাবিক
ভাবানুবাদ ব্যবহার করা হয়েছে। যেমন `Recently Joined Doctors` →
`সম্প্রতি যুক্ত হওয়া ডাক্তার`।

## এখনো বাকি

Doctor/Hospital dashboard-এর কিছু secondary modules—যেমন prescription, analytics,
premium, verification, support এবং content-management-এর প্রতিটি form/error message—
এখনো পূর্ণ bilingual audit করা হয়নি। এই package সেগুলো completed দাবি করে না।
