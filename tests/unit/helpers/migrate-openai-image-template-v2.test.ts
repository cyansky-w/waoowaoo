import { describe, expect, it } from 'vitest'

import { migrateOpenAICompatImageTemplatePayload } from '@/lib/migrations/openai-image-template-v2'

describe('migrateOpenAICompatImageTemplatePayload', () => {
  it('upgrades legacy openai-compatible image template to v2 with edit operation', () => {
    const raw = JSON.stringify([
      {
        provider: 'openai-compatible:gateway-1',
        modelId: 'gemini-3.1-flash-image',
        modelKey: 'openai-compatible:gateway-1::gemini-3.1-flash-image',
        type: 'image',
        name: 'Image Model',
        price: 0,
        compatMediaTemplate: {
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
      },
    ])

    const result = migrateOpenAICompatImageTemplatePayload(raw)

    expect(result.status).toBe('ok')
    expect(result.changed).toBe(true)
    expect(result.summary.migratedModels).toBe(1)
    expect(result.summary.upgradedLegacyTemplates).toBe(1)
    expect(result.summary.addedEditOperations).toBe(1)

    const next = JSON.parse(result.nextRaw || '[]') as Array<Record<string, unknown>>
    expect(next).toHaveLength(1)
    expect(next[0]?.compatMediaTemplate).toEqual({
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
            bodyTemplate: {
              model: '{{model}}',
              prompt: '{{prompt}}',
              image: '{{images}}',
            },
            multipartFileFields: ['image'],
          },
          response: {
            outputUrlPath: '$.data[0].url',
          },
        },
      },
    })
  })

  it('adds edit operation to v2 generate-only image template', () => {
    const raw = JSON.stringify([
      {
        provider: 'openai-compatible:gateway-1',
        modelId: 'gemini-3.1-flash-image',
        modelKey: 'openai-compatible:gateway-1::gemini-3.1-flash-image',
        type: 'image',
        name: 'Image Model',
        price: 0,
        compatMediaTemplate: {
          version: 2,
          mediaType: 'image',
          operations: {
            generate: {
              mode: 'sync',
              create: {
                method: 'POST',
                path: '/v1/images/generations',
                contentType: 'application/json',
                bodyTemplate: {
                  model: '{{model}}',
                  prompt: '{{prompt}}',
                  size: '{{size}}',
                },
              },
              response: {
                outputUrlPath: '$.data[0].url',
              },
            },
          },
        },
      },
    ])

    const result = migrateOpenAICompatImageTemplatePayload(raw)
    const next = JSON.parse(result.nextRaw || '[]') as Array<Record<string, unknown>>
    const template = next[0]?.compatMediaTemplate as {
      operations?: { edit?: { create?: { path?: string; bodyTemplate?: Record<string, unknown> } } }
    }

    expect(result.status).toBe('ok')
    expect(result.changed).toBe(true)
    expect(result.summary.addedEditOperations).toBe(1)
    expect(template.operations?.edit?.create?.path).toBe('/v1/images/edits')
    expect(template.operations?.edit?.create?.bodyTemplate).toEqual({
      model: '{{model}}',
      prompt: '{{prompt}}',
      size: '{{size}}',
      image: '{{images}}',
    })
  })

  it('keeps templates that already have edit operation unchanged', () => {
    const raw = JSON.stringify([
      {
        provider: 'openai-compatible:gateway-1',
        modelId: 'gemini-3.1-flash-image',
        modelKey: 'openai-compatible:gateway-1::gemini-3.1-flash-image',
        type: 'image',
        name: 'Image Model',
        price: 0,
        compatMediaTemplate: {
          version: 2,
          mediaType: 'image',
          operations: {
            generate: {
              mode: 'sync',
              create: { method: 'POST', path: '/images/generations' },
              response: { outputUrlPath: '$.data[0].url' },
            },
            edit: {
              mode: 'sync',
              create: { method: 'POST', path: '/images/edits' },
              response: { outputUrlPath: '$.data[0].url' },
            },
          },
        },
      },
    ])

    const result = migrateOpenAICompatImageTemplatePayload(raw)

    expect(result.status).toBe('ok')
    expect(result.changed).toBe(false)
    expect(result.summary.migratedModels).toBe(0)
  })
})
