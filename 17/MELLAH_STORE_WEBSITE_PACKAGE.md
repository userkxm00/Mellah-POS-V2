# متجر محل الملابس الإلكتروني + لوحة تحكم — حزمة البناء الكاملة
## (يشارك نفس Supabase تاع MELLAH POS)

---

## 0. القرار المعماري الأهم — اقرا هذا قبل أي كود

المتجر أونلاين والـ POS فالمحل **الاثنين كيكتبو فنفس قاعدة البيانات**. هذا معناه لازم نحل مشكلة واحدة بالضبط من البداية:

> **زبون يطلب أونلاين قميص "M أسود"، فنفس الوقت كاشير يبيع آخر قطعة من نفس القميص فالمحل. شكون ياخدها؟**

الحل (نفس مبدأ الـ ledger لي بنيناه فـ MELLAH POS): **الستوك يتحجز (reserve) بمجرد ما الزبون يأكد الطلب أونلاين**، عبر سطر جديد فـ `stock_movements` (نفس الجدول لي كيستعملو الـ POS). يعني الطلب أونلاين والبيع فالمحل **كيتنافسو على نفس الرقم الحقيقي**، بلا ما يحتاجو "مزامنة" لأنهم أصلا نفس القاعدة.

هذا يعني: الموقع **ماشي مشروع منفصل بقاعدته الخاصة** — هو "واجهة ثالثة" فوق نفس البيانات (زي ما النافذة الثانية فـ Electron كانت واجهة ثانية).

---

## 1. MASTER PROMPT (للـ Agent لي غادي يبني الموقع)

