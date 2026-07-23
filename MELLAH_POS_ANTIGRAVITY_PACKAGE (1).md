# MELLAH POS — Antigravity Build Package
## (Master Prompt + 6 Custom Skills + Phased Plan: 7-Day MVP + v1.1 Extension)

---

## 0. كيفاش تستعمل هاد الملف

1. حل مشروع فارغ جديد في **Antigravity** (فولدر جديد باسم `mellah-pos`).
2. نسخ قسم **"1. MASTER PROMPT"** كامل، حطو كـ أول رسالة للـ Agent.
3. أنشئ الفولدرات `.antigravity/skills/<skill-name>/SKILL.md` وحط فيهم محتوى قسم **"2. CUSTOM SKILLS"** (كل skill في فولدر خاص بيه).
4. الـ Agent غادي يقرا الـ skills أوتوماتيكيا (semantic triggering) كل ما يحتاجهم أثناء الخدمة.
5. **القاعدة الذهبية**: بعد كل Phase، قوللو للـ Agent: *"Show me the verification checklist results for this phase before we move to the next one."* ما تديروش Phase جديدة حتى توصل نتيجة "PASS" على جميع النقاط.

---

## 1. MASTER PROMPT (انسخو كامل كأول رسالة)

```
You are building "MELLAH POS" — a professional, commercial-grade, offline-first
desktop Point-of-Sale application for Algerian clothing/retail stores. This
product will be SOLD to real store owners, so code quality, data integrity,
and zero-bug reliability are non-negotiable. You must work in strict,
gated phases and NEVER move to the next phase until the current one passes
every item in its Definition of Done (DoD) checklist.

===========================================================
GLOBAL RULES (apply to every phase, no exceptions)
===========================================================

1. LANGUAGE & STACK (fixed, do not deviate):
   - Desktop shell: Electron (latest stable) + electron-vite
   - Frontend: React 18 + TypeScript (strict mode: true, noImplicitAny: true)
   - State: Zustand (lightweight, no Redux)
   - Local DB: SQLite via better-sqlite3 (synchronous, no async DB bugs)
   - Cloud DB: Supabase (Postgres) — mirrors local schema exactly
   - Styling: Tailwind CSS, no inline styles, no ad-hoc CSS files
   - Forms/validation: react-hook-form + zod (every input validated, no raw unvalidated user input ever touches the DB)
   - Printing: electron-pos-printer (ESC/POS thermal receipt support)
   - Barcode: keyboard-wedge input handling (no special hardware SDK needed)
   - Testing: Vitest for unit tests, Playwright for E2E critical flows
   - Package manager: pnpm only

2. TYPESCRIPT DISCIPLINE:
   - `any` is FORBIDDEN. If a type is unknown, define it properly.
   - Every database table has a matching TypeScript interface in /src/types.
   - All Supabase and SQLite queries must be typed, no raw untyped returns.

3. NO SILENT FAILURES:
   - Every async operation (sync, print, DB write) must have explicit
     try/catch with user-visible error feedback (toast/banner), never a
     silent console.log swallow.
   - Every DB write must be wrapped in a transaction.

4. DESIGN SYSTEM (locked, do not improvise) — PREMIUM, not flat/basic:
   - Aesthetic: modern, polished, macOS/Stripe/Linear-inspired light UI —
     this must feel like a paid commercial product, not a generic admin
     template. Depth, motion, and glass effects are required, not optional.
   - Font: Inter (with a distinct display weight for headings/totals)
   - Background: #F2F2F7
   - Cards: white background, rounded-xl (12px radius), layered ambient
     shadow (not one flat box-shadow) to create real depth
   - Accent color: #0A84FF, plus success (#30D158) and danger (#FF453A)
     for stock/payment states
   - Glassmorphism applied consistently across sidebar, modals, and the
     top toolbar (backdrop-blur + semi-transparent layering) — not just
     the sidebar alone
   - Micro-interactions required everywhere: smooth transitions (150-250ms
     ease) on hover/press/modal-open, subtle scale-down on button press,
     skeleton loaders (never a blank white flash while data loads), toast
     notifications that slide in/out smoothly
   - Numbers (totals, prices) get visual weight: larger size, tabular-nums,
     subtle color emphasis — the total must be impossible to misread on a
     busy checkout screen
   - Layout direction: RTL (dir="rtl") for the whole app, Arabic as primary
     language, with a language switcher (AR / FR) built for later but not
     required to be functional in phase 1.
   - Currency format: always "DA [amount]" with thousand separators
     (e.g., "DA 12,500")
   - Never use default browser fonts, never use pure black (#000), never use
     a single flat harsh box-shadow, never leave a blank/static loading state.
   - NOTE: "4D design" is not a real technical concept — what actually
     produces a premium feel is the combination above (layered depth, glass,
     motion, typography hierarchy). Build for that outcome, not a buzzword.

4b. DESKTOP WINDOW BEHAVIOR:
   - Standard resizable, maximizable, minimizable native window
     (`resizable: true`, `maximizable: true`, `minimizable: true`) —
     NOT a fixed-size popup.
   - Minimum window size: 1280x800; UI reflows gracefully above that,
     never overflows or clips at minimum size.
   - Remember last window size/position across restarts (local config
     file, not the business database).
   - Default launch state: maximized on first run.

5. DATA INTEGRITY RULES (critical — this is a commercial POS, money is involved):
   - Stock quantities are NEVER overwritten directly. All stock changes go
     through an `stock_movements` ledger table (type: sale / restock /
     adjustment / return). Current stock = SUM of movements. This makes
     every stock number auditable and prevents silent data corruption.
   - Every sale is atomic: creating a sale row + stock movement rows +
     payment row must happen in a single DB transaction. If any part fails,
     roll back everything.
   - All primary keys are UUID v4 (generated client-side), NEVER
     auto-increment integers. This is mandatory because multiple branches
     will generate records offline simultaneously, and auto-increment IDs
     will collide.
   - Every table has: id (uuid), created_at, updated_at, branch_id,
     deleted_at (soft delete, never hard delete business records).

6. WORKING METHOD — STRICT PHASE GATES:
   - You will build this project in the 7 phases defined in the project's
     PHASES.md file (I will provide it).
   - At the end of EVERY phase, you MUST:
     a. Run the full test suite (unit + relevant E2E) and show me the results.
     b. Run `tsc --noEmit` and confirm zero TypeScript errors.
     c. Run the linter and confirm zero errors/warnings.
     d. Produce a screenshot/recording Artifact showing the feature working.
     e. Present me a checklist (from PHASES.md) with PASS/FAIL per item.
   - You must EXPLICITLY ask me for confirmation before starting the next
     phase. Do not assume approval. Do not skip ahead even if you believe
     you already implemented something from a later phase.
   - If ANY test fails or ANY checklist item is FAIL, stay in the current
     phase and fix it. Do not patch around it — find the root cause.

7. NO PLACEHOLDER / FAKE DATA IN FINAL CODE:
   - Seed/demo data is allowed only in a clearly separated `seed.ts` script,
     never hardcoded inside components or business logic.

8. COMMIT DISCIPLINE:
   - Create a git commit at the end of every phase with message format:
     "Phase N complete: <short description> — all checks passed"

===========================================================
PROJECT CONTEXT
===========================================================
Client: independent Algerian clothing retail stores (single and multi-branch).
Primary user: cashier (fast checkout, barcode scan, minimal clicks).
Secondary user: store owner/admin (stock, reports, multi-branch overview).
Environment: store may have unstable or no internet — app MUST be 100%
usable offline, syncing silently when connection returns.

FULL PAGE INVENTORY (the complete app, across all phases):
1. Login / PIN entry
2. Open Shift (cash drawer opening count)
3. Checkout / POS screen (main cashier screen, barcode-first workflow)
4. Close Shift (cash drawer closing count + over/short display)
5. Products list (search/filter by category)
6. Add/Edit Product — clothing-specific: base info (name, category, image,
   description, cost, default price) PLUS a variant matrix builder where
   the user picks sizes (e.g. S/M/L/XL or numeric) and colors and the
   system generates one row per size×color combination, each with its own
   barcode (auto-generated or scanned in) and starting stock quantity.
7. Product Detail (view a single product with all its variants and their
   individual stock levels)
8. Inventory / Stock adjustment screen
9. Categories management
10. Sales history (searchable/filterable list of past sales, each openable
    to view/reprint receipt)
11. Returns / Exchange screen (v1.1)
12. Customers list + customer detail (v1.1)
13. Dashboard (sales overview, top products, low-stock alerts)
14. Reports (date range, per-branch breakdown, export)
15. Users & roles management (admin only)
16. Branches management (admin only, multi-branch)
17. Settings (store info, receipt template, printer setup, language) (v1.1)
18. Label/price-tag printing screen (select variant + quantity, print) (v1.1)

Now: read PHASES.md and DATABASE_SCHEMA.md (provided separately), then start
with Phase 1. Begin by presenting your understanding of Phase 1's scope and
your implementation plan as an Artifact BEFORE writing any code. Wait for my
go-ahead.
```

