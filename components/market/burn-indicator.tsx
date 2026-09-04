import { estimateRemaining, formatMoney } from '@/lib/rankburn-data'
import { cn } from '@/lib/utils'

/**
 * Depleting budget bar — the primary "burn" visualization. The filled portion
 * shrinks as budget is consumed and the leading edge glows to signal an active
 * campaign, without resorting to literal flames.
 */
export function BurnIndicator({
  budget,
  capacity,
  burnRate,
  showMeta = true,
  paused,
  className,
}: {
  budget: number
  capacity: number
  burnRate: number
  showMeta?: boolean
  paused?: boolean
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, (budget / capacity) * 100))
  const empty = budget <= 0

  return (
    <div className={cn('w-full', className)}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out',
            empty ? 'bg-muted-foreground/40' : 'bg-gradient-to-r from-primary/70 to-primary',
          )}
          style={{ width: `${pct}%` }}
        >
          {!empty && !paused && (
            <span className="absolute right-0 top-1/2 h-3 w-1.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary shadow-[0_0_10px_2px_var(--primary)] rb-pulse" />
          )}
        </div>
      </div>
      {showMeta && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular">
            {paused
              ? 'Paused'
              : empty
                ? 'Budget depleted'
                : `${formatMoney(burnRate)}/hour`}
          </span>
          <span className="tabular">
            {empty || paused
              ? '\u2014'
              : `${estimateRemaining(budget, burnRate)} left`}
          </span>
        </div>
      )}
    </div>
  )
}
