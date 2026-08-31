import { cn } from '@/lib/utils'

/**
 * Deterministic product "logo" tile built from the company initial + hue.
 * Avoids shipping a dozen raster logos while staying crisp and on-brand.
 */
export function Monogram({
  name,
  hue,
  size,
  className,
}: {
  name: string
  hue: number
  size?: number
  className?: string
}) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 font-semibold text-white/95',
        className,
      )}
      style={{
        background: `linear-gradient(150deg, oklch(0.55 0.13 ${hue}), oklch(0.32 0.08 ${hue}))`,
        ...(size ? { width: size, height: size } : {}),
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}