---

## 2. CUSTOM SKILLS

حط كل واحدة فـ `.antigravity/skills/<اسم-الفولدر>/SKILL.md`

### Skill 1 — `db-schema-integrity`

```markdown
---
name: db-schema-integrity
description: Use whenever creating, modifying, or reviewing any database table, migration, TypeScript type tied to the DB, or any code that writes to SQLite/Supabase. Ensures schema consistency, prevents data corruption, and enforces the ledger-based stock model.
---

# Database Schema Integrity Skill

Rules that MUST be followed for every table and every write operation:

1. Every table has: `id UUID PRIMARY KEY`, `branch_id UUID NOT NULL`,
   `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`,
   `deleted_at TIMESTAMPTZ NULL`.
2. Stock is NEVER a mutable column that gets overwritten. Stock is always
   derived by summing `stock_movements` rows for a product. Writing
   `UPDATE products SET stock = stock - 1` is FORBIDDEN — always insert a
   `stock_movements` row instead.
3. Every financial write (sale, refund, payment) must be inside a single
   DB transaction covering all related table writes. If the transaction
   function throws, nothing commits.
4. Any schema change must be done via a numbered migration file
   (e.g. `0001_init.sql`, `0002_add_returns.sql`), never by directly editing
   an old migration.
5. The Supabase (Postgres) schema and SQLite schema must be kept in exact
   sync — same table names, same column names, same types (map Postgres
   UUID/TIMESTAMPTZ to SQLite TEXT appropriately, document the mapping).
6. Before finishing any DB-related task, re-check: did I use UUID for the
   primary key? Did I avoid auto-increment? Did I add branch_id? Did I use
   a transaction for multi-table writes?
7. Write a Vitest test for every new table's core write/read logic before
   marking the task complete.
```

