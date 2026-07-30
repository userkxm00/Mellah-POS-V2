import React from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { SkeletonTableRow } from './Skeleton'
import { EmptyState } from './EmptyState'

// ----- Types -----

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  align?: 'right' | 'left' | 'center'
  width?: string
  sortable?: boolean
}

export interface TableProps<T> {
  readonly columns: Column<T>[]
  readonly data: T[]
  readonly loading?: boolean
  readonly emptyMessage?: string
  readonly emptyType?: 'cart' | 'search' | 'sales' | 'customers'
  readonly onRowClick?: (row: T) => void
  readonly rowKey: (row: T) => string
  readonly sortKey?: string
  readonly sortOrder?: 'asc' | 'desc'
  readonly onSort?: (key: string) => void
  readonly className?: string
}

// ----- Component -----

export function Table<T>({
  columns,
  data,
  loading = false,
  emptyMessage = 'لا توجد بيانات متاحة حالياً',
  emptyType = 'search',
  onRowClick,
  rowKey,
  sortKey,
  sortOrder = 'asc',
  onSort,
  className = '',
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
    <div className={`overflow-auto rounded-2xl border border-gray-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-layered-sm relative ${className}`}>
      <table className="w-full text-xs select-none">
        <thead>
          <tr className="border-b border-gray-200/80 dark:border-slate-800 bg-gray-50/90 dark:bg-slate-800/80 backdrop-blur-md">
            {columns.map((col) => {
              const isSorted = sortKey === col.key
              const isSortable = col.sortable && onSort

              return (
                <th
                  key={col.key}
                  onClick={() => isSortable && onSort(col.key)}
                  className={[
                    'px-4 py-3.5 font-black text-[#1C2B3A] dark:text-slate-200 tracking-tight',
                    'sticky top-0 bg-gray-50/95 dark:bg-slate-800/95 backdrop-blur-md z-10',
                    alignClass(col.align),
                    isSortable ? 'cursor-pointer hover:text-accent transition-colors' : '',
                  ].join(' ')}
                  style={col.width ? { width: col.width } : undefined}
                >
                  <div className={`inline-flex items-center gap-1.5 ${col.align === 'left' ? 'justify-start' : col.align === 'center' ? 'justify-center' : 'justify-end'}`}>
                    <span>{col.header}</span>
                    {isSortable && (
                      <span className="text-text-tertiary">
                        {isSorted ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-accent" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-accent" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <>
              <SkeletonTableRow cols={columns.length} />
              <SkeletonTableRow cols={columns.length} />
              <SkeletonTableRow cols={columns.length} />
              <SkeletonTableRow cols={columns.length} />
              <SkeletonTableRow cols={columns.length} />
            </>
          )}

          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12">
                <EmptyState variant={emptyType} title={emptyMessage} />
              </td>
            </tr>
          )}

          {!loading &&
            data.map((row) => (
              <tr
                key={rowKey(row)}
                className={[
                  'group border-b border-gray-100 dark:border-slate-800/80 last:border-b-0',
                  'transition-colors duration-150',
                  onRowClick
                    ? 'cursor-pointer hover:bg-accent/5 dark:hover:bg-accent/10'
                    : 'hover:bg-gray-50/80 dark:hover:bg-slate-800/50',
                ].join(' ')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={['px-4 py-3 font-medium text-[#1C2B3A] dark:text-slate-200', alignClass(col.align)].join(' ')}
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
