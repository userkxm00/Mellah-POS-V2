import React, { useState, useEffect } from 'react'
import { Button, Table } from '@/components/ui'
import type { Column } from '@/components/ui'
import type { VariantInput } from '@/services/productService'

const PRESET_SIZES = ['S', 'M', 'L', 'XL', '2XL', '38', '40', '42', '44']
const PRESET_COLORS = ['أسود', 'أبيض', 'أزرق', 'أحمر', 'رمادي', 'أخضر', 'كحلي']

interface VariantMatrixBuilderProps {
  readonly basePrice: number
  readonly onChange: (variants: VariantInput[]) => void
}

interface MatrixRow extends VariantInput {
  key: string
}

// Helper to generate a 12-digit barcode: 690 + crypto random 9 digits
const generateBarcode = (): string => {
  const array = new Uint32Array(1)
  window.crypto.getRandomValues(array)
  const randomVal = (array[0] % 900000000) + 100000000
  return `690${randomVal}`
}

function buildMatrixRows(
  selectedSizes: string[],
  selectedColors: string[],
  existingRows: MatrixRow[]
): MatrixRow[] {
  if (selectedSizes.length === 0 && selectedColors.length === 0) {
    return [{
      key: 'default-variant',
      size: null,
      color: null,
      barcode: generateBarcode(),
      sku: 'SKU-DEFAULT',
      price_dzd: null,
      initial_stock: 10,
    }]
  }

  const sizesToUse = selectedSizes.length > 0 ? selectedSizes : [null]
  const colorsToUse = selectedColors.length > 0 ? selectedColors : [null]
  const result: MatrixRow[] = []
  let counter = 1

  for (const s of sizesToUse) {
    for (const c of colorsToUse) {
      const rowKey = `${s ?? 'NOSIZE'}-${c ?? 'NOCOLOR'}`
      const existing = existingRows.find((r) => r.key === rowKey)
      result.push(
        existing ?? {
          key: rowKey,
          size: s,
          color: c,
          barcode: generateBarcode(),
          sku: `SKU-${counter++}`,
          price_dzd: null,
          initial_stock: 10,
        }
      )
    }
  }

  return result
}

export function VariantMatrixBuilder({
  basePrice,
  onChange,
}: VariantMatrixBuilderProps): React.JSX.Element {
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['M', 'L'])
  const [selectedColors, setSelectedColors] = useState<string[]>(['أسود', 'أبيض'])
  const [customSizeInput, setCustomSizeInput] = useState<string>('')
  const [customColorInput, setCustomColorInput] = useState<string>('')
  const [matrixRows, setMatrixRows] = useState<MatrixRow[]>([])

  // Regenerate matrix when selected sizes or colors change
  useEffect(() => {
    setMatrixRows((prev) => buildMatrixRows(selectedSizes, selectedColors, prev))
  }, [selectedSizes, selectedColors])

  // Notify parent on matrix update
  useEffect(() => {
    onChange(matrixRows)
  }, [matrixRows, onChange])

  const toggleSize = (size: string): void => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    )
  }

  const toggleColor = (color: string): void => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    )
  }

  const addCustomSize = (): void => {
    const val = customSizeInput.trim()
    if (val && !selectedSizes.includes(val)) {
      setSelectedSizes((prev) => [...prev, val])
      setCustomSizeInput('')
    }
  }

  const addCustomColor = (): void => {
    const val = customColorInput.trim()
    if (val && !selectedColors.includes(val)) {
      setSelectedColors((prev) => [...prev, val])
      setCustomColorInput('')
    }
  }

  const updateRowField = (
    key: string,
    field: keyof VariantInput,
    value: string | number | null
  ): void => {
    setMatrixRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    )
  }

  const columns: Column<MatrixRow>[] = [
    {
      key: 'size',
      header: 'المقاس',
      render: (row) => (
        <span className="font-semibold text-text-primary">{row.size ?? 'عام'}</span>
      ),
    },
    {
      key: 'color',
      header: 'اللون',
      render: (row) => (
        <span className="font-semibold text-text-primary">{row.color ?? 'عام'}</span>
      ),
    },
    {
      key: 'barcode',
      header: 'الباركود',
      render: (row) => (
        <div className="flex items-center gap-1.5 min-w-[170px]">
          <input
            type="text"
            value={row.barcode}
            onChange={(e) => updateRowField(row.key, 'barcode', e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={() => updateRowField(row.key, 'barcode', generateBarcode())}
            className="p-1.5 rounded bg-gray-100 text-text-secondary hover:bg-gray-200 text-xs font-medium"
            title="توليد باركود تلقائي"
          >
            🔄
          </button>
        </div>
      ),
    },
    {
      key: 'price_dzd',
      header: 'السعر (تجاوز افتراضي)',
      render: (row) => (
        <input
          type="number"
          placeholder={`الافتراضي: ${basePrice} DA`}
          value={row.price_dzd ?? ''}
          onChange={(e) =>
            updateRowField(
              row.key,
              'price_dzd',
              e.target.value ? Number.parseFloat(e.target.value) : null
            )
          }
          className="w-32 px-2.5 py-1.5 rounded-lg border border-border text-xs bg-white focus:outline-none focus:ring-1 focus:ring-accent"
        />
      ),
    },
    {
      key: 'initial_stock',
      header: 'المخزون الأولي',
      render: (row) => (
        <input
          type="number"
          min="0"
          value={row.initial_stock}
          onChange={(e) =>
            updateRowField(
              row.key,
              'initial_stock',
              Number.parseInt(e.target.value, 10) || 0
            )
          }
          className="w-24 px-2.5 py-1.5 rounded-lg border border-border text-xs font-bold text-accent bg-white focus:outline-none focus:ring-1 focus:ring-accent"
        />
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Size Picker */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-text-primary">1. اختر المقاسات المتوفرة:</label>
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 btn-press border ${
                selectedSizes.includes(size)
                  ? 'bg-accent text-white border-accent shadow-ambient-sm'
                  : 'bg-white text-text-secondary border-border hover:bg-gray-50'
              }`}
              onClick={() => toggleSize(size)}
            >
              {size}
            </button>
          ))}
          <div className="flex items-center gap-1 mr-2">
            <input
              type="text"
              placeholder="مقاس آخر..."
              value={customSizeInput}
              onChange={(e) => setCustomSizeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomSize())}
              className="w-24 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-white"
            />
            <Button size="sm" variant="secondary" type="button" onClick={addCustomSize}>
              +
            </Button>
          </div>
        </div>
      </div>

      {/* Color Picker */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-text-primary">2. اختر الألوان المتوفرة:</label>
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 btn-press border ${
                selectedColors.includes(color)
                  ? 'bg-accent text-white border-accent shadow-ambient-sm'
                  : 'bg-white text-text-secondary border-border hover:bg-gray-50'
              }`}
              onClick={() => toggleColor(color)}
            >
              {color}
            </button>
          ))}
          <div className="flex items-center gap-1 mr-2">
            <input
              type="text"
              placeholder="لون آخر..."
              value={customColorInput}
              onChange={(e) => setCustomColorInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomColor())}
              className="w-24 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-white"
            />
            <Button size="sm" variant="secondary" type="button" onClick={addCustomColor}>
              +
            </Button>
          </div>
        </div>
      </div>

      {/* Generated Matrix Table */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-text-primary">
            3. مصفوفة الخيارات وتحديد الباركود والمخزون ({matrixRows.length} خيار):
          </label>
        </div>

        <Table
          columns={columns}
          data={matrixRows}
          rowKey={(row) => row.key}
        />
      </div>
    </div>
  )
}