### Skill 2 — `offline-sync-engine`

```markdown
---
name: offline-sync-engine
description: Use whenever implementing, modifying, or debugging the sync engine between local SQLite and Supabase, including queueing, conflict resolution, retry logic, or connectivity detection.
---

# Offline Sync Engine Skill

The sync engine is the highest-risk part of this app (money/stock bugs here
are unacceptable). Follow this exact architecture:

1. **Operation queue, not table snapshot sync.** Every local write creates a
   `sync_queue` row: {id, table_name, operation (insert/update/delete),
   payload, created_at, synced_at NULL}. The sync engine pushes queued
   operations to Supabase in order, not entire table dumps.
2. **Two conflict strategies, chosen per data type — never one-size-fits-all:**
   - "Replaceable" fields (product name, price, description, settings):
     last-write-wins using `updated_at`.
   - "Additive/ledger" data (stock_movements, sales, payments): NEVER
     overwritten or merged — they are append-only. Conflicts are impossible
     by design because these are inserts, not updates.
3. **Connectivity detection**: check real Supabase reachability (a lightweight
   ping query), not just `navigator.onLine`, which is unreliable on desktop.
4. **Retry with exponential backoff** for failed pushes; never drop a queued
   operation silently. Failed operations stay in the queue and are retried.
5. **Idempotency**: every synced operation includes its UUID so re-sending
   a queued op twice (e.g. after a crash mid-sync) never creates duplicate
   records. Use `upsert` on the UUID primary key on the Supabase side.
6. **Never block the UI.** Sync runs in a background interval/queue
   processor; cashiers must be able to keep selling even if sync is stuck.
7. Before marking sync work complete, test explicitly: (a) two branches
   offline, both sell the last unit of the same product, reconnect both —
   verify no oversell and correct final stock via the ledger; (b) kill the
   app mid-sync and restart — verify no duplicate or lost records.
```

