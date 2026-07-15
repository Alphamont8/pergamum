import { type ButtonHTMLAttributes, forwardRef } from 'react'
import './ui.css'

type Variant = 'primary' | 'ghost' | 'accent' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'md', className = '', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`pg-btn pg-btn--${variant} pg-btn--${size} ${className}`.trim()}
      {...props}
    />
  )
})
