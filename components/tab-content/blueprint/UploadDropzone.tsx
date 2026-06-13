"use client"

import { useRef, useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import type { InstructionAttachment, InstructionAttachmentKind } from '../../../types'
import './UploadDropzone.css'

interface UploadDropzoneProps {
  kind: InstructionAttachmentKind
  label: string
  hint: string
  attachment: InstructionAttachment | null
  disabled?: boolean
  onUpload: (file: File, kind: InstructionAttachmentKind) => void
  onRemove: (attachmentId: string) => void
}

const ACCEPT = '.pdf,.doc,.docx,.txt,.rtf'

export function UploadDropzone({
  kind,
  label,
  hint,
  attachment,
  disabled,
  onUpload,
  onRemove,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const handleFile = (file: File | undefined) => {
    if (file && !disabled) onUpload(file, kind)
  }

  const statusLabel =
    attachment?.status === 'parsing'
      ? 'Parsing…'
      : attachment?.status === 'error'
        ? 'Error'
        : attachment?.status === 'parsed'
          ? 'Parsed'
          : null

  return (
    <div className="upload-dropzone">
      <div className="upload-dropzone__header">
        <span className="upload-dropzone__label">{label}</span>
        {statusLabel && (
          <span
            className={`upload-dropzone__status upload-dropzone__status--${attachment?.status}`}
          >
            {statusLabel}
          </span>
        )}
      </div>

      {!attachment ? (
        <div
          className={`upload-dropzone__zone ${dragOver ? 'upload-dropzone__zone--drag' : ''} ${disabled ? 'upload-dropzone__zone--disabled' : ''}`}
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
            handleFile(e.dataTransfer.files[0])
          }}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
        >
          <Upload size={18} strokeWidth={1.5} aria-hidden />
          <span className="upload-dropzone__hint">{hint}</span>
          <span className="upload-dropzone__formats">PDF, DOCX, TXT, RTF</span>
        </div>
      ) : (
        <div className="upload-dropzone__chip">
          <FileText size={16} strokeWidth={1.5} aria-hidden />
          <span className="upload-dropzone__filename">{attachment.fileName}</span>
          {!disabled && (
            <button
              type="button"
              className="upload-dropzone__remove"
              aria-label={`Remove ${attachment.fileName}`}
              onClick={() => onRemove(attachment.id)}
            >
              ×
            </button>
          )}
        </div>
      )}

      {attachment?.status === 'parsed' && attachment.extractedText && (
        <div className="upload-dropzone__preview-wrap">
          <button
            type="button"
            className="upload-dropzone__preview-toggle"
            aria-expanded={previewOpen}
            onClick={() => setPreviewOpen((o) => !o)}
          >
            {previewOpen ? 'Hide extracted text' : 'Show extracted text'}
          </button>
          {previewOpen && (
            <pre className="upload-dropzone__preview">{attachment.extractedText.slice(0, 1200)}
              {attachment.extractedText.length > 1200 ? '…' : ''}
            </pre>
          )}
        </div>
      )}

      {attachment?.status === 'error' && attachment.errorMessage && (
        <p className="upload-dropzone__error">{attachment.errorMessage}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPT}
        disabled={disabled}
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