### Skill 3 — `pos-ui-design-system`

```markdown
---
name: pos-ui-design-system
description: Use whenever creating or modifying any React component, page, or styling in the MELLAH POS app, to enforce the locked design system.
---

# MELLAH POS Design System Skill

Non-negotiable visual rules:

- Font: Inter, loaded via @fontsource or Google Fonts, never system default.
- Base background: #F2F2F7. Cards: white background, rounded-xl (12px),
  shadow-sm only (no heavy shadows).
- Accent/primary color: #0A84FF. Use consistently for primary buttons,
  active states, links — never introduce a second "random" accent color.
- Sidebar: frosted-glass (backdrop-blur-md + semi-transparent background),
  Arabic labels, RTL layout.
- Whole app direction: `dir="rtl"`, Arabic as default language.
- All currency values rendered through a single shared `formatCurrency()`
  utility that outputs "DA 12,500" style — never format currency ad-hoc in
  a component.
- No pure black (#000) anywhere — use dark grays (#1C1C1E style) for text.
- Every interactive element (button, input, card) must have a visible hover
  and active/pressed state — no dead-feeling UI.
- Reuse shared components (Button, Card, Input, Modal, Table) from
  /src/components/ui — never create a one-off duplicate styled element
  inline in a page.
- Before marking any UI task complete, take a screenshot Artifact and
  visually confirm: correct RTL direction, correct fonts/colors, no
  layout overflow/breakage at 1280x800 (minimum supported resolution).
```

### Skill 4 — `error-prevention-gate`

```markdown
---
name: error-prevention-gate
description: Use at the end of every phase, and before declaring any task or feature "done", to run the full verification gate before proceeding.
---

# Error Prevention Gate Skill

Before declaring ANY task, feature, or phase complete, run this exact
checklist and report PASS/FAIL for each line — do not summarize, list them
individually:

1. `pnpm tsc --noEmit` → zero errors.
2. `pnpm lint` → zero errors and zero warnings.
3. `pnpm test` (Vitest unit tests) → all passing, including new tests
   written for this task.
4. For any UI change: Playwright E2E test for the affected user flow passes.
5. Manually trace the "unhappy path": what happens if the DB write fails?
   What happens if the network drops mid-action? What happens with empty/
   null input? Confirm each shows a proper user-facing error, not a crash
   or silent failure.
6. No `any` types introduced. No `console.log` left in committed code
   (use a proper logger utility instead).
7. No TODO comments left unresolved without an explicit note to the user
   about what's deferred and why.

If ANY item fails, STOP. Do not proceed to a new feature or phase. Fix the
root cause, re-run the full checklist from item 1 again (not just the
failed item — regressions happen).
```

### Skill 5 — `pos-printing-barcode`

```markdown
---
name: pos-printing-barcode
description: Use whenever implementing barcode scanner input handling or thermal receipt printing.
---

# Printing & Barcode Skill

**Barcode scanning:**
- Barcode scanners act as keyboard input (HID), typing digits very fast
  followed by an Enter keystroke.
- Implement a global keydown listener that buffers rapid keystrokes
  (threshold: <50ms between characters = scanner, slower = human typing).
- On Enter after a fast-buffered sequence, treat the buffer as a scanned
  barcode and look up the product immediately — do not require the cashier
  to click into a specific input field first (scanning should work from
  anywhere in the checkout screen).
- Always debounce/guard against double-scans (same barcode within 300ms
  should be ignored, not added twice).

**Thermal receipt printing:**
- Use electron-pos-printer with ESC/POS commands.
- Build the receipt as structured data first (store name, items, prices,
  totals, date, branch) then render to the printer template — never
  hardcode printer-specific escape codes inside business logic.
- Always wrap the print call in try/catch: if no printer is connected,
  show a clear "Printer not connected" message and let the cashier
  continue the sale (never block a sale because printing failed) — offer
  a "reprint receipt" option from sales history instead.
- Test with the printer disconnected as an explicit required test case.

**Label / price-tag printing (Phase 8 — different from receipt printing):**
- Labels are small (typically 40mm x 30mm) and print ONE variant's barcode
  + product name + price per tag, often in a batch (e.g. print 20 tags for
  20 units of the same variant).
- Build a separate `printLabel()` function from `printReceipt()` — do NOT
  reuse the receipt template scaled down, the layout constraints are
  different (barcode must stay scannable at small size, font must stay
  legible).
- Support a "quantity to print" input (batch printing) before sending to
  the printer.
- Same rule as receipts: if the label printer isn't connected/configured,
  show a clear error and never crash the app.
```

