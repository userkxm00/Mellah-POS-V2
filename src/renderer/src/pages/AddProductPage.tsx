import React, { useState, useEffect, useRef } from 'react'
import { Upload, X, Image as ImageIcon } from 'lucide-react'
import { Card, Button, Input } from '@/components/ui'
import { VariantMatrixBuilder } from '@/components/products/VariantMatrixBuilder'
import { createProductWithVariants, type VariantInput } from '@/services/productService'
import { useToastStore } from '@/stores/toastStore'
import { useLanguageStore } from '@/stores/languageStore'
import { processImageFile } from '@/lib/imageUtils'

interface CategoryItem {
  id: string
  name: string
}

interface AddProductPageProps {
  readonly onBack: () => void
  readonly onSuccess: () => void
}

export function AddProductPage({ onBack, onSuccess }: AddProductPageProps): React.JSX.Element {
  const t = useLanguageStore((s) => s.t)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [name, setName] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [priceDzd, setPriceDzd] = useState<string>('')
  const [costDzd, setCostDzd] = useState<string>('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false)
  const [matrixVariants, setMatrixVariants] = useState<VariantInput[]>([])
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const imageInputRef = useRef<HTMLInputElement>(null)
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

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessingImage(true)
    try {
      const processedDataUrl = await processImageFile(file, 600, 600, 0.8)
      setImageUrl(processedDataUrl)
      addToast({ message: t('تم رفع صورة المنتج بنجاح!'), variant: 'success' })
    } catch {
      addToast({ message: t('فشل اختيار صورة المنتج'), variant: 'error' })
    } finally {
      setIsProcessingImage(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    const priceNum = Number.parseFloat(priceDzd)
    const costNum = costDzd ? Number.parseFloat(costDzd) : null

    if (!name.trim()) {
      addToast({ message: t('يرجى كتابة اسم المنتج'), variant: 'error' })
      return
    }

    if (Number.isNaN(priceNum) || priceNum <= 0) {
      addToast({ message: t('يرجى إدخال سعر بيع صحيح أكبر من 0'), variant: 'error' })
      return
    }

    if (matrixVariants.length === 0) {
      addToast({ message: t('يرجى إضافة خيار واحد على الأقل'), variant: 'error' })
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
        image_url: imageUrl,
        variants: matrixVariants,
      })

      addToast({ message: t('تم إضافة المنتج وجميع الخيارات والمخزون بنجاح!'), variant: 'success' })
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('فشل إضافة المنتج')
      addToast({ message: msg, variant: 'error' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const basePriceVal = Number.parseFloat(priceDzd) || 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-semibold text-text-secondary hover:text-accent flex items-center gap-1 mb-1"
          >
            ← {t('العودة لقائمة المنتجات')}
          </button>
          <h1 className="text-xl font-bold text-text-primary">{t('إضافة منتج جديد وتوليد الخيارات')}</h1>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onBack} disabled={isSubmitting}>
            {t('إلغاء')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>
            {t('حفظ المنتج والمصفوفة')}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Base Info Card */}
        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4 pb-2 border-b border-border-light">
            1. {t('المعلومات الأساسية للمنتج')}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('اسم المنتج (مثال: تي شيرت كلاسيك)')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('أدخل اسم المنتج')}
              isValid={name.trim().length >= 2}
              error={name.length > 0 && name.trim().length < 2 ? t('اسم المنتج يجب أن يحتوي على حرفين على الأقل') : undefined}
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-extrabold text-[#1C2B3A] dark:text-slate-200">{t('الفئة')}</label>
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
              label={t('سعر البيع الافتراضي (DA)')}
              type="number"
              min="0"
              value={priceDzd}
              onChange={(e) => setPriceDzd(e.target.value)}
              placeholder="0"
              isValid={Number.parseFloat(priceDzd) > 0}
              error={priceDzd !== '' && (isNaN(Number.parseFloat(priceDzd)) || Number.parseFloat(priceDzd) <= 0) ? t('السعر يجب أن يكون مبلغاً موجباً أكبر من 0') : undefined}
              required
            />

            <Input
              label={t('سعر التكلفة (DA) — اختياري لحساب الربح')}
              type="number"
              min="0"
              value={costDzd}
              onChange={(e) => setCostDzd(e.target.value)}
              placeholder="0"
              isValid={costDzd !== '' && Number.parseFloat(costDzd) >= 0}
            />
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium text-text-primary block mb-1.5">{t('الوصف (اختياري)')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('أدخل وصفاً قصيراً للمنتج...')}
              rows={2}
              className="w-full px-4 py-2.5 rounded-2xl text-xs font-medium bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 text-[#1C2B3A] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {/* PC Image File Picker Section */}
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-800">
            <label className="text-xs font-bold text-[#1C2B3A] dark:text-slate-200 block mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-accent" />
              {t('صورة المنتج (رفع من الحاسوب)')}
            </label>
            <input
              type="file"
              ref={imageInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleImageFileChange}
            />

            {imageUrl ? (
              <div className="flex items-center gap-4 bg-gray-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-gray-200/80 dark:border-slate-700">
                <img
                  src={imageUrl}
                  alt={name || 'Product'}
                  className="w-20 h-20 object-cover rounded-xl border border-gray-300 dark:border-slate-600 shadow-sm"
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ {t('تم اختيار صورة المنتج بنجاح')}</p>
                  <p className="text-[11px] text-text-secondary mt-0.5">{t('ستظهر هذه الصورة في الكاشير وإشعارات تلغرام عند البيع.')}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setImageUrl(null)}
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <X className="w-4 h-4 ml-1" />
                  {t('إزالة')}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isProcessingImage}
                className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-slate-700 hover:border-accent dark:hover:border-accent rounded-2xl bg-gray-50/50 dark:bg-slate-800/40 hover:bg-accent/5 transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-[#1C2B3A] dark:text-slate-200">
                    {isProcessingImage ? t('جاري معالجة الصورة...') : t('اضغط هنا لاختيار صورة من جهاز الكمبيوتر')}
                  </p>
                  <p className="text-[10px] text-text-secondary mt-0.5">PNG, JPG, WEBP (حجم أقصى ينصح به 5 ميجابايت)</p>
                </div>
              </button>
            )}
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
