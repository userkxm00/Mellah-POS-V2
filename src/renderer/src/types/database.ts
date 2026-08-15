// ============================================
// MELLAH POS — TypeScript type definitions for all database tables
// Every type mirrors the SQLite/Supabase schema exactly
// ============================================

// ----- Enum-like union types -----

export type UserRole = 'admin' | 'manager' | 'cashier'
export type PaymentMethod = 'cash' | 'card' | 'mixed' | 'credit'
export type SaleStatus = 'completed' | 'refunded' | 'partial_refund' | 'voided'
export type ShiftStatus = 'open' | 'closed'
export type StockMovementType = 'sale' | 'restock' | 'adjustment' | 'return'
export type RefundMethod = 'cash' | 'store_credit' | 'exchange'
export type SyncOperation = 'insert' | 'update' | 'delete'
export type SupportedLanguage = 'ar' | 'fr'

// ----- Base fields shared by most tables -----

export interface BaseEntity {
  id: string // UUID v4
  created_at: string // ISO 8601
  updated_at: string // ISO 8601
  deleted_at: string | null // soft delete
}

export interface BranchScoped {
  branch_id: string // UUID v4
}

// ----- Table interfaces -----

export interface Branch extends BaseEntity {
  name: string
  address: string | null
}

export interface User extends BaseEntity, BranchScoped {
  full_name: string
  role: UserRole
  pin_hash: string
}

export interface Category extends BaseEntity, BranchScoped {
  name: string
}

export interface Product extends BaseEntity, BranchScoped {
  category_id: string | null
  name: string
  description: string | null
  image_url: string | null
  price_dzd: number
  cost_dzd: number | null
}

export interface ProductVariant extends BaseEntity, BranchScoped {
  product_id: string
  size: string | null
  color: string | null
  barcode: string | null
  sku: string | null
  price_dzd: number | null // null = inherit product.price_dzd
  min_stock_level: number // default 5, added by migration 0002
}

// Append-only: no updated_at, no deleted_at
export interface StockMovement {
  id: string
  branch_id: string
  variant_id: string
  type: StockMovementType
  quantity_change: number // negative for sale, positive for restock/return
  reference_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export interface Shift {
  id: string
  branch_id: string
  cashier_id: string
  opening_cash_dzd: number
  expected_cash_dzd: number | null
  closing_cash_dzd: number | null
  difference_dzd: number | null
  status: ShiftStatus
  opened_at: string
  closed_at: string | null
}

export interface Customer extends BaseEntity, BranchScoped {
  full_name: string
  phone: string | null
  loyalty_points: number
  store_credit_balance: number // default 0, added by migration 0003
  barcode: string | null // added by migration 0008
}

export interface Sale extends BaseEntity, BranchScoped {
  shift_id: string | null
  cashier_id: string
  customer_id: string | null
  subtotal_dzd: number // added by migration 0003, rebuilt in 0005
  discount_dzd: number // added by migration 0003, rebuilt in 0005
  total_dzd: number
  cash_amount_dzd: number // added by migration 0003, rebuilt in 0005
  card_amount_dzd: number // added by migration 0003, rebuilt in 0005
  paid_amount_dzd: number // added by migration 0004, rebuilt in 0005
  remaining_debt_dzd: number // added by migration 0004, rebuilt in 0005
  payment_method: PaymentMethod
  status: SaleStatus
  voided_at: string | null // added by migration 0003, rebuilt in 0006
  void_reason: string | null // added by migration 0003, rebuilt in 0006
}

// Append-only
export interface SaleItem {
  id: string
  sale_id: string
  variant_id: string
  quantity: number
  unit_price_dzd: number
  created_at: string
}

// Append-only
export interface Return {
  id: string
  branch_id: string
  original_sale_id: string
  variant_id: string
  quantity: number
  refund_method: RefundMethod | null
  reason: string | null
  processed_by: string | null
  created_at: string
}

export interface StoreSettings {
  branch_id: string
  store_name: string
  logo_url: string | null
  receipt_footer_text: string | null
  default_language: SupportedLanguage
  updated_at: string
  // Added by migration 0003
  store_address: string | null
  store_phone: string | null
  session_timeout_minutes: number // default 5
  // Added by migration 0007 — Telegram notifications
  telegram_bot_token: string | null
  telegram_chat_ids: string | null
  telegram_notify_app_launch: number // 0 or 1, default 1
  telegram_notify_sale: number // 0 or 1, default 1
  telegram_notify_shift: number // 0 or 1, default 1
  // Added by migration 0008 — Loyalty & printers
  loyalty_enabled: number // 0 or 1, default 0
  loyalty_spend_per_point_dzd: number // default 1000
  loyalty_point_value_dzd: number // default 1
  loyalty_expiry_months: number // default 0 (never expires)
  receipt_printer_name: string // default ''
  label_printer_name: string // default ''
  barcode_label_language: string // default 'ar'
  barcode_label_size: string // default '50x25'
}

export interface SyncQueueEntry {
  id: string
  table_name: string
  operation: SyncOperation
  payload: string // JSON blob
  created_at: string
  synced_at: string | null
  attempts: number
  last_error: string | null // added by migration 0009
}

// ----- Computed / view types (not direct DB tables) -----

/** Product variant with computed stock from stock_movements ledger */
export interface ProductVariantWithStock extends ProductVariant {
  current_stock: number
}

/** Product with its variants included */
export interface ProductWithVariants extends Product {
  variants: ProductVariantWithStock[]
  category_name: string | null
}

/** Sale with its line items expanded */
export interface SaleWithItems extends Sale {
  items: (SaleItem & {
    product_name: string
    variant_size: string | null
    variant_color: string | null
  })[]
  cashier_name: string
}

/** Shift with computed summary */
export interface ShiftSummary extends Shift {
  total_sales_count: number
  total_sales_amount: number
  cashier_name: string
}

export interface CustomerPayment {
  id: string
  branch_id: string
  shift_id: string | null
  customer_id: string
  sale_id: string | null
  amount_dzd: number
  payment_method: 'cash' | 'card'
  notes: string | null
  created_at: string
}

export interface Supplier {
  id: string
  branch_id: string
  name: string
  phone: string | null
  company_name: string | null
  address: string | null
  total_debt_dzd: number // default 0, added by migration 0004
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SupplierPurchase {
  id: string
  branch_id: string
  supplier_id: string
  invoice_number: string | null
  total_amount_dzd: number
  paid_amount_dzd: number
  remaining_debt_dzd: number
  notes: string | null
  created_at: string
}

export interface SupplierPayment {
  id: string
  branch_id: string
  supplier_id: string
  purchase_id: string | null
  amount_dzd: number
  payment_method: 'cash' | 'card'
  notes: string | null
  created_at: string
}

// Added by migration 0003 — audit_logs table
export interface AuditLog {
  id: string
  user_id: string
  action: string
  entity_name: string
  entity_id: string | null
  details: string | null
  created_at: string
}