### Skill 6 — `shift-cash-management`

```markdown
---
name: shift-cash-management
description: Use whenever implementing or modifying shift opening/closing, cash drawer counting, or end-of-day cash reconciliation logic.
---

# Shift & Cash Drawer Skill

1. A cashier cannot make a sale without an OPEN shift. The checkout screen
   must check for an active `shifts` row (status='open') for the current
   user/branch before allowing any sale; if none exists, redirect to the
   "Open Shift" screen first.
2. **Opening a shift**: cashier enters `opening_cash_dzd` (physical count of
   cash currently in the drawer). This is stored as-is — never assumed to
   be zero.
3. **During the shift**: every cash sale contributes to the expected cash
   total. Card/mixed payments do NOT affect the physical cash expectation
   for the cash portion only.
4. **Closing a shift**: 
   - Compute `expected_cash_dzd` = opening_cash_dzd + SUM(cash portion of
     all sales in this shift) − SUM(cash refunds in this shift).
   - Cashier physically counts the drawer and enters `closing_cash_dzd`.
   - Compute `difference_dzd` = closing_cash_dzd − expected_cash_dzd.
     Show this clearly (green if 0, red/orange if not 0, labeled
     "فائض" for positive / "عجز" for negative).
   - This computation must happen entirely from the `sales` and `shifts`
     ledger data — never from a manually tracked running total variable,
     to avoid drift bugs.
5. Once a shift is closed, it is immutable (no further sales can reference
   it) — closing a shift is a one-way action requiring explicit confirmation.
6. Test explicitly: open shift with 5000 DA, make 3 cash sales totaling
   2500 DA and 1 card sale of 1000 DA, close shift — expected_cash_dzd
   must equal exactly 7500 DA (5000 + 2500, card excluded).
```

---

## 3. خطة الأيام (Phased Plan بالـ Gates)

⚠️ **قاعدة مهمة**: كل Phase لازم "PASS" كامل قبل لي تبدا لي بعدها. ماشي وقت ضدك — خطأ فـ Phase 1 غادي يكلفك جوج تلاتة أيام إذا خرجتيه بلا تصليح.

⚠️ **صراحة على التوقيت**: بزيادة كل الصفحات لي طلبتهم (shift/cash drawer، variants ديال المقاس/اللون، طباعة تيكيتات، returns، customers، settings) — هاذ المشروع دابا **صعيب يخلص فـ 7 أيام نظاف بلا أخطاء** إذا خدمتي بروحك وحدك مع الـ Agent. الخيارين:
- **خيار A (7 أيام واقعي)**: تخدم Phases 1-7 لي تحت (MVP احترافي كامل وظيفيا)، وتأجل Phases 8-9 (Shift management المتقدم + Labels + Returns/Customers) لأسبوع ثاني كـ v1.1.
- **خيار B (9-10 أيام)**: تخدم كامل الـ 9 Phases مرة وحدة قبل ما تبيعها لأول زبون.
أنا نصيحتي: خيار A. تبيع نسخة تخدم وتربح، وتزيد الميزات وأنت خدام. بصح خليتلك الـ 9 كاملين تحت باش تختار.

