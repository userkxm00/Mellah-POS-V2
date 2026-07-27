import React, { useState, useEffect } from 'react'
import { Card, Button, Input } from '@/components/ui'
import { VariantMatrixBuilder } from '@/components/products/VariantMatrixBuilder'
import { createProductWithVariants, type VariantInput } from '@/services/productService'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'

interface CategoryItem {
  id: string
  name: string
}

interface AddProductPageProps {
  onBack: () => void
  onSuccess: () => void
}

export function AddProductPage({ onBack, onSuccess }: AddProductPageProps): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [name, setName] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [priceDzd, setPriceDzd] = useState<string>('')
  const [costDzd, setCostDzd] = useState<string>('')
  const [matrixVariants, setMatrixVariants] = useState<VariantInput[]>([])
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    window.electron.db
      .query<CategoryItem>('SELECT id, name FROM categories WHERE deleted_at IS NULL ORDER BY name')
      .then((rows) => {
        setCategories(rows)
        if (rows.length > 0) {
          setCategoryId(rows[0].id)
        }
      })
      .catch(() => {
        addToast({ message: t('فشل تحميل الفئات'), variant: 'error' })
      })
  }, [addToast, t])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    const priceNum = parseFloat(priceDzd)
    const costNum = costDzd ? parseFloat(costDzd) : null

    if (!name.trim()) {
      addToast({ message: 'يرجى كتابة اسم المنتج', variant: 'error' })
      return
    }

    if (isNaN(priceNum) || priceNum <= 0) {
      addToast({ message: 'يرجى إدخال سعر بيع صحيح أكبر من 0', variant: 'error' })
      return
    }

    if (matrixVariants.length === 0) {
      addToast({ message: 'يرجى إضافة خيار واحد على الأقل', variant: 'error' })
      return
    }

    setIsSubmitting(true)
    try {
      await createProductWithVariants({
        name,
        category_id: categoryId || null,
        description,
        price_dzd: priceNum,
        cost_dzd: costNum,
        variants: matrixVariants,
      })

      addToast({ message: 'تم إضافة المنتج وجميع الخيارات والمخزون بنجاح!', variant: 'success' })
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل إضافة المنتج'
      addToast({ message: msg, variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const basePriceVal = parseFloat(priceDzd) || 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-text-secondary hover:text-accent flex items-center gap-1 mb-1"
          >
            ← العودة لقائمة المنتجات
          </button>
          <h1 className="text-xl font-bold text-text-primary">إضافة منتج جديد وتوليد الخيارات</h1>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onBack} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>
            حفظ المنتج والمصفوفة
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Base Info Card */}
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
            1. المعلومات الأساسية للمنتج
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="اسم المنتج (مثال: تي شيرت كلاسيك)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="أدخل اسم المنتج"
              isValid={name.trim().length >= 2}
              error={name.length > 0 && name.trim().length < 2 ? 'اسم المنتج يجب أن يحتوي على حرفين على الأقل' : undefined}
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-extrabold text-[#1C2B3A] dark:text-slate-200">الفئة</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl text-xs font-bold bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="سعر البيع الافتراضي (DA)"
              type="number"
              min="0"
              value={priceDzd}
              onChange={(e) => setPriceDzd(e.target.value)}
              placeholder="0"
              isValid={parseFloat(priceDzd) > 0}
              error={priceDzd !== '' && (isNaN(parseFloat(priceDzd)) || parseFloat(priceDzd) <= 0) ? 'السعر يجب أن يكون مبلغاً موجباً أكبر من 0' : undefined}
              required
            />

            <Input
              label="سعر التكلفة (DA) — اختياري لحساب الربح"
              type="number"
              min="0"
              value={costDzd}
              onChange={(e) => setCostDzd(e.target.value)}
              placeholder="0"
              isValid={costDzd !== '' && parseFloat(costDzd) >= 0}
            />
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium text-text-primary block mb-1.5">الوصف (اختياري)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="أدخل وصفاً قصيراً للمنتج..."
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl text-sm bg-white border border-border focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </Card>

        {/* Variant Matrix Card */}
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
            2. مصفوفة المقاسات والألوان والباركود
          </h2>

          <VariantMatrixBuilder
            basePrice={basePriceVal}
            onChange={setMatrixVariants}
          />
        </Card>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onBack} disabled={isSubmitting} size="lg">
            إلغاء
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting} size="lg">
            حفظ المنتج وجميع الخيارات
          </Button>
        </div>
      </form>
    </div>
  )
}
