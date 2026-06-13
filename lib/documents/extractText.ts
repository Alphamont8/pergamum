import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { isLlamaParseConfigured, parseBufferWithLlama } from './llamaparse'

const MAX_FILE_BYTES = 10 * 1024 * 1024

const LLAMA_EXTENSIONS = new Set(['pdf', 'docx', 'doc', 'pptx', 'ppt'])

function mimeForExt(ext: string): string {
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'doc':
      return 'application/msword'
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case 'txt':
      return 'text/plain'
    case 'md':
      return 'text/markdown'
    default:
      return 'application/octet-stream'
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return (result.text ?? '').trim()
  } finally {
    await parser.destroy()
  }
}

export async function extractTextFromBufferLocal(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'txt' || ext === 'rtf' || ext === 'md') {
    return buffer.toString('utf-8').trim()
  }

  if (ext === 'pdf') {
    return parsePdf(buffer)
  }

  if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.extractRawText({ buffer })
    return (result.value ?? '').trim()
  }

  throw new Error(`Unsupported file type: .${ext}`)
}

export interface ExtractResult {
  text: string
  provider: 'local' | 'llamaparse'
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<ExtractResult> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'txt' || ext === 'rtf' || ext === 'md') {
    return { text: buffer.toString('utf-8').trim(), provider: 'local' }
  }

  if (LLAMA_EXTENSIONS.has(ext) && isLlamaParseConfigured()) {
    try {
      const parsed = await parseBufferWithLlama(buffer, fileName, mimeForExt(ext))
      return { text: parsed.text, provider: 'llamaparse' }
    } catch {
      /* fall through to local */
    }
  }

  const text = await extractTextFromBufferLocal(buffer, fileName)
  return { text, provider: 'local' }
}

export { MAX_FILE_BYTES }
