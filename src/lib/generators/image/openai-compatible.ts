import { BaseImageGenerator, type GenerateResult, type ImageGenerateParams } from '../base'
import { generateImageViaOpenAICompat } from '@/lib/model-gateway'
import type { OpenAICompatImageOperation } from '@/lib/openai-compat-media-template'

export class OpenAICompatibleImageGenerator extends BaseImageGenerator {
  private readonly modelId?: string
  private readonly providerId?: string

  constructor(modelId?: string, providerId?: string) {
    super()
    this.modelId = modelId
    this.providerId = providerId
  }

  protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
    const { userId, prompt, referenceImages = [], options = {} } = params
    const { operation, ...generatorOptions } = options as Record<string, unknown> & { operation?: unknown }
    if (operation !== undefined && operation !== 'generate' && operation !== 'edit') {
      throw new Error(`OPENAI_COMPAT_IMAGE_OPTION_UNSUPPORTED: operation=${String(operation)}`)
    }
    return await generateImageViaOpenAICompat({
      userId,
      providerId: this.providerId || 'openai-compatible',
      modelId: this.modelId,
      prompt,
      referenceImages,
      ...(operation ? { operation: operation as OpenAICompatImageOperation } : {}),
      options: generatorOptions,
      profile: 'openai-compatible',
    })
  }
}
