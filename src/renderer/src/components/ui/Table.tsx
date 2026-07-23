import React from 'react'

// ----- Types -----

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  align?: 'right' | 'left' | 'center'
  width?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (row: T) => void
  rowKey: (row: T) => string
}

// ----- Skeleton rows for loading state -----

function SkeletonRow({ colCount }: { colCount: number }): React.JSX.Element {
  return (
    <tr>
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 w-3/4 rounded" />
        </td>
      ))}
    </tr>
  )
}

// ----- Component -----

export function Table<T>({
  columns,
  data,
  loading = false,
  emptyMessage = 'لا توجد بيانات',
  onRowClick,
  rowKey,
}: TableProps<T>): React.JSX.Element {
  const alignClass = (align?: string): string => {
    switch (align) {
      case 'left':
        return 'text-left'
      case 'center':
        return 'text-center'
      default:
        return 'text-right'
    }
  }

  return (
    <div className="overflow-auto rounded-card border border-border-light bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-light bg-bg-base/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  'px-4 py-3 font-semibold text-text-secondary',
                  'sticky top-0 bg-bg-base/80 backdrop-blur-sm',
                  alignClass(col.align),
                ].join(' ')}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <>
              <SkeletonRow colCount={columns.length} />
              <SkeletonRow colCount={columns.length} />
              <SkeletonRow colCount={columns.length} />
              <SkeletonRow colCount={columns.length} />
              <SkeletonRow colCount={columns.length} />
            </>
          )}

          {!loading && data.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-text-tertiary"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {!loading &&
            data.map((row) => (
              <tr
                key={rowKey(row)}
                className={[
                  'border-b border-border-light last:border-b-0',
                  'transition-colors duration-150',
                  onRowClick
                    ? 'cursor-pointer hover:bg-accent-light'
                    : 'hover:bg-gray-50/50',
                ].join(' ')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={['px-4 py-3', alignClass(col.align)].join(' ')}
                  >
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

export type { Column, TableProps }
