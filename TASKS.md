# 🎯 MELLAH POS — Linear-Style Project Tracker & Roadmap

> **ملاحظة مهمة**: هذا الملف هو المرجع الدائم للمشروع (Single Source of Truth). حتى لو تغير الشات أو فتحت جلسة جديدة، الـ Agent راح يقرا هاد الملف ويرجع للمكان اللي توقفنا فيه مباشرة دون ضياع أي معلومة.

---

## 📊 الحالة العامة للمشروع (Project Status Overview)

| الحالة | المكون / المرحلة | التفاصيل |
| :--- | :--- | :--- |
| ✅ **COMPLETED** | **Phase 1: Foundation & DB** | SQLite schema, Design tokens, Vitest base suite |
| ✅ **COMPLETED** | **Phase 2: Core POS Checkout** | POS screen, Barcode scanner, Shift open/close |
| ✅ **COMPLETED** | **Phase 3: Inventory & Matrix** | Product matrix builder (Size/Color), Ledger adjustments |
| ✅ **COMPLETED** | **Phase 4: Auth & Multi-Branch** | PIN auth (bcrypt), RBAC roles, Branch selection |
| ✅ **COMPLETED** | **Phase 5: Offline Sync Engine** | Sync queue, Supabase integration, Retry backoff |
| ✅ **COMPLETED** | **Phase 6: Returns & Refunds** | Barcode receipt lookup, Store credit engine, Restocks |
| ✅ **COMPLETED** | **Phase 7: Analytics & Reports** | Dashboard charts, Shift audit logs, Thermal receipt layouts |
| ✅ **COMPLETED** | **v2 Commercial Release** | Auto-updater, Maintenance tool, i18n French support |
| ✅ **COMPLETED** | **Packaging & Build Fixes** | Installed `fs-extra`, fixed NSIS `.ico` icon, built `.exe` |

---

## 🟢 1. المهام المكتملة (DONE)

- [x] **تثبيت وبناء الحزمة التنفيذية**: توليد `MellahPOS Setup 1.0.0.exe` و `MellahPOS 1.0.0.exe` بنجاح في مجلد `dist/`.
- [x] **حل خطأ `fs-extra`**: إضافة `fs-extra` و `@types/fs-extra` لقائمة الـ dependencies الأساسية.
- [x] **إصلاح أيقونة ويندوز**: ضبط مسار `build/icon.ico` في إعدادات NSIS داخل `package.json`.
- [x] **نظام التشفير والأمان**: تشفير PIN بالـ `bcrypt` مع الدعم التلقائي للبيانات القديمة (Auto-migration).
- [x] **المزامنة السحابية Offline-First**: دعم العمل بدون إنترنت مع مزامنة خلفية لـ Supabase دون إيقاف الكاشير.

---

## 🟡 2. قيد العمل حالياً (IN PROGRESS)

- [ ] **الاختبار الميداني والـ QA النهائي**: تجربة ملف التثبيت `.exe` المجمع وتأكيد استقرار جميع الواجهات على الحاسوب.

---

## 🔵 3. قائمة المهام القادمة (BACKLOG / TODO)

مع خيارات تحسين يمكننا العمل عليها حسب أولوية المحلات التجارية:

### 🔹 أداة المبيعات والخدمة (POS & Sales Enhancements)
- [ ] **نظام النقاط والولاء للزبائن (Customer Loyalty System)**: احتساب نقاط الشراء واستبدالها بتخفيضات.
- [ ] **إرسال الوصل عبر SMS / WhatsApp (Digital Receipt)**: خيار إرسال الفاتورة رقمياً للزبون.
- [ ] **دعم العملات المتعددة أو طرق الدفع المزدوجة (Dual Payment)**: خيار تقسيم الفاتورة (كاش + بطاقة / كاش + دين).

### 🔹 الإدارة والمخزون (Inventory & Store Ops)
- [ ] **تنبيهات المخزون الذكية (Smart Low Stock Alerts)**: إشعارات عند اقتراب نفاد حجم أو لون معين من الملابس.
- [ ] **استيراد وتصدير المنتجات عبر Excel/CSV**: رفع مئات المنتجات بضغطة زر واحدة.
- [ ] **نسخ احتياطي يدوي وتلقائي لقواعد البيانات (Local DB Backup/Restore)**: أداة بضغطة زر لتصدير ملف `.db`.

### 🔹 الواجهة والتجربة (UI/UX)
- [ ] **دعم الثيم الداكن (Dark Mode)**: ثيم ليلي اختياري للكاشير.
- [ ] **اختصارات لوحة المفاتيح السريعة (Keyboard Shortcuts)**: تخصيص أزرار سريعة (مثل F1 للإتمام، F2 لإلغاء الفاتورة).

---

## 🔴 4. سجل المشاكل والحلول (Bug Tracker)

| معرف المشكلة | الوصف | الحالة | الحل |
| :--- | :--- | :--- | :--- |
| `BUG-001` | `Cannot find module 'fs-extra'` عند تشغيل `.exe` | ✅ SOLVED | إضافة `fs-extra` للـ dependencies في `package.json` |
| `BUG-002` | فشل بناء NSIS بسبب `icon.png` | ✅ SOLVED | تغيير المسار إلى `build/icon.ico` في إعدادات NSIS |
| `BUG-003` | قفل ملفات `dist/` أثناء البناء | ✅ SOLVED | إنهاء عمليات `MellahPOS.exe` القديمة المعلقة |
| `BUG-004` | ترجمة فرنسية غير كاملة + غياب أيقونة النافذة + شريط الخطأ الأحمر | ✅ SOLVED | ترجمة فرنسية 100%، إضافة أيقونة النافذة وشريط المهام، وإلغاء شريط الخطأ الأحمر |

---
*آخر تحديث: 25 يوليو 2026*