| اليوم | Phase | المحتوى | Gate (لازم يبان PASS) |
|---|---|---|---|
| **1** | Phase 1 — Foundation | Electron+Vite+React+TS setup (نافذة resizable/maximizable)، DB schema كامل (SQLite migrations)، design tokens (Tailwind config premium: glass, shadows, motion)، shared UI components (Button/Card/Input/Modal/Table) | `tsc` بلا أخطاء، الـ app يفتح فنافذة قابلة للتكبير/التصغير، design system مطبق فـ component واحد على الأقل |
| **2** | Phase 2 — Local POS Core + Shift | **فتح الصندوق** (إدخال المبلغ الموجود بداية الدوام)، شاشة البيع (checkout)، إضافة منتج للسلة، barcode input handling، إتمام بيع، **قفل الصندوق** (closing count + عرض الفرق over/short) — كلشي local بلا sync، فرع واحد | بيع كامل يتسجل بـ transaction، shift يحسب الكاش المتوقع صح مقابل الفعلي، tests تعدي |
| **3** | Phase 3 — Products & Variants | صفحة **"إضافة منتج"** كاملة: اسم، فئة، صور، سعر بيع/تكلفة، **variants** (مقاس × لون كمصفوفة، كل variant بباركود وستوك خاص بيه)، صفحة تفاصيل المنتج، CRUD الفئات، stock movements | كل عملية جرد تمر عبر ledger، variant واحد يقدر يكون بستوك 0 وواحد آخر متوفر لنفس المنتج |
| **4** | Phase 4 — Auth & Roles | تسجيل دخول، أدوار (admin/cashier/manager)، صلاحيات محدودة حسب الدور، multi-branch setup | cashier ما يقدرش يوصل لصفحات admin، roles تتفحص server-side (Supabase RLS) موك frontend فقط |
| **5** | Phase 5 — Sync Engine | تفعيل sync_queue، Supabase push/pull، conflict resolution، connectivity detection | test السيناريو ديال جوج فروع يبيعو نفس آخر قطعة أوفلاين، reconnect، تأكد ماكاش oversell |
| **6** | Phase 6 — Reports & Dashboard | Dashboard بالـ Recharts (مبيعات، أفضل منتجات، shift history)، تقارير حسب الفرع والفترة، export | الأرقام فالـ dashboard تطابق الـ ledger 100%، ماكاش تقريب أو حساب خاطئ |
| **7** | Phase 7 — Printing, Backup & Polish | طباعة الفواتير الحرارية، auto-backup يومي، اختبار شامل end-to-end، تلميع UI (animations, transitions, skeleton loaders) | طباعة تخدم + fallback إذا الطابعة مقطوعة، backup يتخلق فعلا، E2E tests كاملة تعدي |
| **8** *(v1.1)* | Phase 8 — Label Printing & Returns | طباعة **تيكيتات/بطاقات السعر** (باركود + اسم + سعر، مقاس تيكيت مختلف عن الفاتورة، دعم طابعات label مثل Zebra/thermal 40mm)، صفحة **Returns/Exchanges** (ترجع سلعة، ترجع فلوس أو تبدلها، تحدث الستوك عبر ledger بنوع "return") | تيكيت يطبع بباركود صحيح يتقرا بالسكانر، return يزيد الستوك صح فـ ledger |
| **9** *(v1.1)* | Phase 9 — Customers & Settings | صفحة **Customers** (اختياري: اسم، رقم، تاريخ الشراء، نقاط ولاء بسيطة)، صفحة **Settings** (معلومات المتجر، شعار، قالب الفاتورة، إعدادات الطابعة، اللغة) | بيانات الزبون تربط بالبيع بشكل اختياري، إعدادات المتجر تنعكس فعليا فالفاتورة المطبوعة |

---

## 4. الـ Database Schema (SQL كامل)

انسخ هاد القسم فملف `DATABASE_SCHEMA.md` وأعطيه للـ Agent مع الـ Master Prompt.

