import React from 'react'

interface SkeletonProps {
  className?: string
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
  width?: string
}): React.JSX.Element {
  return <Skeleton className={`h-4 ${width} rounded`} />
}

/**
 * Skeleton that mimics a card with header and body lines.
 */
export function SkeletonCard(): React.JSX.Element {
  return (
    <div className="bg-bg-card rounded-card shadow-ambient p-5 space-y-4">
      <Skeleton className="h-5 w-1/3 rounded" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-5/6 rounded" />
        <Skeleton className="h-4 w-2/3 rounded" />
      </div>
    </div>
  )
}

/**
 * Skeleton that mimics a circular avatar.
 */
export function SkeletonCircle({
  size = 'w-10 h-10',
}: {
  size?: string
}): React.JSX.Element {
  return <Skeleton className={`${size} rounded-full`} />
}
