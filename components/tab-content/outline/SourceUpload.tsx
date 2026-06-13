"use client"

import { useRef, useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import type { SourceRecord } from '../../../types'
import './SourceUpload.css'

const ACCEPT = '.pdf,.doc,.docx,.txt,.rtf'

interface SourceUploadProps {
  sources: SourceRecord[]
  disabled?: boolean
  selectedNodeId: string | null
  onUpload: (fileName: string) => string
  onAttach: (nodeId: string, sourceId: string) => void
}

export function SourceUpload({
  sources,
  disabled,
  selectedNodeId,
  onUpload,
  onAttach,
}: SourceUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const uploadedSources = sources.filter((s) => s.fileName)

  const handleFiles = (files: FileList | null) => {
    if (!files || disabled) return
    Array.from(files).forEach((file) => {
      const sourceId = onUpload(file.name)
      if (selectedNodeId) onAttach(selectedNodeId, sourceId)
    })
  }

  return (
    <div className="source-upload">
      <span className="bp-section-label">Your Sources</span>
      <p className="bp-hint">Upload research documents and attach them to the active subpoint.</p>

      <div
        className={`source-upload__zone ${dragOver ? 'source-upload__zone--drag' : ''} ${disabled ? 'source-upload__zone--disabled' : ''}`}
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
        <span className="source-upload__zone-text">Drop Files Or Click To Upload</span>
        <span className="source-upload__zone-formats">PDF, DOCX, TXT, RTF</span>
      </div>

      {uploadedSources.length > 0 && (
        <ul className="source-upload__list">
          {uploadedSources.map((src) => (
            <li key={src.id} className="source-upload__item">
              <FileText size={14} strokeWidth={1.75} aria-hidden />
              <span className="source-upload__name">{src.fileName ?? src.title}</span>
              <button
                type="button"
                className="source-upload__attach-btn"
                disabled={!selectedNodeId}
                onClick={() => selectedNodeId && onAttach(selectedNodeId, src.id)}
              >
                Attach
              </button>
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
