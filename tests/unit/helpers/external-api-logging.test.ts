import { describe, expect, it, vi } from 'vitest'

async function waitForAsyncLogging() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('external api logging', () => {
  it('still prints external request url to console when LOG_LEVEL=ERROR', async () => {
    const previousLogLevel = process.env.LOG_LEVEL
    const previousUnifiedEnabled = process.env.LOG_UNIFIED_ENABLED
    const previousAuditEnabled = process.env.LOG_AUDIT_ENABLED
    process.env.LOG_LEVEL = 'ERROR'
    process.env.LOG_UNIFIED_ENABLED = 'true'
    process.env.LOG_AUDIT_ENABLED = 'true'
    vi.resetModules()

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }))

    try {
      const { createExternalApiFetch } = await import('@/lib/logging/external-api')
      const wrappedFetch = createExternalApiFetch(fetchMock, {
        writeAuditLine: vi.fn(),
      })

      await wrappedFetch('https://api.example.com/v1/tasks/123')
      await waitForAsyncLogging()

      expect(consoleLogSpy).toHaveBeenCalled()
      const payloads = consoleLogSpy.mock.calls.map((call) => String(call[0]))
      expect(payloads.some((payload) => payload.includes('https://api.example.com/v1/tasks/123'))).toBe(true)
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    } finally {
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL
      } else {
        process.env.LOG_LEVEL = previousLogLevel
      }
      if (previousUnifiedEnabled === undefined) {
        delete process.env.LOG_UNIFIED_ENABLED
      } else {
        process.env.LOG_UNIFIED_ENABLED = previousUnifiedEnabled
      }
      if (previousAuditEnabled === undefined) {
        delete process.env.LOG_AUDIT_ENABLED
      } else {
        process.env.LOG_AUDIT_ENABLED = previousAuditEnabled
      }
      vi.restoreAllMocks()
    }
  })

  it('skips audit logging for internal requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const info = vi.fn()
    const warn = vi.fn()
    const error = vi.fn()
    const writeAuditLine = vi.fn()

    const { createExternalApiFetch } = await import('@/lib/logging/external-api')
    const wrappedFetch = createExternalApiFetch(fetchMock, {
      logger: { info, warn, error },
      writeAuditLine,
    })

    await wrappedFetch('/api/tasks?status=queued')
    await waitForAsyncLogging()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(info).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(writeAuditLine).not.toHaveBeenCalled()
  })

  it('logs full external url and writes sanitized json response to audit log', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: 'task_123',
      images: [
        {
          b64_json: 'A'.repeat(12_000),
          url: 'https://cdn.example.com/result.png',
        },
      ],
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }))
    const info = vi.fn()
    const warn = vi.fn()
    const error = vi.fn()
    const writeAuditLine = vi.fn()

    const { createExternalApiFetch } = await import('@/lib/logging/external-api')
    const wrappedFetch = createExternalApiFetch(fetchMock, {
      logger: { info, warn, error },
      writeAuditLine,
      now: () => '2026-03-22T00:00:00.000+08:00',
    })

    await wrappedFetch('https://api.example.com/v1/images/generate?job=1')
    await waitForAsyncLogging()

    expect(info).toHaveBeenCalledWith(expect.objectContaining({
      action: 'external.api.request',
      details: expect.objectContaining({
        url: 'https://api.example.com/v1/images/generate?job=1',
      }),
    }))
    expect(info).toHaveBeenCalledWith(expect.objectContaining({
      action: 'external.api.response',
      details: expect.objectContaining({
        status: 200,
        body: expect.objectContaining({
          id: 'task_123',
          images: [
            expect.objectContaining({
              b64_json: expect.stringContaining('[FILE_CONTENT'),
              url: 'https://cdn.example.com/result.png',
            }),
          ],
        }),
      }),
    }))
    expect(writeAuditLine).toHaveBeenCalledTimes(1)

    const entry = JSON.parse(String(writeAuditLine.mock.calls[0]?.[0])) as {
      request: { url: string; method: string }
      response: { status: number; body: { id: string; images: Array<{ b64_json: string; url: string }> } }
    }
    expect(entry.request.url).toBe('https://api.example.com/v1/images/generate?job=1')
    expect(entry.request.method).toBe('GET')
    expect(entry.response.status).toBe(200)
    expect(entry.response.body.id).toBe('task_123')
    expect(entry.response.body.images[0]?.b64_json).toContain('[FILE_CONTENT')
    expect(entry.response.body.images[0]?.url).toBe('https://cdn.example.com/result.png')
  })

  it('writes sanitized request payloads to the audit log', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: 'task_456',
      ok: true,
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }))
    const info = vi.fn()
    const warn = vi.fn()
    const error = vi.fn()
    const writeAuditLine = vi.fn()

    const { createExternalApiFetch } = await import('@/lib/logging/external-api')
    const wrappedFetch = createExternalApiFetch(fetchMock, {
      logger: { info, warn, error },
      writeAuditLine,
      now: () => '2026-03-22T00:00:00.000+08:00',
    })

    await wrappedFetch('https://api.example.com/v1/images/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'draw a hero portrait',
        reference_image_b64: 'A'.repeat(12_000),
        imageDataUrl: 'data:image/png;base64,AAAA',
      }),
    })
    await waitForAsyncLogging()

    expect(writeAuditLine).toHaveBeenCalledTimes(1)
    const entry = JSON.parse(String(writeAuditLine.mock.calls[0]?.[0])) as {
      request: {
        method: string
        url: string
        headers: Record<string, string>
        body: {
          prompt: string
          reference_image_b64: string
          imageDataUrl: string
        }
      }
    }

    expect(entry.request.method).toBe('POST')
    expect(entry.request.url).toBe('https://api.example.com/v1/images/generate')
    expect(entry.request.headers['content-type']).toBe('application/json')
    expect(entry.request.body.prompt).toBe('draw a hero portrait')
    expect(entry.request.body.reference_image_b64).toContain('[FILE_CONTENT')
    expect(entry.request.body.imageDataUrl).toContain('[FILE_CONTENT')
  })

  it('replaces binary response bodies with a compact received-file placeholder', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': '4',
      },
    }))
    const info = vi.fn()
    const warn = vi.fn()
    const error = vi.fn()
    const writeAuditLine = vi.fn()

    const { createExternalApiFetch } = await import('@/lib/logging/external-api')
    const wrappedFetch = createExternalApiFetch(fetchMock, {
      logger: { info, warn, error },
      writeAuditLine,
      now: () => '2026-03-22T00:00:00.000+08:00',
    })

    await wrappedFetch('https://files.example.com/assets/output.png')
    await waitForAsyncLogging()

    expect(writeAuditLine).toHaveBeenCalledTimes(1)
    const entry = JSON.parse(String(writeAuditLine.mock.calls[0]?.[0])) as {
      response: { body: string }
    }
    expect(entry.response.body).toContain('[FILE_RECEIVED')
    expect(entry.response.body).toContain('image/png')
    expect(entry.response.body).toContain('4 bytes')
  })
})
