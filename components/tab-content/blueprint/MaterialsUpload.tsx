"use client"

import { useRef, useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import type { InstructionAttachment } from '../../../types'
import './MaterialsUpload.css'

const ACCEPT = '.pdf,.doc,.docx,.txt,.rtf'

interface MaterialsUploadProps {
  attachments: InstructionAttachment[]
  disabled?: boolean
  onUpload: (file: File) => void
  onRemove: (attachmentId: string) => void
}

export function MaterialsUpload({
  attachments,
  disabled,
  onUpload,
  onRemove,
}: MaterialsUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = (files: FileList | null) => {
    if (!files || disabled) return
    Array.from(files).forEach((file) => onUpload(file))
  }

  return (
    <div className="materials-upload">
      <p className="materials-upload__desc bp-hint">
        Upload assignment documents and rubrics only — add research sources in Outline.
      </p>

      <div
        className={`materials-upload__zone ${dragOver ? 'materials-upload__zone--drag' : ''} ${disabled ? 'materials-upload__zone--disabled' : ''}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        <Upload size={18} strokeWidth={1.75} aria-hidden />
        <span className="materials-upload__zone-text">Drop Files Or Click To Upload</span>
        <span className="materials-upload__zone-formats">PDF, DOCX, TXT, RTF</span>
      </div>

      {attachments.length > 0 && (
        <ul className="materials-upload__list">
          {attachments.map((att) => (
            <li key={att.id} className="materials-upload__item">
              <FileText size={15} strokeWidth={1.75} aria-hidden />
              <span className="materials-upload__name">{att.fileName}</span>
              <span
                className={`materials-upload__status materials-upload__status--${att.status}`}
              >
                {att.status === 'parsing'
                  ? 'Parsing'
                  : att.status === 'error'
                    ? 'Error'
                    : 'Ready'}
              </span>
              {!disabled && (
                <button
                  type="button"
                  className="materials-upload__remove"
                  aria-label={`Remove ${att.fileName}`}
                  onClick={() => onRemove(att.id)}
                >
                  <X size={14} strokeWidth={1.75} />
                </button>
              )}
              {att.status === 'error' && att.errorMessage && (
                <span className="materials-upload__error">{att.errorMessage}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept={ACCEPT}
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
