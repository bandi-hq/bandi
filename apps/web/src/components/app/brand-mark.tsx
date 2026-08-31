import darkMark from '../../assets/brand/bandi-mark-dark.png'
import lightMark from '../../assets/brand/bandi-mark-light.png'
import type { EffectiveTheme } from '../../ui-preferences'

export function BrandMark({
  theme,
  size = 32,
  className,
}: {
  theme: EffectiveTheme
  size?: number
  className?: string
}) {
  return (
    <img
      src={theme === 'dark' ? lightMark : darkMark}
      alt=""
      aria-hidden="true"
      data-brand-variant={theme}
      width={size}
      height={size}
      className={className}
    />
  )
}
