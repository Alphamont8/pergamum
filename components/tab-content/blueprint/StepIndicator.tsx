"use client"

import './StepIndicator.css'

interface StepIndicatorProps {
  current: 'blueprint' | 'outline' | 'draft'
  blueprintApproved: boolean
}

const STEPS = [
  { id: 'blueprint' as const, label: 'Blueprint' },
  { id: 'outline' as const, label: 'Outline' },
  { id: 'draft' as const, label: 'Draft' },
]

export function StepIndicator({ current, blueprintApproved }: StepIndicatorProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === current)

  return (
    <nav className="step-indicator" aria-label="Workflow progress">
      <ol className="step-indicator__list">
        {STEPS.map((step, index) => {
          const isComplete =
            step.id === 'blueprint'
              ? blueprintApproved
              : index < currentIndex
          const isCurrent = step.id === current
          return (
            <li
              key={step.id}
              className={`step-indicator__item ${isCurrent ? 'step-indicator__item--current' : ''} ${isComplete ? 'step-indicator__item--complete' : ''}`}
            >
              <span className="step-indicator__dot" aria-hidden />
              <span className="step-indicator__label">{step.label}</span>
              {index < STEPS.length - 1 && (
                <span className="step-indicator__connector" aria-hidden />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
