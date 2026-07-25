# بنية مشروع بيتنا POS

المشروع منظم بأسلوب **Feature-first layered architecture**. الهدف أن تكون كل شاشة قابلة للتطوير بدون ربطها مباشرة بقاعدة البيانات أو بتفاصيل بقية الشاشات.

## هيكل المجلدات

```text
src/
├─ app/
│  ├─ App.tsx                 # تجميع التطبيق وعرض الشاشة الحالية فقط
│  ├─ navigation.ts           # تعريف الصفحات والقائمة الجانبية
│  └─ useRestaurantState.ts   # تحميل الحالة وحفظها ورسائل التنبيه
│
├─ domain/
│  └─ types.ts                # نماذج وقواعد بيانات النشاط التجاري
│
├─ infrastructure/
│  ├─ db.ts                   # SQLite ونسخة Local Storage للتطوير
│  └─ seed.ts                 # البيانات الافتراضية
│
├─ shared/
│  ├─ contracts.ts            # العقود المشتركة بين الشاشات
│  ├─ format.ts               # تنسيق الأسعار والتواريخ وحالات الطلب
│  ├─ id.ts                   # إنشاء المعرفات
│  └─ ui.tsx                  # Modal وEmpty وStatusBadge وMiniStat
│
├─ features/
│  ├─ _internal/              # تنفيذ داخلي لا يتم استيراده من App
│  ├─ pos/                    # نقطة البيع
│  ├─ orders/                 # الطلبات وتعديل الطلب
│  ├─ kitchen/                # المطبخ والتجميع
│  ├─ delivery/               # المندوبون والتوصيل
│  ├─ customers/              # العملاء وسجل العميل
│  ├─ catalog/                # الأصناف والتصنيفات
│  ├─ inventory/              # المخزون والوصفات
│  ├─ growth/                 # الولاء والعروض
│  ├─ cash/                   # الخزنة
│  ├─ reports/                # التقارير
│  └─ settings/               # إعدادات المطعم
│
├─ main.tsx                   # نقطة تشغيل React
└─ styles.css                 # التصميم العام
```

## اتجاه الاعتماديات

```text
app → features → shared/domain
                 ↓
          infrastructure
```

- `domain` لا يعتمد على React أو SQLite.
- `shared` لا يحتوي على منطق خاص بشاشة واحدة.
- `features` تتعامل مع الحالة من خلال `ViewProps` ولا تفتح قاعدة البيانات مباشرة.
- `app` هو المكان الوحيد الذي يجمع الشاشات ويختار المعروض منها.
- `infrastructure` مسؤول عن التخزين فقط، ولا يحتوي على واجهة مستخدم.

## الواجهة العامة لكل Feature

كل Feature يصدّر مكوناته العامة من ملف `index.ts`. لذلك الاستيراد الصحيح يكون:

```ts
import { PosView } from "../features/pos";
import { OrdersView } from "../features/orders";
```

ولا يتم استيراد ملفات التنفيذ الداخلية من `App`.

مجلد `_internal` مخفي خلف هذه الواجهات العامة. يمكن تقسيم أي ملف تنفيذ داخله لاحقًا بدون تغيير الاستيرادات في التطبيق أو في بقية الـFeatures.

## إضافة Feature جديدة

1. أضف أنواع النشاط التجاري في `domain/types.ts` إذا لزم الأمر.
2. أنشئ مجلدًا جديدًا داخل `features`.
3. صدّر الواجهة العامة من `features/<feature>/index.ts`.
4. استخدم الأدوات العامة من `shared` بدل تكرارها.
5. أضف التخزين أو migration داخل `infrastructure/db.ts`.
6. أضف الصفحة إلى `app/navigation.ts` و`app/App.tsx`.
7. شغّل `npm run build` و`cargo check`.

## قواعد جودة الكود

- TypeScript يعمل بوضع `strict`.
- المتغيرات والاستيرادات غير المستخدمة تعتبر أخطاء بناء.
- لا يتم تكرار تنسيق الأسعار أو التواريخ أو مكونات الـModal.
- تحديثات الحالة تمر من خلال دالة `update` واحدة.
- ملفات التخزين لا تستورد React.
- المكونات العامة لا تعرف تفاصيل نشاط المطعم.
