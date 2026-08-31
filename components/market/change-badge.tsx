import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Compact position-change badge: ↑2 / ↓1 / NEW / — .
 */
export function ChangeBadge({
  delta,
  isNew,
  className,
}: {
  delta: number
  isNew?: boolean
  className?: string
}) {
  if (isNew) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-md bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info',
          className,
        )}
      >
        New
      </span>
    )
  }

  if (delta === 0) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-xs font-medium tabular text-muted-foreground',
          className,
        )}
      >
        <Minus className="h-3 w-3" />
      </span>
    )
  }

  const up = delta > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-semibold tabular',
        up ? 'text-up' : 'text-down',
        className,
      )}
    >
      {up ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {Math.abs(delta)}
    </span>
  )
}
