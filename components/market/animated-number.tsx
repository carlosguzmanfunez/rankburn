'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  value: number
  prefix?: string
  decimals?: number
  className?: string
  /** flash green/amber-red when the value changes */
  flash?: boolean
}

/**
 * Displays a monetary/numeric value that briefly flashes when it changes —
 * the core "market is alive" micro-signal. Uses tabular figures so digits
 * never shift horizontally as they tick.
 */
export function AnimatedNumber({
  value,
  prefix = '',
  decimals = 2,
  className,
  flash = true,
}: Props) {
  const prev = useRef(value)
  const [dir, setDir] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (value === prev.current) return
    if (flash) {
      setDir(value > prev.current ? 'up' : 'down')
      const t = setTimeout(() => setDir(null), 550)
      prev.current = value
      return () => clearTimeout(t)
    }
    prev.current = value
  }, [value, flash])

  return (
    <span
      className={cn(
        'tabular tabular-nums transition-colors duration-500',
        dir === 'up' && 'text-up',
        dir === 'down' && 'text-primary',
        className,
      )}
    >
      {prefix}
      {value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  )
}
