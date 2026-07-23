import type { DbWrapper } from './database'

export async function seedInitialData(db: DbWrapper): Promise<void> {
  const branchRows = await db.query<{ count: number }>('SELECT COUNT(*) as count FROM branches')
  const branchCount = branchRows[0]?.count ?? 0

  if (branchCount > 0) {
    return // Already seeded
  }

  try {
    await db.exec('BEGIN')

    const branchId = 'b1111111-1111-4111-8111-111111111111'
    const adminId = 'u1111111-1111-4111-8111-111111111111'
    const cashierId = 'u2222222-2222-4222-8222-222222222222'

    // 1. Branch
    await db.execute('INSERT INTO branches (id, name, address) VALUES (?, ?, ?)', [
      branchId,
      'فرع الجزائر العاصمة',
      'شارع ديدوش مراد، الجزائر',
    ])

    // 2. Users
    await db.execute(
      'INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, ?, ?, ?)',
      [adminId, branchId, 'أحمد المدير', 'admin', '1234']
    )

    await db.execute(
      'INSERT INTO users (id, branch_id, full_name, role, pin_hash) VALUES (?, ?, ?, ?, ?)',
      [cashierId, branchId, 'محمد الكاشير', 'cashier', '0000']
    )

    // 3. Store Settings
    await db.execute(
      'INSERT INTO store_settings (branch_id, store_name, receipt_footer_text, default_language) VALUES (?, ?, ?, ?)',
      [
        branchId,
        'بوتيك الملاح للملابس',
        'شكراً لزيارتكم، البضاعة المباعة ترجع أو تبدل خلال 7 أيام',
        'ar',
      ]
    )

    // 4. Categories
    const catMen = 'c1111111-1111-4111-8111-111111111111'
    const catWomen = 'c2222222-2222-4222-8222-222222222222'
    const catShoes = 'c3333333-3333-4333-8333-333333333333'
    const catAcc = 'c4444444-4444-4444-8444-444444444444'

    await db.execute('INSERT INTO categories (id, branch_id, name) VALUES (?, ?, ?)', [
      catMen,
      branchId,
      'ملابس رجالية',
    ])
    await db.execute('INSERT INTO categories (id, branch_id, name) VALUES (?, ?, ?)', [
      catWomen,
      branchId,
      'ملابس نسائية',
    ])
    await db.execute('INSERT INTO categories (id, branch_id, name) VALUES (?, ?, ?)', [
      catShoes,
      branchId,
      'أحذية',
    ])
    await db.execute('INSERT INTO categories (id, branch_id, name) VALUES (?, ?, ?)', [
      catAcc,
      branchId,
      'إكسسوارات',
    ])

    // 5. Products & Variants & Initial Stock Movements
    const productsData = [
      {
        id: 'p1111111-1111-4111-8111-111111111111',
        catId: catMen,
        name: 'تي شيرت قطن كلاسيك',
        description: 'تي شيرت قطني عالي الجودة متوفر بعدة مقاسات وألوان',
        price: 2500,
        cost: 1200,
        variants: [
          {
            id: 'v1111111-1111-4111-8111-111111111111',
            size: 'S',
            color: 'أسود',
            barcode: '690123456701',
            stock: 15,
          },
          {
            id: 'v1111111-1111-4111-8111-222222222222',
            size: 'M',
            color: 'أسود',
            barcode: '690123456702',
            stock: 20,
          },
          {
            id: 'v1111111-1111-4111-8111-333333333333',
            size: 'L',
            color: 'أبيض',
            barcode: '690123456703',
            stock: 10,
          },
        ],
      },
      {
        id: 'p2222222-2222-4222-8222-222222222222',
        catId: catMen,
        name: 'جينز رجالي ليفايس 501',
        description: 'سروال جينز كلاسيك أصلي',
        price: 6500,
        cost: 3800,
        variants: [
          {
            id: 'v2222222-2222-4222-8222-111111111111',
            size: '40',
            color: 'أزرق',
            barcode: '690123456704',
            stock: 8,
          },
          {
            id: 'v2222222-2222-4222-8222-222222222222',
            size: '42',
            color: 'أزرق',
            barcode: '690123456705',
            stock: 12,
          },
        ],
      },
      {
        id: 'p3333333-3333-4333-8333-333333333333',
        catId: catWomen,
        name: 'فستان صيفي أنيق',
        description: 'فستان نسائي خفيف ومريح',
        price: 8900,
        cost: 4500,
        variants: [
          {
            id: 'v3333333-3333-4333-8333-111111111111',
            size: 'M',
            color: 'أحمر',
            barcode: '690123456706',
            stock: 5,
          },
          {
            id: 'v3333333-3333-4333-8333-222222222222',
            size: 'L',
            color: 'أسود',
            barcode: '690123456707',
            stock: 7,
          },
        ],
      },
      {
        id: 'p4444444-4444-4444-8444-444444444444',
        catId: catShoes,
        name: 'حذاء رياضي ستريت',
        description: 'حذاء رياضي عصري ومريح للمشي',
        price: 12500,
        cost: 7000,
        variants: [
          {
            id: 'v4444444-4444-4444-8444-111111111111',
            size: '41',
            color: 'أبيض',
            barcode: '690123456708',
            stock: 14,
          },
        ],
      },
    ]

    let moveCounter = 1
    for (const p of productsData) {
      await db.execute(
        'INSERT INTO products (id, branch_id, category_id, name, description, price_dzd, cost_dzd) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.id, branchId, p.catId, p.name, p.description, p.price, p.cost]
      )
      for (const v of p.variants) {
        await db.execute(
          'INSERT INTO product_variants (id, product_id, branch_id, size, color, barcode, price_dzd) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [v.id, p.id, branchId, v.size, v.color, v.barcode, null]
        )

        const moveId = `m${String(moveCounter++).padStart(7, '0')}-0000-4000-8000-000000000000`
        await db.execute(
          'INSERT INTO stock_movements (id, branch_id, variant_id, type, quantity_change, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [moveId, branchId, v.id, 'restock', v.stock, 'مخزون افتتاحي للمتجر', adminId]
        )
      }
    }

    await db.exec('COMMIT')
  } catch (err) {
    await db.exec('ROLLBACK')
    throw err
  }
}
