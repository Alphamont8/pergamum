import { NextResponse } from 'next/server'
import { getApiAuth } from '@/lib/auth/context'
import { extractTextFromBuffer, MAX_FILE_BYTES } from '@/lib/documents/extractText'
import { storeDocument } from '@/lib/documents/storage'
import { QuotaExceededError, assertWithinQuota, quotaErrorResponse } from '@/lib/ai/usage'

export async function POST(request: Request) {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!auth.user) {
    return NextResponse.json({ error: 'Sign in to upload documents' }, { status: 401 })
  }

  try {
    await assertWithinQuota(auth, 'extract')
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(quotaErrorResponse(err), { status: 429 })
    }
    throw err
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const projectId = formData.get('projectId')?.toString()
    const kind = (formData.get('kind')?.toString() ?? 'material') as
      | 'brief'
      | 'rubric'
      | 'material'
      | 'source'
    const sourceId = formData.get('sourceId')?.toString()

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { text, provider } = await extractTextFromBuffer(buffer, file.name)

    if (!text.trim()) {
      return NextResponse.json(
        { error: 'Could not extract text from this file' },
        { status: 422 },
      )
    }

    const documentId = await storeDocument({
      userId: auth.user.id,
      projectId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      buffer,
      kind,
      parsedText: text,
      parseStatus: 'parsed',
      parseProvider: provider,
      sourceId,
    })

    return NextResponse.json({ text, fileName: file.name, documentId, provider })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
