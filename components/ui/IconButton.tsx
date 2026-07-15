import { type ButtonHTMLAttributes, forwardRef } from 'react'
import './ui.css'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, className = '', type = 'button', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`pg-icon-btn ${active ? 'is-active' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  )
})
