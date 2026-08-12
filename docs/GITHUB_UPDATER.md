# نشر تحديثات Resto POS عبر GitHub Releases

## الإعداد لمرة واحدة

1. ارفع المشروع إلى مستودع GitHub.
2. افتح المستودع ثم **Settings → Secrets and variables → Actions**.
3. أضف Secret باسم `TAURI_SIGNING_PRIVATE_KEY`، وضع بداخله محتوى الملف:
   `C:\Users\fadly\.tauri\resto-pos-updater.key`
4. لا تحتاج Secret لكلمة المرور لأن المفتاح الحالي دون كلمة مرور.
5. احتفظ بنسخة آمنة خارج الجهاز من المفتاح الخاص. فقدانه يمنع إصدار تحديثات للعملاء الحاليين.

المفتاح العام موجود داخل `src-tauri/tauri.conf.json`، ويمكن رفعه بأمان. لا ترفع المفتاح الخاص إلى GitHub.

## إصدار تحديث

1. غيّر رقم الإصدار في الملفات الثلاثة:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
2. ارفع التعديلات إلى GitHub.
3. افتح **Actions → Build signed Windows release → Run workflow**.
4. سيُنشئ GitHub Release بحالة Draft يحتوي على:
   - ملف تثبيت NSIS.
   - ملف التحديث الموقّع.
   - ملف `latest.json` الذي تقرؤه أجهزة العملاء.
5. عدّل ملاحظات الإصدار ثم اضغط **Publish release**.

بعد نشر الـRelease، يفحص برنامج العميل الرابط التالي تلقائيًا عند الفتح:

`https://github.com/OWNER/REPOSITORY/releases/latest/download/latest.json`

لا تستخدم Release قديمًا أو Draft؛ التحديث يصل بعد نشره فقط. يجب أن يكون رقم الإصدار الجديد أكبر من الإصدار المثبت.

## أول نسخة عند العميل

أول نسخة تحتوي على الـUpdater تُثبت يدويًا مرة واحدة. بعد ذلك تصل الإصدارات الأحدث تلقائيًا، مع زر فحص يدوي داخل **الإعدادات → الدعم الفني والتفعيل**.

## بناء محلي بعد إنشاء المستودع

إذا أردت البناء محليًا بدل GitHub Actions، عرّف المتغيرين في PowerShell قبل البناء:

```powershell
$env:RESTO_POS_UPDATE_REPOSITORY="OWNER/REPOSITORY"
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="$env:USERPROFILE\.tauri\resto-pos-updater.key"
npm run desktop:build
```

يجب رفع ملف التحديث وتوقيعه و`latest.json` إلى نفس GitHub Release. استخدام GitHub Actions أسهل وأقل عرضة للخطأ.
