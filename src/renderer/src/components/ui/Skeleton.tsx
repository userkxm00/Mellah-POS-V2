import React from 'react'

interface SkeletonProps {
  readonly className?: string
}

/**
 * Base skeleton shimmer block. Use className to set width/height.
 */
export function Skeleton({ className = '' }: SkeletonProps): React.JSX.Element {
  return <div className={`skeleton ${className}`} />
}

/**
 * Skeleton that mimics a single line of text.
 */
export function SkeletonLine({
  width = 'w-3/4',
}: {
  readonly width?: string
}): React.JSX.Element {
  return <Skeleton className={`h-4 ${width} rounded-lg`} />
}

/**
 * Skeleton that mimics a card with header and body lines.
 */
export function SkeletonCard(): React.JSX.Element {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-gray-200/80 dark:border-slate-700/80 shadow-layered-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-1/3 rounded-lg" />
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-5/6 rounded-lg" />
        <Skeleton className="h-4 w-2/3 rounded-lg" />
      </div>
    </div>
  )
}

/**
 * Skeleton for dashboard stat cards.
 */
export function SkeletonStatCard(): React.JSX.Element {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-gray-200/80 dark:border-slate-700/80 p-5 shadow-layered-sm flex items-center justify-between">
      <div className="space-y-2 flex-1">
        <Skeleton className="h-3.5 w-24 rounded-md" />
        <Skeleton className="h-7 w-32 rounded-lg" />
      </div>
      <Skeleton className="w-12 h-12 rounded-2xl" />
    </div>
  )
}

/**
 * Skeleton for table rows.
 */
export function SkeletonTableRow({ cols = 5 }: { readonly cols?: number }): React.JSX.Element {
  return (
    <tr className="border-b border-gray-100 dark:border-slate-800">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={`skel-td-${i}`} className="py-4 px-4">
          <Skeleton className="h-4 w-4/5 rounded-md" />
        </td>
      ))}
    </tr>
  )
}

/**
 * Skeleton that mimics a circular avatar.
 */
export function SkeletonCircle({
  size = 'w-10 h-10',
}: {
  readonly size?: string
}): React.JSX.Element {
  return <Skeleton className={`${size} rounded-full`} />
}
