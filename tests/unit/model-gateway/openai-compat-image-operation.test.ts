import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateMock = vi.hoisted(() => vi.fn(async () => ({
  data: [{ url: 'https://cdn.test/generated.png' }],
})))
const editMock = vi.hoisted(() => vi.fn(async () => ({
  data: [{ url: 'https://cdn.test/edited.png' }],
})))
const resolveConfigMock = vi.hoisted(() => vi.fn(async () => ({
  providerId: 'openai-compatible:test-provider',
  baseUrl: 'https://compat.example.com/v1',
  apiKey: 'sk-test',
})))
const toUploadFileMock = vi.hoisted(() => vi.fn(async (_value: string, index: number) => (
  new File(['image'], `reference-${index}.png`, { type: 'image/png' })
)))

vi.mock('@/lib/model-gateway/openai-compat/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/model-gateway/openai-compat/common')>()
  return {
    ...actual,
    resolveOpenAICompatClientConfig: resolveConfigMock,
    createOpenAICompatClient: vi.fn(() => ({
      images: {
        generate: generateMock,
        edit: editMock,
      },
    })),
    toUploadFile: toUploadFileMock,
  }
})

import { generateImageViaOpenAICompat } from '@/lib/model-gateway/openai-compat/image'

describe('openai-compat image operation routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses images.edit only when operation is edit', async () => {
    const result = await generateImageViaOpenAICompat({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      prompt: 'edit this cat',
      referenceImages: ['data:image/png;base64,QQ=='],
      operation: 'edit',
      profile: 'openai-compatible',
    })

    expect(editMock).toHaveBeenCalledTimes(1)
    expect(generateMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/edited.png',
    })
  })

  it('keeps generate requests on images.generate even when reference images are present', async () => {
    const result = await generateImageViaOpenAICompat({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      prompt: 'generate from references',
      referenceImages: ['data:image/png;base64,QQ=='],
      operation: 'generate',
      profile: 'openai-compatible',
    })

    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(editMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/generated.png',
    })
  })
})
