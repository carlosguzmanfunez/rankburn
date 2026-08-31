'use client'

import { ArrowUp, Crown, LogIn, Plus } from 'lucide-react'
import {
  useMarket,
  type ActivityItem,
} from '@/components/market/market-provider'
import { LiveDot } from '@/components/market/live-dot'
import { cn } from '@/lib/utils'

const ICON = {
  took: Crown,
  added: Plus,
  moved: ArrowUp,
  entered: LogIn,
}

const TONE = {
  took: 'text-primary bg-primary/12',
  added: 'text-up bg-up/12',
  moved: 'text-info bg-info/12',
  entered: 'text-muted-foreground bg-surface-3',
}

export function ActivityFeed({ className }: { className?: string }) {
  const { activity, synced } = useMarket()

  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Market activity
        </h3>
        <LiveDot />
      </div>
      {activity.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {synced
            ? 'No placement changes since you opened this page. Movement appears here as advertising budgets change.'
            : 'Connecting to the live market…'}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-1">
          {activity.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const Icon = ICON[item.kind]
  return (
    <li className="rb-rise flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-1">
      <span
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          TONE[item.kind],
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm text-foreground">
        <span className="font-semibold">{item.companyName}</span>{' '}
        <span className="text-muted-foreground">{item.text}</span>
      </p>
    </li>
  )
}
