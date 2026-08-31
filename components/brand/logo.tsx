import { cn } from '@/lib/utils'

/**
 * RankBurn mark — three ascending bars (position / ascent / energy) where the
 * tallest carries an active "burning" edge. Abstract, not a literal flame, and
 * legible at favicon scale.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('h-7 w-7', className)}
      aria-hidden="true"
    >
      <rect x="3" y="19" width="6" height="10" rx="2" fill="currentColor" opacity="0.35" />
      <rect x="13" y="12" width="6" height="17" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="23" y="4" width="6" height="25" rx="2" fill="var(--primary)" />
      <rect x="23" y="4" width="6" height="6" rx="2" fill="var(--primary)">
        <animate
          attributeName="opacity"
          values="1;0.55;1"
          dur="1.8s"
          repeatCount="indefinite"
        />
      </rect>
    </svg>
  )
}

export function Logo({
  className,
  markClassName,
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      <span className="text-[17px] font-semibold tracking-tight text-foreground">
        Rank<span className="text-primary">Burn</span>
      </span>
    </span>
  )
}
