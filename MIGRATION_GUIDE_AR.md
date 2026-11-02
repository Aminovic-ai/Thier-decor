# تجهيز Thier Décor للبيئة الجديدة

هذه النسخة على فرع `migration-prep`، وهو فرع تجهيز مستقل. لا تنشره على المتجر الحالي قبل استكمال القيم والاختبارات.

## ما تم تجهيزه
- جمع عنوان Worker ومعرّف مسؤول Firebase وإعدادات Supabase/Firebase العامة في `td-config.js`.
- إزالة تكرار عنوان Worker من `app.js` و`analytics-notifications.js`.
- جعل `supabase-config.js` و`firebase-config.js` يقرآن الإعدادات من ملف مركزي واحد.
- إضافة ملف الإعدادات إلى الصفحة وذاكرة PWA مع تحديث إصدار cache.
- فصل إعدادات Worker V2 عن المشروع القديم.
- إضافة فحوصات CI لصياغة JavaScript واختبارات PBKDF2 وتحليل ملفات SQL.

## ما سيتغير عند إنشاء الخدمات الجديدة
بعد إنشاء Supabase وWorker الجديدين، حدّث `td-config.js`:
- `apiUrl`: عنوان Worker الجديد.
- `supabase.url`: رابط مشروع Supabase الجديد.
- `supabase.publishableKey`: المفتاح العام publishable فقط.
- `adminUid`: UID المسؤول في Firebase Auth.
- `firebase`: إعدادات Firebase العامة. يبقى Firebase الحالي مؤقتًا ما لم تقرر إنشاء مشروع Firebase جديد.

## GitHub Environment
أنشئ Environment باسم `cloudflare-new` وأضف:
- Secret: `CLOUDFLARE_API_TOKEN`
- Variable: `CLOUDFLARE_ACCOUNT_ID`
- Variable: `SUPABASE_URL`
- Variable: `ALLOWED_ORIGINS` (نطاق المتجر ونطاقات الاختبار المعتمدة).

## أسرار Cloudflare Worker
تُضبط كـ Secrets من لوحة Cloudflare، ولا تحفظ في GitHub أو ملفات الواجهة:
- `SUPABASE_SERVICE_ROLE_KEY`
- `CUSTOMER_PASSWORD_SERVICE_SECRET` (يجب أن يطابق سر Edge Function في Supabase)
- `CUSTOMER_SESSION_SECRET`
- `AUTH_RATE_SECRET`
- `VISIT_RATE_SECRET`
كما يلزم ضبط `FIREBASE_API_KEY` و`ADMIN_UID` كمتغيرات وفق إعدادات Worker.

## ترتيب الانتقال
راجع `SUPABASE_MIGRATION_ORDER_AR.md` لترتيب ملفات SQL الصحيح؛ لا تشغّل ملفات المراجعة الأخرى عشوائياً.
1. إنشاء Supabase جديد، ثم مقارنة المخطط وتطبيق migrations على بيئة اختبار فقط.
2. نشر Edge Function `customer-password` واختبار hash/verify على الخدمة المستضافة.
3. إنشاء Worker V2 وضبط المتغيرات والأسرار.
4. اختبار التسجيل والدخول والطلبات والمخزون والكوبونات والرسائل ولوحة المسؤول.
5. نشر الواجهة على Cloudflare Pages وربطها بـ Worker V2.
6. التحويل إلى النطاق الرسمي بعد نجاح اختبارات القبول.

## تحذيرات
- لا تنقل أي `service_role` أو `sb_secret_` أو سر مشترك إلى `td-config.js`.
- لا تشغّل ملفات SQL المسمّاة REVIEW على الإنتاج مباشرة؛ يجب مطابقة الجداول والأعمدة والدوال أولاً. تعريف `td_record_visit_safe` موجود ضمن `THIER_DECOR_FINAL_SECURITY_AND_ORDER_MUTATIONS_REVIEW.sql` ويستخدم جدول `td_visit_sessions`؛ لا تضف ملف تتبع زيارات بديلًا أو أقدم.
- لا تنقل بيانات العملاء والطلبات قبل backup والتحقق من أعداد السجلات.
- لا تحذف أو توقف الخدمات القديمة خلال فترة الاختبار.
- إعدادات CORS في Worker تحتاج ضبط النطاقات النهائية قبل فتح البيئة الجديدة للعامة.
- نجاح فحص الصياغة لا يثبت أن تسجيل الدخول أو قاعدة البيانات تعمل حيًا.