```sql
-- ============================================
-- MELLAH POS — Core Schema (SQLite + Supabase mirror)
-- All IDs are UUID v4, generated client-side
-- ============================================

CREATE TABLE branches (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id),
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','cashier')),
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE categories (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- "products" = the general item (e.g. "T-shirt Nike Basic").
-- Actual sellable/stocked units are in product_variants (size+color combo),
-- because in clothing retail, stock and barcode live at the variant level,
-- not the product level.
CREATE TABLE products (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id),
  category_id UUID REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price_dzd NUMERIC NOT NULL,       -- default price, can be overridden per variant
  cost_dzd NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  size TEXT,                        -- e.g. "M", "42"
  color TEXT,                       -- e.g. "Noir", "Bleu"
  barcode TEXT UNIQUE,              -- each variant has its own scannable barcode
  sku TEXT,
  price_dzd NUMERIC,                -- NULL = inherit product.price_dzd
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- STOCK IS NEVER STORED DIRECTLY — always derived from this ledger,
-- tracked per VARIANT (a Medium/Black shirt and a Large/Black shirt
-- have completely independent stock).
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  type TEXT NOT NULL CHECK (type IN ('sale','restock','adjustment','return')),
  quantity_change INTEGER NOT NULL, -- negative for sale, positive for restock/return
  reference_id UUID, -- links to sales.id or returns.id
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
  -- append-only: no updated_at, no deleted_at
);

-- Cash drawer / shift management (opening & closing the register)
CREATE TABLE shifts (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id),
  cashier_id UUID NOT NULL REFERENCES users(id),
  opening_cash_dzd NUMERIC NOT NULL,   -- cash counted in drawer at start of day
  expected_cash_dzd NUMERIC,           -- opening_cash + cash sales, computed at close
  closing_cash_dzd NUMERIC,            -- cash actually counted at close
  difference_dzd NUMERIC,              -- closing - expected (over/short)
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ NULL
);

CREATE TABLE customers (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id),
  full_name TEXT NOT NULL,
  phone TEXT,
  loyalty_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE sales (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id),
  shift_id UUID REFERENCES shifts(id),
  cashier_id UUID NOT NULL REFERENCES users(id),
  customer_id UUID REFERENCES customers(id), -- nullable, walk-in sales allowed
  total_dzd NUMERIC NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','mixed')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded','partial_refund')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE sale_items (
  id UUID PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES sales(id),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL,
  unit_price_dzd NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
  -- append-only
);

-- Returns / exchanges (v1.1 — Phase 8)
CREATE TABLE returns (
  id UUID PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id),
  original_sale_id UUID NOT NULL REFERENCES sales(id),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL,
  refund_method TEXT CHECK (refund_method IN ('cash','store_credit','exchange')),
  reason TEXT,
  processed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
  -- append-only
);

-- Store-wide settings (v1.1 — Phase 9), single row per branch
CREATE TABLE store_settings (
  branch_id UUID PRIMARY KEY REFERENCES branches(id),
  store_name TEXT NOT NULL,
  logo_url TEXT,
  receipt_footer_text TEXT,
  default_language TEXT DEFAULT 'ar',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sync_queue (
  id UUID PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('insert','update','delete')),
  payload TEXT NOT NULL, -- JSON blob
  created_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ NULL,
  attempts INTEGER DEFAULT 0
);
```

---

## 5. Definition of Done — نهائي (كامل المشروع)

قبل ما تقول للمشروع "خلص":

- [ ] `pnpm tsc --noEmit` بلا أي خطأ فـ كامل المشروع
- [ ] `pnpm lint` نظيف تماما
- [ ] كل الـ unit tests + E2E tests تعدي (`pnpm test`)
- [ ] test السيناريو: بيع أوفلاين فـ جوج فروع لنفس المنتج → sync → ستوك صحيح
- [ ] test: قفل التطبيق فـ نص عملية بيع → إعادة فتح → ماكاش data loss ولا duplicate
- [ ] test: طابعة مقطوعة → البيع يكمل، رسالة واضحة تبان
- [ ] Backup تلقائي يومي يتخلق فعليا فـ ملف منفصل
- [ ] كل شاشة تتفحص بصريا بـ RTL عربي، بلا overflow، بألوان الـ design system
- [ ] Roles تتفحص فـ Supabase RLS موك فقط فالـ frontend
- [ ] الأرقام فـ dashboard تطابق مجموع الـ stock_movements/sales يدويا (spot check)

---

**ملاحظة أخيرة:** إذا Antigravity حاول "يقفز" لـ phase موالية بلا ما يكمل الـ checklist، وقفو وقولّو بالحرف: *"Stop. Show me the DoD checklist results for the current phase first."*
