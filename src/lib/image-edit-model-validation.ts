import { getProviderKey, resolveModelSelection } from '@/lib/api-config'
import { resolveOpenAICompatTemplateOperation } from '@/lib/openai-compat-media-template'

export async function assertImageEditModelSupported(
  userId: string,
  imageModel: string | null | undefined,
): Promise<void> {
  const modelKey = typeof imageModel === 'string' ? imageModel.trim() : ''
  if (!modelKey) return

  const selection = await resolveModelSelection(userId, modelKey, 'image')
  const providerKey = getProviderKey(selection.provider).toLowerCase()
  const compatTemplate = selection.compatMediaTemplate

  if (!compatTemplate) {
    if (providerKey === 'openai-compatible') {
      throw new Error(`MODEL_COMPAT_MEDIA_TEMPLATE_REQUIRED: ${selection.modelKey}`)
    }
    return
  }

  if (!resolveOpenAICompatTemplateOperation(compatTemplate, 'edit')) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_OPERATION_UNSUPPORTED: edit')
  }
}
