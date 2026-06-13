import { createServiceClient } from '@/lib/supabase/server'
import type { TablesInsert } from '@/types/database'

const BUCKET = 'documents'

export interface StoreDocumentInput {
  userId: string
  projectId: string
  fileName: string
  mimeType: string
  buffer: Buffer
  kind: 'brief' | 'rubric' | 'material' | 'source'
  parsedText?: string
  parseStatus: 'pending' | 'parsing' | 'parsed' | 'error'
  parseProvider?: 'local' | 'llamaparse'
  sourceId?: string
}

export async function storeDocument(input: StoreDocumentInput): Promise<string> {
  const service = await createServiceClient()
  const documentId = crypto.randomUUID()
  const storagePath = `${input.userId}/${input.projectId}/${documentId}/${input.fileName}`

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(storagePath, input.buffer, {
      contentType: input.mimeType,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`)
  }

  const row: TablesInsert<'documents'> = {
    id: documentId,
    user_id: input.userId,
    project_id: input.projectId,
    file_name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: input.buffer.length,
    storage_path: storagePath,
    kind: input.kind,
    parsed_text: input.parsedText ?? null,
    parse_status: input.parseStatus,
    parse_provider: input.parseProvider ?? null,
    source_id: input.sourceId ?? null,
  }

  const { error: insertError } = await service.from('documents').insert(row)
  if (insertError) {
    throw new Error(`Document record failed: ${insertError.message}`)
  }

  return documentId
}

export async function updateDocumentParse(
  documentId: string,
  parsedText: string,
  parseProvider: 'local' | 'llamaparse',
): Promise<void> {
  const service = await createServiceClient()
  await service
    .from('documents')
    .update({
      parsed_text: parsedText,
      parse_status: 'parsed',
      parse_provider: parseProvider,
    })
    .eq('id', documentId)
}
