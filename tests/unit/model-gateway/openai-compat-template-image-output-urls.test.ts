import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveConfigMock = vi.hoisted(() => vi.fn(async () => ({
  providerId: 'openai-compatible:test-provider',
  baseUrl: 'https://compat.example.com/v1',
  apiKey: 'sk-test',
})))

vi.mock('@/lib/model-gateway/openai-compat/common', () => ({
  resolveOpenAICompatClientConfig: resolveConfigMock,
  toUploadFile: vi.fn(async (value: string, index: number) => new File([value], `reference-${index}.png`, { type: 'image/png' })),
}))

import { generateImageViaOpenAICompatTemplate } from '@/lib/model-gateway/openai-compat/template-image'

describe('openai-compat template image output urls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all image urls when outputUrlsPath contains multiple values', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { url: 'https://cdn.test/1.png' },
        { url: 'https://cdn.test/2.png' },
      ],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlPath: '$.data[0].url',
          outputUrlsPath: '$.data',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/1.png',
      imageUrls: ['https://cdn.test/1.png', 'https://cdn.test/2.png'],
    })
  })

  it('keeps single-url output compatible when outputUrlsPath has only one image', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [{ url: 'https://cdn.test/only.png' }],
    }), { status: 200 })) as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'draw a cat',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlsPath: '$.data',
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/only.png',
    })
  })

  it('selects edit operation template when operation is edit', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [{ url: 'https://cdn.test/edit.png' }],
    }), { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'edit this cat',
      referenceImages: ['data:image/png;base64,QQ=='],
      operation: 'edit',
      profile: 'openai-compatible',
      template: {
        version: 2,
        mediaType: 'image',
        operations: {
          generate: {
            mode: 'sync',
            create: {
              method: 'POST',
              path: '/images/generations',
              contentType: 'application/json',
              bodyTemplate: {
                model: '{{model}}',
                prompt: '{{prompt}}',
              },
            },
            response: {
              outputUrlPath: '$.data[0].url',
            },
          },
          edit: {
            mode: 'sync',
            create: {
              method: 'POST',
              path: '/images/edits',
              contentType: 'multipart/form-data',
              multipartFileFields: ['image'],
              bodyTemplate: {
                model: '{{model}}',
                prompt: '{{prompt}}',
                image: '{{images}}',
              },
            },
            response: {
              outputUrlPath: '$.data[0].url',
            },
          },
        },
      },
    })

    expect(result).toEqual({
      success: true,
      imageUrl: 'https://cdn.test/edit.png',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://compat.example.com/v1/images/edits',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    )
  })

  it('rejects edit operation when legacy image template only defines generate behavior', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch

    await expect(generateImageViaOpenAICompatTemplate({
      userId: 'user-1',
      providerId: 'openai-compatible:test-provider',
      modelId: 'gpt-image-1',
      modelKey: 'openai-compatible:test-provider::gpt-image-1',
      prompt: 'edit this cat',
      referenceImages: ['data:image/png;base64,QQ=='],
      operation: 'edit',
      profile: 'openai-compatible',
      template: {
        version: 1,
        mediaType: 'image',
        mode: 'sync',
        create: {
          method: 'POST',
          path: '/images/generations',
          contentType: 'application/json',
          bodyTemplate: {
            model: '{{model}}',
            prompt: '{{prompt}}',
          },
        },
        response: {
          outputUrlPath: '$.data[0].url',
        },
      },
    })).rejects.toThrow('OPENAI_COMPAT_IMAGE_TEMPLATE_OPERATION_UNSUPPORTED: edit')
  })
})
