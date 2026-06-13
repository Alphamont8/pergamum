import type { SVGProps } from 'react'

export const APP_ICON_VIEWBOX = '0 0 24 24'

export const APP_ICON_STROKE = 1.5

const ICON_CLASS = 'app-icon'

/** Rigid square SVG frame — prevents flex/layout stretch distortion. */
export function appIconProps(
  size: number,
  className?: string,
): Pick<
  SVGProps<SVGSVGElement>,
  'width' | 'height' | 'viewBox' | 'preserveAspectRatio' | 'className' | 'aria-hidden'
> {
  const classes = [ICON_CLASS, className].filter(Boolean).join(' ')
  return {
    width: size,
    height: size,
    viewBox: APP_ICON_VIEWBOX,
    preserveAspectRatio: 'xMidYMid meet',
    className: classes || undefined,
    'aria-hidden': true,
  }
}

type AppIconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

export function AppIcon({
  size = 20,
  className,
  children,
  strokeWidth = APP_ICON_STROKE,
  ...rest
}: AppIconProps) {
  return (
    <svg
      {...appIconProps(size, className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}
