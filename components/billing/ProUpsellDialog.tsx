'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { proUpsellCopy, type ProUpsellFeature } from '@/lib/billing/proUpsell'

export function ProUpsellDialog({
  open,
  onClose,
  feature,
  detail,
}: {
  open: boolean
  onClose: () => void
  feature: ProUpsellFeature
  detail?: string
}) {
  const copy = proUpsellCopy(feature, detail)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={copy.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep Exploring
          </Button>
          <Link href="/upgrade" className="pg-btn pg-btn--accent pg-btn--md" onClick={onClose}>
            {copy.cta}
          </Link>
        </>
      }
    >
      <p className="pro-upsell__body">{copy.body}</p>
      <p className="pro-upsell__highlight">{copy.highlight}</p>
    </Dialog>
  )
}