```
You are building the customer-facing e-commerce website AND admin dashboard for
an Algerian clothing store that already runs "MELLAH POS" (an Electron desktop
POS app) connected to a live Supabase project. This website is a NEW client on
TOP OF THE SAME SUPABASE DATABASE — it is not a separate system with its own
data. Correctness of stock across both the in-store POS and the website is the
single most important requirement.

===========================================================
GLOBAL RULES
===========================================================

1. STACK:
   - Next.js (App Router) + TypeScript (strict mode, no `any`)
   - Supabase (the EXISTING project — same URL/keys as MELLAH POS, ask the
     user for the project ref before starting; do not create a new project)
   - Tailwind CSS
   - Deployment target: Vercel (or similar), the storefront is public-facing

2. YOU ARE EXTENDING AN EXISTING SCHEMA, NOT DESIGNING A NEW ONE:
   - `products`, `product_variants`, `categories`, `branches`, `customers`,
     `stock_movements` already exist and are actively used by the desktop POS
     every day. NEVER modify their existing columns or constraints in a way
     that could break the desktop app. Only ADD new tables/columns via
     numbered migrations, following the same migration file convention
     already used in the MELLAH POS repo (database/migrations/000X_*.sql).
   - Read the existing schema first (ask the user for the current
     `database/migrations/*.sql` files from the MELLAH POS repo, or connect
     to Supabase directly and inspect `information_schema`) before writing
     any new migration.

3. STOCK RESERVATION — THE CORE CORRECTNESS RULE:
   - Stock is NEVER read as a static number and trusted. Available stock for
     a variant is ALWAYS computed live as
     `SUM(stock_movements.quantity_change) WHERE variant_id = ?`,
     exactly like the desktop POS does.
   - When a customer confirms an online order (not just adds to cart), the
     order confirmation must, in a single atomic Supabase transaction (RPC
     function using `plpgsql`, not multiple sequential client calls):
     a. Re-check current stock for every item in the order.
     b. If insufficient, reject the order immediately with a clear message
        (do not let two customers both "confirm" the last unit).
     c. If sufficient, insert one `stock_movements` row per item with
        `type = 'online_sale'` and a negative `quantity_change`, referencing
        the new order's id.
   - Cart contents are NOT reserved — only checkout/confirmation reserves
     stock. A full cart with no confirmation must never block real stock.
   - This atomic check-and-reserve MUST happen server-side (a Postgres
     function called via RPC, or a Next.js server action with a database
     transaction) — never as separate client-side read-then-write calls,
     which would recreate the exact race condition this rule exists to
     prevent.

4. NEW TABLES REQUIRED (via new migration, e.g. 0006_online_orders.sql):
   - `online_orders`: id (uuid), customer_id (nullable, references
     `customers` — the SAME table the desktop POS already uses; do not
     create a separate "web_customers" table), guest_name, guest_phone
     (used when customer_id is null, i.e. guest checkout), wilaya, commune,
     address_text, status (CHECK IN
     ('pending','confirmed','shipped','delivered','cancelled','returned')),
     total_dzd, delivery_fee_dzd, fulfillment_branch_id (references
     branches), delivery_provider_ref (tracking id from the delivery
     aggregator), created_at, updated_at, cancelled_at, deleted_at.
   - `online_order_items`: id (uuid), order_id (references online_orders),
     variant_id (references product_variants), quantity, unit_price_dzd,
     created_at. Append-only, like `sale_items`.
   - `wishlists`: id (uuid), customer_id (references customers, NOT
     nullable — wishlist requires an account), variant_id (references
     product_variants), created_at. Unique constraint on
     (customer_id, variant_id) to prevent duplicates.
   - Add `source` tracking is implicit via the `stock_movements.type` value
     ('online_sale' vs the existing 'sale' for in-store) — do NOT touch the
     existing `sales`/`sale_items` tables used by the desktop POS; online
     orders are their own table with their own lifecycle (pending → shipped
     → delivered), unlike an in-store sale which completes instantly.

4b. CUSTOMER ACCOUNTS (optional registration, guest checkout supported):
   - Reuse Supabase Auth for website customer accounts (email/phone +
     password, or OTP) — this is separate from the anonymous
     device-identity auth used by the desktop POS for its own sync, and
     separate from the PIN-based cashier login. A website customer account
     is a real person's login, tied via a `customers.auth_user_id` column
     (nullable) to the existing `customers` table.
   - Guest checkout flow: if the customer doesn't log in, collect
     guest_name/guest_phone directly on the order. After placing a guest
     order, offer "create an account to track this order" as an optional
     step — if they do, link the just-created order to their new
     customer_id (match by phone number first, to avoid duplicate customer
     records for someone who shops as guest multiple times with the same
     phone).
   - Order tracking page (public, no login needed): looked up by
     order id + phone number match, not requiring an account — so a guest
     can still track their order status without registering.

5. DELIVERY INTEGRATION (58 wilayas):
   - Reuse the same delivery aggregator approach already researched and
     built for the "El Mamlakah Phones" project: a unified API aggregator
     (Dolivroo or equivalent) covering multiple Algerian carriers, so you
     don't integrate each delivery company individually.
   - Store aggregator credentials in Supabase Vault (or environment
     variables on the server side only, NEVER exposed to the client
     bundle), and proxy all delivery API calls through a Next.js server
     route / Supabase Edge Function — the browser must never call the
     delivery API directly with credentials.
   - Delivery fee varies by wilaya — fetch/display the correct fee for the
     selected wilaya before the customer confirms the order.

6. PAYMENT: Cash on Delivery (COD) ONLY for this phase.
   - No payment gateway integration needed right now. The order status flow
     is: pending (just placed) → confirmed (store owner reviewed it) →
     shipped → delivered (cash collected by delivery courier) → or
     cancelled at any stage before shipping.
   - Design the `online_orders.status` state machine so a payment gateway
     (Chargily Pay/CIB) can be added later as an alternative path without
     restructuring the table.

7. DESIGN SYSTEM — WOW-FACTOR HOMEPAGE, FAST-AND-SIMPLE COMMERCE FLOW:
   - Install and use these real design tools (all confirmed legitimate,
     not marketing fluff):
     a. `npx skills add Leonxlnx/taste-skill --skill design-taste-frontend`
        — anti-generic design discipline. Given this is a premium clothing
        storefront, prefer the `soft-skill` variant (calm, expensive-
        looking, soft contrast, smooth motion) over `brutalist-skill`.
     b. The "UI UX Pro Max" design-intelligence skill (already used
        successfully in the MELLAH POS project — reuse the same one) for
        color palettes, font pairings, and UX guidelines.
     c. For the homepage hero specifically, reference getlayers.ai's free
        Three.js hero concepts (e.g. the "Flowstate" style) as inspiration
        — reuse the SAME frame-sequence canvas hero technique already
        built for the birthday/BAC celebration sites in this developer's
        past projects (Three.js + canvas frame sequence + Framer Motion),
        since that pattern is proven to work and is already understood.
   - CRITICAL PERFORMANCE SPLIT: the homepage/landing/hero section may use
     heavy 3D/motion (Three.js scenes, scroll-driven animation, parallax)
     for the "wow, I'm impressed" first impression. The product listing,
     product detail, cart, and checkout pages must be FAST and radically
     simple — minimal JS, quick image loads, no heavy 3D — because real
     customers (many on average mobile connections) abandon slow carts.
     Never let hero-page techniques bleed into the purchase flow.
   - Fully responsive, mobile-first (most Algerian e-commerce traffic is
     phones) — test at 375px, 768px, 1280px, 1920px explicitly before
     considering any page "done".
   - Arabic (RTL) primary, French (LTR) fully supported as an equal second
     language — a language switcher (AR/FR) must be visible on every page,
     not just the receipt. Product names/descriptions need both AR and FR
     text fields in the database (add `name_fr`, `description_fr` columns
     to `products` via migration if not already present). Same brand color
     family as MELLAH POS (#0A6EDB blue) for recognition, but warmer/more
     visual than the operational POS screens — this is a storefront, not a
     cash register.

8. ADMIN DASHBOARD (separate route, e.g. /admin, auth-protected):
   - Reuses the SAME Supabase Auth branch-scoped pattern already built for
     MELLAH POS's RLS policies — an admin logging into the website's
     /admin section should see the SAME order/stock reality the desktop
     POS shows, because it's the same tables.
   - Core screens: incoming online orders queue (pending → confirm →
     assign to branch → mark shipped), order detail, and a simple
     read-only sales overview (can reuse the RLS-protected direct-Supabase-
     query pattern already built in MELLAH POS's ReportsPage for
     cross-branch analytics).

9. RLS: every new table (`online_orders`, `online_order_items`) MUST have
   Row Level Security enabled from the FIRST migration — do not repeat the
   MELLAH POS history of adding tables first and RLS later. Public storefront
   customers interact through a restricted anon-key path (can INSERT a new
   pending order via a controlled RPC function, cannot directly SELECT/
   UPDATE other customers' orders); admin/staff access follows the existing
   branch+role policies.

10. TESTING: before considering the checkout flow "done", write an
    automated test that simulates two near-simultaneous order confirmations
    for the last unit of a variant and asserts exactly one succeeds and the
    other is rejected with a clear out-of-stock message — this is the
    online equivalent of the shift/stock tests already required for
    MELLAH POS.

Now: ask the user for the MELLAH POS Supabase project URL/anon key and the
current schema (migration files), then propose the exact new migration
(0006_online_orders.sql) for review before writing any application code.
```

---

## 2. أهم Skill جديدة (زيدها لـ `.antigravity/skills/`)

### `online-order-stock-integrity`

```markdown
---
name: online-order-stock-integrity
description: Use whenever implementing or modifying the checkout/order-confirmation flow, stock availability checks, or anything that reads/writes stock_movements from the website.
---

# Online Order Stock Integrity Skill

1. Never trust a stock number read earlier in the session (e.g. what was
   shown when the product page loaded). Always re-verify live stock at the
   exact moment of order confirmation, inside the same atomic operation
   that reserves it.
2. The check-and-reserve step MUST be a single server-side transaction
   (Postgres function via RPC, or equivalent), never two sequential calls
   from the browser (check, then insert) — that gap is exactly where two
   customers could both succeed for the same last unit.
3. Stock deducted for an online order uses the same `stock_movements`
   ledger the desktop POS uses — never a separate counter, never a
   duplicate "online_stock" column on products/variants.
4. If an order is cancelled before shipping, insert a compensating
   `stock_movements` row (type could be 'online_cancel_restock', positive
   quantity_change) — never delete or edit the original reservation row;
   the ledger is append-only, same rule as MELLAH POS.
5. Test explicitly: two browser sessions both add the last unit of a
   variant to cart and both hit "confirm order" within the same second —
   exactly one must succeed, the other must see a clear "sold out" message,
   and the final stock count must be mathematically correct (never negative,
   never double-counted).
```

---

## 3. خطة المراحل (مقترحة)

| المرحلة | المحتوى |
|---|---|
| **1** | ربط المشروع بنفس Supabase، migration جديدة (`online_orders`, `online_order_items`, `wishlists`, `customers.auth_user_id`) + RLS من البداية |
| **2** | صفحات المتجر: تصفح المنتجات (حسب الفئة/المقاس/اللون)، صفحة منتج، سلة (بلا حجز ستوك بعد)، Wishlist |
| **3** | حساب الزبون (تسجيل اختياري) + Checkout: بيانات الزبون/الضيف + الولاية + العنوان، حساب رسوم التوصيل، تأكيد الطلب (هنا الـ RPC الذرية لحجز الستوك) |
| **4** | تكامل التوصيل (Dolivroo أو المكافئ) — إرسال الطلب المؤكد، جلب رقم التتبع + صفحة "تتبع الطلب" العامة (رقم الطلب+تيليفون) |
| **5** | لوحة تحكم `/admin`: قائمة الطلبات (pending→confirmed→shipped)، تفاصيل الطلب، نظرة عامة على المبيعات |
| **6** | تلميع تصميم (Hero 3D/Three.js، صور كبيرة، mobile-first، عربي/فرنسي بالكامل) + اختبار السيناريو الحرج (طلبين لنفس آخر قطعة) |

---

## سؤال قبل ما نمشي للتفاصيل

باغي نبداو نكتبو migration الجديدة (`0006_online_orders.sql`) بالضبط دابا، ولا حاب نحدد أول حاجات تانية (مثلا: شكل الموقع، الصفحات بالضبط، اسم الدومين)؟
