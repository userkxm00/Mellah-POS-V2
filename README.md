# 🛍️ MELLAH POS V2 — Professional Retail Point of Sale & ERP System
### *برنامج الملاح المتقدم لإدارة المبيعات، المخزون، الديون، والورديات — المخصص للمحلات والأنشطة التجارية بالجزائر*

[![Commercial Release](https://img.shields.io/badge/Release-v1.0.1%20Commercial-blue?style=for-the-badge&logo=electron)](https://github.com/userkxm00/Mellah-POS-V2/releases)
[![Electron](https://img.shields.io/badge/Electron-v31.0.0-47848F?style=for-the-badge&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-v18.3.0-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v5.5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![SQLite WASM](https://img.shields.io/badge/Database-SQLite%20Offline%20WASM-003B57?style=for-the-badge&logo=sqlite)](https://sqlite.org/)
[![Supabase RLS](https://img.shields.io/badge/Cloud%20Sync-Supabase%20Fail--Closed-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Security Audited](https://img.shields.io/badge/Security-Strict%20Fail--Closed%20RLS-brightgreen?style=for-the-badge&logo=shield)](https://github.com/userkxm00/Mellah-POS-V2)

---

## 🌐 Quick Language Jump / التنقل السريع بين اللغات
- [🇬🇧 English Comprehensive Documentation](#-english-comprehensive-documentation)
- [🇩🇿 الدليل العربي التفصيل الشامل](#-الدليل-العربي-التفصيلي-الشامل)

---

# 🇬🇧 English Comprehensive Documentation

## 📑 Table of Contents (English)
1. [Project Overview & Core Mission](#1-project-overview--core-mission)
2. [Full Module Breakdown](#2-full-module-breakdown)
3. [Deep Architectural Specifications](#3-deep-architectural-specifications)
4. [Security & Row-Level Security (RLS) Blueprint](#4-security--row-level-security-rls-blueprint)
5. [Durable File-Based Auto-Backup System](#5-durable-file-based-auto-backup-system)
6. [Complete Database Schema Reference (18 Tables)](#6-complete-database-schema-reference-18-tables)
7. [Hardware & POS Peripheral Integration](#7-hardware--pos-peripheral-integration)
8. [Financial & Mathematical Formulas](#8-financial--mathematical-formulas)
9. [Developer Setup, Testing & Deployment](#9-developer-setup-testing--deployment)

---

## 1. Project Overview & Core Mission

**MELLAH POS V2** is a commercial-grade, **offline-first**, multi-branch Point of Sale (POS) and inventory management software engineered specifically for the Algerian retail market (clothing boutiques, shoes, electronics, cosmetics, and general trade). 

### Key Design Goals:
- **Zero-Downtime Offline Checkout**: POS transactions continue seamlessly during internet blackouts or server unavailability.
- **Fail-Closed Security**: Data isolation per branch enforced at database level with zero ambient data leaks.
- **100% Accounting Transparency**: Real-time shift cash reconciliation including customer cash debt repayments.
- **Durable Data Preservation**: Automated daily file-based backups written to local disk or external drives (USB/Cloud Sync) with 14-day rolling retention.

---

## 2. Full Module Breakdown

### 🛒 1. POS Checkout Module (`POSCheckoutPage.tsx`)
- **Fast Cart Operations**: Instant barcode scanner listener (`keydown`), live search by name, SKU, or barcode.
- **Multi-Variant Product Selector**: Interactive modal for selecting size (S, M, L, XL, XXL) and color combinations.
- **Flexible Payment Methods**: Cash (`cash`), Customer Credit Debt (`credit`), or Mixed Payment (`mixed`).
- **Keyboard Shortcuts**:
  - `F2`: Trigger Instant Checkout / Open Payment Dialog.
  - `F4`: Send ESC/POS pulse to open cash drawer with user toast feedback.
  - `ESC`: Clear current cart draft or close open modals.
- **Receipt Printing**: Direct thermal receipt printing or browser preview.

### 📦 2. Products & Inventory Matrix (`ProductsPage.tsx`)
- **Variant Matrix Management**: Multi-SKU product catalog with individual cost price, selling price, barcode, and stock per variant.
- **Minimum Stock Alerts**: Automatic visual highlight for products reaching low-stock thresholds.
- **Barcode SVG Generator**: In-browser barcode rendering for sticky labels (`40x30mm` and `50x25mm`).
- **Bulk CSV Data Operations**: Export product catalog to CSV and bulk-import inventory items.

### 💰 3. Cash Shift Reconciliation (`ShiftsPage.tsx`)
- **Shift Opening**: Cashiers enter starting cash balance (`initial_cash_dzd`).
- **Real-Time Cash Tracking**: Includes cash sales + **customer cash debt repayments** made during the shift.
- **Shift Closing Audit**: Compares actual physical cash counted against system expected cash.
- **Reconciliation Summary**: Displays exact surplus or shortage (`actual_cash - expected_cash`) with mandatory cashier closing notes.

### 📑 4. Customer & Debt Management (`CustomersPage.tsx`)
- **Customer Directory**: Full profile tracking (Name, Phone, Address, Credit Limit).
- **Double-Entry Debt Ledger (`customer_payments`)**: Tracks debt payments separately from individual sales.
- **Debt Balance Computation**:
  $$\text{Total Remaining Debt} = \sum (\text{Sale Remaining Debt}) - \sum (\text{Customer Debt Payments})$$

### 🚛 5. Supplier & Purchase Ledger (`SuppliersPage.tsx`)
- **Vendor Directory**: Wholesaler contact directory and balance sheet.
- **Purchase Orders (`supplier_purchases`)**: Invoice logging for stock restocks.
- **Supplier Payment Ledger (`supplier_payments`)**: Record settlement payments to suppliers.

### 🔄 6. Returns & Restock Management (`ReturnsPage.tsx`)
- **Invoice Search**: Retrieve sale receipts by sale code or customer barcode.
- **Item Return Processing**: Partial or full invoice item returns.
- **Automatic Restock**: Returned item quantities are automatically restored to `product_variants.stock_quantity`.

### 📊 7. Analytics & Executive Reports (`ReportsPage.tsx`)
- **Interactive Visualizations**: Daily, weekly, monthly revenue charts powered by Recharts.
- **Top Product Leaderboard**: Ranking products by volume sold and revenue generated.
- **Profit Margin Analytics**: Calculates net profit based on cost price vs selling price.

### ⚙️ 8. System Settings & Maintenance (`SettingsPage.tsx`)
- **Store Customization**: Store name, address, phone number, receipt header & footer text.
- **Thermal Printer Config**: 80mm / 58mm paper width selection, auto-print toggles.
- **Database Maintenance**: Run SQLite `VACUUM` compaction, `PRAGMA integrity_check`, and cache clear.

---

## 3. Deep Architectural Specifications

```
                     ┌──────────────────────────────────────────┐
                     │          Electron Main Process           │
                     │  (Window Lifecycle, Node fs, Native IPC) │
                     └────────────────────┬─────────────────────┘
                                          │  IPC Bridge (preload)
                     ┌────────────────────▼─────────────────────┐
                     │          Renderer React 18 App           │
                     │  (Zustand State, UI, POS Hotkeys, POS)   │
                     └──────────┬────────────────────┬──────────┘
                                │                    │
             ┌──────────────────▼───────┐    ┌───────▼──────────────────┐
             │ SQLite WASM Local Engine │    │ Supabase Cloud Engine    │
             │   (In-Memory + Disk Sync)│    │ (PostgreSQL 15 + RLS)    │
             └──────────────────────────┘    └──────────────────────────┘
```

---

## 4. Security & Row-Level Security (RLS) Blueprint

Every table in Supabase enforces strict **Fail-Closed Row-Level Security**. Unauthenticated requests or queries without a valid session token automatically return empty result sets (`[]`).

### SQL Helper Functions (`database/supabase_setup.sql`):
```sql
CREATE OR REPLACE FUNCTION current_user_branch_id()
RETURNS UUID AS $$
  SELECT branch_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Table Policy Matrix (18 Tables):
All tables (`sales`, `products`, `shifts`, `customer_payments`, etc.) utilize the fail-closed pattern:
```sql
CREATE POLICY "Strict Fail-Closed Branch Access"
ON public.sales FOR ALL
TO authenticated
USING (
  (is_admin()) OR (branch_id = current_user_branch_id())
);
```

---

## 5. Durable File-Based Auto-Backup System

- **Storage Location**: Real JSON snapshot files stored in `{userData}/backups/`.
- **Filename Convention**: `mellah-pos-backup-YYYY-MM-DDTHH-mm-ss.json`.
- **Rolling Retention**: Maximum **14 daily backups** kept. Older backups purged automatically.
- **Custom Location Picker**: User can configure external USB / cloud folder in `backup-config.json`.
- **Fallback Transparency**: If external USB is unplugged, system falls back to default directory and displays alert banner in Settings.

---

## 6. Complete Database Schema Reference (18 Tables)

| Table Name | Primary Key | Description & Columns |
|---|---|---|
| `branches` | `id` (UUID) | Branch locations: `name`, `code`, `address`, `phone`. |
| `users` | `id` (UUID) | System accounts: `full_name`, `role`, `pin_hash`, `branch_id`. |
| `categories` | `id` (UUID) | Categories: `name`, `slug`, `icon_name`, `branch_id`. |
| `products` | `id` (UUID) | Catalog: `name`, `barcode`, `base_price_dzd`, `min_stock_alert`. |
| `product_variants`| `id` (UUID) | SKU variants: `product_id`, `size`, `color`, `sku`, `stock_quantity`, `purchase_price_dzd`, `selling_price_dzd`. |
| `stock_movements` | `id` (UUID) | Inventory audit: `variant_id`, `type`, `quantity_change`, `reason`. |
| `shifts` | `id` (UUID) | Till shifts: `user_id`, `branch_id`, `opened_at`, `closed_at`, `initial_cash_dzd`, `expected_cash_dzd`, `actual_cash_dzd`, `difference_dzd`. |
| `sales` | `id` (UUID) | Sale receipts: `sale_code`, `shift_id`, `total_amount_dzd`, `paid_amount_dzd`, `remaining_debt_dzd`, `payment_method`. |
| `sale_items` | `id` (UUID) | Receipt items: `sale_id`, `variant_id`, `quantity`, `unit_price_dzd`, `total_price_dzd`. |
| `returns` | `id` (UUID) | Return logs: `sale_id`, `variant_id`, `quantity`, `refund_amount_dzd`. |
| `customers` | `id` (UUID) | Customer directory: `full_name`, `phone`, `total_purchases_dzd`, `remaining_debt_dzd`. |
| `customer_payments`|`id` (UUID)| Customer debt payments: `customer_id`, `shift_id`, `amount_dzd`, `payment_method`, `notes`. |
| `suppliers` | `id` (UUID) | Vendor directory: `company_name`, `phone`, `total_purchased_dzd`, `remaining_debt_dzd`. |
| `supplier_purchases`|`id` (UUID)| Vendor invoices: `supplier_id`, `invoice_code`, `total_amount_dzd`, `paid_amount_dzd`, `remaining_debt_dzd`. |
| `supplier_payments`|`id` (UUID)| Vendor payments: `supplier_id`, `amount_dzd`, `payment_method`. |
| `store_settings` | `branch_id` | Store profile: `store_name`, `store_address`, `receipt_footer_text`, `session_timeout_minutes`. |
| `audit_logs` | `id` (UUID) | Security logs: `user_id`, `action`, `entity_type`, `details`. |
| `backup_config` | Singleton | Backup folder preferences: `custom_dir`, `updated_at`. |

---

## 7. Hardware & POS Peripheral Integration

### Cash Drawer ESC/POS Pulse Command:
```ts
// ESC/POS Cash Drawer Pulse Signal
const htmlPulse = `<!DOCTYPE html><html><head><style>@page{size:80mm 10mm;margin:0;}body{margin:0;font-size:1px;}</style></head><body>&#27;&#112;&#0;&#25;&#250;</body></html>`
```

---

## 8. Financial & Mathematical Formulas

$$\text{Net Total} = \sum (\text{Unit Price} \times \text{Quantity}) - \text{Discount}$$

$$\text{Expected Cash} = \text{Initial Cash} + \text{Cash Sales} + \text{Customer Cash Debt Payments} - \text{Returns}$$

$$\text{Shift Difference} = \text{Actual Cash Counted} - \text{Expected Cash}$$

---

## 9. Developer Setup, Testing & Deployment

```bash
# Clean Run Unit Tests
pnpm test

# Production Desktop Build
pnpm build:win
```

---
<br/>
<hr/>
<br/>

# 🇩🇿 الدليل العربي التفصيلي الشامل

# 🛍️ MELLAH POS V2 — النظام المالي والتجاري لإدارة محلات التجزئة بالجزائر

**Mellah POS V2** هو تطبيق تجاري متكامل ومتقدم، يعمل بمبدأ **العمل المحلي المستقل (Offline-First)**، صُمم خصيصاً للمحلات والأنشطة التجارية في الجزائر (بوتيكات الملابس والأحذية، المواد الغذائية، المستحضرات، والأجهزة). يجمع التطبيق بين السرعة الفائقة لـ Electron و WASM SQLite على الجهاز المحالي، وبين الأمان المطلق والمزامنة السحابية عبر Supabase.

---

## 📑 فهرس المحتويات (بالعربية)
1. [نظرة عامة والأهداف الأساسية](#1-نظرة-عامة-والأهداف-الأساسية)
2. [التفصيل الكامل لوحدات النظام (Modules)](#2-التفصيل-الكامل-لوحدات-النظام-modules)
3. [المواصفات المعمارية والتقنية](#3-المواصفات-المعمارية-والتقنية)
4. [مخطط الأمان وسياسات RLS الصارمة](#4-مخطط-الأمان-وسياسات-rls-الصارمة)
5. [نظام النسخ الاحتياطي التلقائي على القرص](#5-نظام-النسخ-الاحتياطي-التلقائي-على-القرص)
6. [المرجع الكامل لجداول قاعدة البيانات (18 جدولاً)](#6-المرجع-الكامل-لجداول-قاعدة-البيانات-18-جدولاً)
7. [الربط مع الطابعات الحرارية ودرج المال](#7-الربط-مع-الطابعات-الحرارية-ودرج-المال)
8. [المعادلات المحاسبية والمالية](#8-المعادلات-المحاسبية-والمالية)
9. [دليل التشغيل والاختبارات للمطورين](#9-دليل-التشغيل-والاختبارات-للمطورين)

---

## 1. نظرة عامة والأهداف الأساسية

تم تطوير **Mellah POS V2** ليكون الحل التجاري النهائي للمحلات، حيث يضمن:
- **استمرارية البيع 100% بدون إنترنت**: لا يتوقف المحل إطلاقاً عند انقطاع الشبكة أو التغطية.
- **أمان وموثوقية البيانات**: فصل تام لبيانات الفروع ومنع أي تسريب بين المستخدمين.
- **شفافية الصندوق والمحاسبة**: احتساب دقيق لكاش الوردية بما فيه تسديدات ديون الزبائن النقدية.
- **حماية البيانات من الضياع**: نظام نسخ احتياطي تلقائي يكتب ملفات JSON على القرص أو الفلاشة الخارجية بـ 14 يوم تدوير.

---

## 2. التفصيل الكامل لوحدات النظام (Modules)

### 🛒 1. واجهة البيع السريع (`POSCheckoutPage.tsx`)
- **دعم قارئ البار كود**: التقاط فوري لرمز البار كود عبر الـ Scanner.
- **اختيار المتغيرات (Size/Color Matrix)**: نافذة سريعة لاختيار المقاس (S, M, L, XL, XXL) واللون.
- **طرق الدفع المتعددة**: كاش (`cash`)، بيع بالكريدي (`credit`)، أو دفع مشترك (`mixed`).
- **اختصارات الكيبورد السريعة**:
  - `F2`: إتمام الفاتورة فوراً.
  - `F4`: إرسال نبضة فتح درج المال مع إشعار توست.
  - `ESC`: إلغاء الفاتورة الحالية أو إغلاق النوافذ.

### 📦 2. إدارة المنتجات والمخزون (`ProductsPage.tsx`)
- **مصفوفة الألوان والمقاسات**: ربط كل قميص أو سروال بمقاسات وألوان مختلفة ولكل منها بار كود وستوك مستقل.
- **تنبيهات حد أدنى للستوك**: إشعار ملون تلقائي عند اقتراب نفاد المنتج من المستودع.
- **طباعة البار كود**: توليد طباعة ملصقات البار كود للمقاسين القياسيين (`40x30mm` و `50x25mm`).
- **استيراد وتصدير CSV**: تصدير قائمة المنتجات وإدخال المنتجات بالجملة عبر ملفات Excel/CSV.

### 💰 3. إدارة الورديات والصندوق (`ShiftsPage.tsx`)
- **فتح الوردية**: إدخال الكاش الأولي للصندوق (`initial_cash_dzd`).
- **متابعة التدفق النقدي**: احتساب مبيعات الكاش + **تسديد ديون الزبائن بالكاش خلال الوردية**.
- **مطابقة الشيفت**: مقارنة الكاش الفعلي المحسوب في اليد مع الكاش المتوقع في النظام عند القفل.
- **احتساب الفارق**: إظهار الفائض أو العجز (`actual_cash - expected_cash`) مع تسجيل ملاحظات البائع.

### 📑 4. دليل الزبائن والديون (`CustomersPage.tsx`)
- **سجل الزبائن**: متابعة ديون كل زبون وسقف الكريدي المسموح.
- **دفتر تسديد الديون (`customer_payments`)**: تسجيل دفعات الديون بشكل مستقل عن فواتير البيع.
- **حساب صافي الدين**:
  $$\text{إجمالي الدين المتبقي} = \sum (\text{ديون الفواتير}) - \sum (\text{دفتر تسديدات الزبون})$$

### 🚛 5. الموردين والمشتريات (`SuppliersPage.tsx`)
- **دليل الموردين**: سجل الموزعين وتجار الجملة.
- **فواتير الشراء (`supplier_purchases`)**: تسجيل فواتير السلعة الجديدة وتحديث الستوك.
- **دفتر تسديدات الموردين (`supplier_payments`)**: تسجيل الدفعات الصادرة للموردين.

### 🔄 6. المرجعات والاسترجاع (`ReturnsPage.tsx`)
- **البحث برقم الفاتورة**: استرجاع الفاتورة عبر البار كود أو الكود.
- **إرجاع جزئي أو كلي**: إرجاع عناصر محددة وإعادة كميتها آلياً للستوك.

### 📊 7. التقارير والإحصائيات (`ReportsPage.tsx`)
- **مخططات بيانية تفاعلية**: رسم بياني للمبيعات اليومية والشهرية عبر Recharts.
- **المنتجات الأكثر مبيعاً**: ترتيب السلع حسب الأرباح والكمية المباعة.
- **حساب صافي الأرباح**: احتساب هامش الربح بناءً على سعر الشراء وسعر البيع.

---

## 3. المواصفات المعمارية والتقنية

- **الواجهة الأمامية**: React 18, TypeScript, TailwindCSS, Zustand Store.
- **تطبيق الديسktop**: Electron 31, Electron Vite, Electron Builder.
- **قاعدة البيانات المحلية**: SQLite WASM (`sql.js`) مع الحفظ الفوري على القرص.
- **المزامنة السحابية**: Supabase (PostgreSQL) مع RLS مغلق تماماً.

---

## 4. مخطط الأمان وسياسات RLS الصارمة

جميع الجداول محمية بـ **Fail-Closed Row-Level Security** عبر دالتين أمنيتين:
```sql
CREATE OR REPLACE FUNCTION current_user_branch_id()
RETURNS UUID AS $$
  SELECT branch_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

## 5. نظام النسخ الاحتياطي التلقائي على القرص

- **المسار**: ملفات JSON حقيقية تحفظ في `{userData}/backups/`.
- **التدوير التلقائي**: الاحتفاظ بآخر **14 نسخة يومية** وحذف الأقدم آلياً.
- **تخصيص المسار الخارجي**: إمكانية اختيار فلاشة USB أو مجلد Google Drive / OneDrive مع إظهار تنبيه برتقالي في الإعدادات في حال فصل الفلاشة.

---

## 6. المرجع الكامل لجداول قاعدة البيانات (18 جدولاً)

1. `branches` — بيانات الفروع والمحلات.
2. `users` — المستخدمين والباعة وتشفير PIN.
3. `categories` — تصنيفات السلع.
4. `products` — قوالب المنتجات.
5. `product_variants` — مقاسات وألوان والبار كود والستوك.
6. `stock_movements` — سجل حركة المستودع والستوك.
7. `shifts` — الورديات وجلسات العمل.
8. `sales` — فواتير البيع والكاش والكريدي.
9. `sale_items` — تفاصيل الفاتورة.
10. `returns` — المرجعات واسترجاع المخزون.
11. `customers` — دليل الزبائن.
12. `customer_payments` — دفتر تسديد ديون الزبائن.
13. `suppliers` — دليل تجار الجملة.
14. `supplier_purchases` — فواتير الشراء والسلعة.
15. `supplier_payments` — تسديدات الموردين.
16. `store_settings` — إعدادات الفاتورة واللغة.
17. `audit_logs` — سجل عمليات الأمان والتغييرات.
18. `backup_config` — مسار الباكاب الخارجي.

---

## 7. الربط مع الطابعات الحرارية ودرج المال

نبضة فتح درج المال آلياً عند البيع أو عند زر `F4`:
```html
&#27;&#112;&#0;&#25;&#250;
```

---

## 8. المعادلات المحاسبية والمالية

$$\text{إجمالي الفاتورة} = \sum (\text{سعر الوحدة} \times \text{الكمية}) - \text{الخصم}$$

$$\text{الكاش المتوقع بالصندوق} = \text{الكاش الأولي} + \text{مبيعات الكاش} + \text{تسديدات ديون الزبائن بالكاش} - \text{المرجعات}$$

$$\text{فارق الوردية} = \text{الكاش الفعلي المحسوب} - \text{الكاش المتوقع}$$

---

## 9. دليل التشغيل والاختبارات للمطورين

```bash
# تشغيل كامل الفحوصات والاختبارات
pnpm typecheck; pnpm lint; pnpm test

# بناء الملف التنفيذي للويندوز
pnpm build:win
```

---

 حقوق الطبع والنشر © **فريق الملاح التجاري Mellah POS Team** — مخصص ومطور لمحلات الجزائر.
