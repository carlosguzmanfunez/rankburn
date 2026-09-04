import { cn } from '@/lib/utils'

/**
 * Minimal rank-over-time line. Y is inverted so #1 sits at the top. Kept
 * deliberately clean — reads in seconds, not a financial dashboard.
 */
export function RankHistoryChart({
  history,
  className,
  height = 120,
}: {
  history: number[]
  className?: string
  height?: number
}) {
  const width = 320
  const pad = 10
  const maxRank = Math.max(...history, 3)
  const minRank = 1
  const span = Math.max(1, maxRank - minRank)

  const points = history.map((rank, i) => {
    const x = pad + (i / Math.max(1, history.length - 1)) * (width - pad * 2)
    const y = pad + ((rank - minRank) / span) * (height - pad * 2)
    return [x, y] as const
  })

  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${
    height - pad
  } L${points[0][0].toFixed(1)},${height - pad} Z`
  const last = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full', className)}
      role="img"
      aria-label="Rank history over time"
    >
      <defs>
        <linearGradient id="rankFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rankFill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="4" fill="var(--primary)" />
      <circle
        cx={last[0]}
        cy={last[1]}
        r="4"
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.4"
        strokeWidth="6"
      />
    </svg>
  )
}
