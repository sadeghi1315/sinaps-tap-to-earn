# SINAPS Tap-to-Earn — v1

این نسخه یک MVP قابل اجرا برای رابط Tap-to-Earn است.

## امکانات نسخه 1
- Tap to Earn
- Energy و بازسازی انرژی
- Level
- Daily bonus
- Referral demo
- Telegram Mini App آماده اجرا
- ذخیره وضعیت در LocalStorage
- طراحی موبایلی SINAPS

## نکته مهم
این نسخه برای تست UI و منطق اولیه است؛ امتیازها هنوز سمت سرور ثبت نمی‌شوند، بنابراین برای لانچ واقعی ضدتقلب نیست.

## اجرای سریع
فایل‌ها را روی یک هاست HTTPS قرار بده و URL صفحه `index.html` را به Mini App بات تلگرام وصل کن.

Telegram Mini Apps باید از داخل Telegram اجرا شوند و اطلاعات `initData` در سمت سرور برای نسخه واقعی اعتبارسنجی شود.

## مرحله بعدی پیشنهادی
1. Node.js + PostgreSQL/Supabase backend
2. اعتبارسنجی Telegram initData در سرور
3. سیستم Tap server-authoritative
4. Referral واقعی
5. Tasks
6. Leaderboard
7. TON Connect
8. اتصال به Jetton SNP برای توزیع on-chain

در نسخه واقعی هیچ‌وقت seed phrase/private key از کاربر نخواهیم گرفت.
