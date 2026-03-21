import { LOG_CONFIG } from './config'
import { getLogContext } from './context'
import { createScopedLogger, type ScopedLogger } from './core'
import { redactValue } from './redact'

type ExternalApiLogger = Pick<ScopedLogger, 'info' | 'warn' | 'error'>

type CreateExternalApiFetchOptions = {
  logger?: ExternalApiLogger
  writeAuditLine?: (line: string) => Promise<void> | void
  now?: () => string
}

type FetchInstallState = typeof globalThis & {
  __waoowaooExternalApiFetchInstalled?: boolean
}

type NodeModules = {
  fs: typeof import('node:fs')
  path: typeof import('node:path')
  cwd: string
}

const externalApiLogger = createScopedLogger({
  module: 'external.api.client',
  action: 'external.api.request',
})

const DEFAULT_INTERNAL_ORIGINS = ['http://localhost', 'http://127.0.0.1', 'http://[::1]']
const EXTRA_SENSITIVE_QUERY_KEYS = ['key', 'sig', 'signature', 'x-amz-signature']
const FILE_FIELD_PATTERN = /(?:^|_)(?:b64|base64|file|image|audio|video|blob|binary|bytes)(?:$|_)/
const EXTERNAL_API_AUDIT_LOG_MAX_BYTES = 20 * 1024 * 1024 // 20 MB

let nodeModulesCache: NodeModules | null | 'pending' | undefined

function nowChinaISOString(): string {
  const now = new Date()
  const offsetMs = 8 * 60 * 60 * 1000
  const cstTime = new Date(now.getTime() + offsetMs)
  return cstTime.toISOString().replace('Z', '+08:00')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isEdgeOrBrowser(): boolean {
  if (typeof window !== 'undefined') return true
  const g = globalThis as { EdgeRuntime?: unknown }
  return typeof g.EdgeRuntime === 'string'
}

async function getNodeModules(): Promise<NodeModules | null> {
  if (nodeModulesCache === null) return null
  if (nodeModulesCache && nodeModulesCache !== 'pending') return nodeModulesCache
  if (isEdgeOrBrowser()) {
    nodeModulesCache = null
    return null
  }

  if (nodeModulesCache === 'pending') {
    await new Promise((resolve) => setTimeout(resolve, 0))
    return getNodeModules()
  }
  nodeModulesCache = 'pending'

  try {
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>
    const [fs, path] = await Promise.all([
      dynamicImport('node:fs'),
      dynamicImport('node:path'),
    ]) as [typeof import('node:fs'), typeof import('node:path')]
    const getCwd = new Function('return process.cwd()') as () => string
    const resolved: NodeModules = { fs, path, cwd: getCwd() }
    nodeModulesCache = resolved
    return resolved
  } catch {
    nodeModulesCache = null
    return null
  }
}

function getInternalOrigins(): Set<string> {
  const origins = new Set<string>()
  for (const value of DEFAULT_INTERNAL_ORIGINS) {
    origins.add(value)
  }

  const candidates = [
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      origins.add(new URL(candidate).origin)
    } catch {
      continue
    }
  }

  return origins
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function redactSensitiveQueryParams(url: URL): URL {
  const redacted = new URL(url.toString())
  const sensitiveKeys = new Set([
    ...LOG_CONFIG.redactKeys,
    ...EXTRA_SENSITIVE_QUERY_KEYS,
  ].map((key) => key.toLowerCase()))

  for (const key of sensitiveKeys) {
    if (!redacted.searchParams.has(key)) continue
    redacted.searchParams.set(key, '[REDACTED]')
  }

  for (const key of Array.from(redacted.searchParams.keys())) {
    const lower = key.toLowerCase()
    if (sensitiveKeys.has(lower)) {
      redacted.searchParams.set(key, '[REDACTED]')
    }
  }

  return redacted
}

export function isThirdPartyRequestUrl(input: RequestInfo | URL): boolean {
  const rawUrl = toUrlString(input)
  if (rawUrl.startsWith('/')) return false

  let parsed: URL
  try {
    parsed = new URL(rawUrl, 'http://localhost')
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return !getInternalOrigins().has(parsed.origin)
}

function toLoggedUrl(input: RequestInfo | URL): string {
  const rawUrl = toUrlString(input)
  try {
    const parsed = new URL(rawUrl, 'http://localhost')
    return redactSensitiveQueryParams(parsed).toString()
  } catch {
    return rawUrl
  }
}

function toMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (typeof init?.method === 'string' && init.method.trim()) {
    return init.method.trim().toUpperCase()
  }
  if (typeof Request !== 'undefined' && input instanceof Request && typeof input.method === 'string' && input.method.trim()) {
    return input.method.trim().toUpperCase()
  }
  return 'GET'
}

function toResponseHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  return headers
}

function looksLikeBase64(value: string): boolean {
  if (value.length < 512) return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.includes(' ') || trimmed.includes('\n')) return false
  return /^[A-Za-z0-9+/=_-]+$/.test(trimmed)
}

function buildFilePlaceholder(label: string, details: string[] = []): string {
  const suffix = details.length > 0 ? ` ${details.join(' ')}` : ''
  return `[${label}${suffix}]`
}

function sanitizeStringField(key: string, value: string): string {
  if (value.startsWith('data:')) {
    return buildFilePlaceholder('FILE_CONTENT', [`field=${key}`, 'encoding=data-url'])
  }
  if (FILE_FIELD_PATTERN.test(key) && looksLikeBase64(value)) {
    return buildFilePlaceholder('FILE_CONTENT', [`field=${key}`, 'encoding=base64', `length=${value.length}`])
  }
  return value
}

export function sanitizeExternalApiPayload(value: unknown, currentKey = ''): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    return sanitizeStringField(currentKey, value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return buildFilePlaceholder('FILE_RECEIVED', [`field=${currentKey || 'buffer'}`, `size=${value.byteLength} bytes`])
  }
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return buildFilePlaceholder('FILE_RECEIVED', [`field=${currentKey || 'arrayBuffer'}`, `size=${value.byteLength} bytes`])
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
    return buildFilePlaceholder('FILE_RECEIVED', [`field=${currentKey || 'typedArray'}`, `size=${value.byteLength} bytes`])
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return buildFilePlaceholder('FILE_RECEIVED', [
      `field=${currentKey || 'blob'}`,
      value.type ? `type=${value.type}` : 'type=application/octet-stream',
      `size=${value.size} bytes`,
    ])
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeExternalApiPayload(item, currentKey))
  }
  if (!isPlainObject(value)) {
    return String(value)
  }

  const output: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    output[key] = sanitizeExternalApiPayload(nested, key)
  }
  return output
}

function buildBinaryResponsePlaceholder(response: Response): string {
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const contentLength = response.headers.get('content-length')
  const details = [`contentType=${contentType}`]
  if (contentLength && /^\d+$/.test(contentLength.trim())) {
    details.push(`size=${contentLength.trim()} bytes`)
  }
  return buildFilePlaceholder('FILE_RECEIVED', details)
}

async function readResponseBodySnapshot(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null

  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    const parsed = await response.json()
    return sanitizeExternalApiPayload(parsed)
  }

  if (
    contentType.startsWith('text/')
    || contentType.includes('xml')
    || contentType.includes('html')
    || contentType.includes('event-stream')
  ) {
    return await response.text()
  }

  return buildBinaryResponsePlaceholder(response)
}

async function writeAuditEntry(
  writeAuditLine: NonNullable<CreateExternalApiFetchOptions['writeAuditLine']>,
  entry: Record<string, unknown>,
) {
  const safeEntry = redactValue(entry, [...LOG_CONFIG.redactKeys]) as Record<string, unknown>
  await writeAuditLine(JSON.stringify(safeEntry))
}

async function writeExternalApiAuditLine(line: string): Promise<void> {
  if (isEdgeOrBrowser()) return
  const modules = await getNodeModules()
  if (!modules) return

  const filePath = modules.path.join(modules.cwd, 'logs', 'external-api-audit.log')
  try {
    modules.fs.mkdirSync(modules.path.dirname(filePath), { recursive: true })

    try {
      const stat = modules.fs.statSync(filePath)
      if (stat.size > EXTERNAL_API_AUDIT_LOG_MAX_BYTES) {
        const content = modules.fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        const half = Math.floor(lines.length / 2)
        modules.fs.writeFileSync(filePath, lines.slice(half).join('\n'))
      }
    } catch {
      // File may not exist yet, that's fine
    }

    modules.fs.appendFileSync(filePath, line + '\n')
  } catch (error) {
    console.error('[external-api] Failed to write external api audit log', error)
  }
}

async function captureResponseAudit(
  response: Response,
  baseEntry: Record<string, unknown>,
  writeAuditLine: NonNullable<CreateExternalApiFetchOptions['writeAuditLine']>,
) {
  try {
    const body = await readResponseBodySnapshot(response)
    await writeAuditEntry(writeAuditLine, {
      ...baseEntry,
      response: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: toResponseHeaders(response),
        body,
      },
    })
  } catch (error) {
    await writeAuditEntry(writeAuditLine, {
      ...baseEntry,
      response: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: toResponseHeaders(response),
      },
      auditError: error instanceof Error ? error.message : String(error),
    })
  }
}

export function createExternalApiFetch(
  baseFetch: typeof fetch,
  options: CreateExternalApiFetchOptions = {},
): typeof fetch {
  const logger = options.logger || externalApiLogger
  const writeAuditLine = options.writeAuditLine || writeExternalApiAuditLine
  const now = options.now || nowChinaISOString

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isThirdPartyRequestUrl(input)) {
      return await baseFetch.call(globalThis, input, init)
    }

    const url = toLoggedUrl(input)
    const method = toMethod(input, init)
    const startedAt = Date.now()
    const context = getLogContext()
    const provider = (() => {
      try {
        return new URL(url).hostname
      } catch {
        return undefined
      }
    })()

    const baseAuditEntry = {
      ts: now(),
      request: {
        method,
        url,
      },
      context: {
        requestId: context.requestId || null,
        taskId: context.taskId || null,
        projectId: context.projectId || null,
        userId: context.userId || null,
      },
    }

    logger.info({
      audit: true,
      action: 'external.api.request',
      message: 'calling external api',
      provider,
      requestId: context.requestId,
      taskId: context.taskId,
      projectId: context.projectId,
      userId: context.userId,
      details: {
        method,
        url,
      },
    })

    try {
      const response = await baseFetch.call(globalThis, input, init)
      const durationMs = Date.now() - startedAt
      const contentType = response.headers.get('content-type') || null

      logger.info({
        audit: true,
        action: 'external.api.response',
        message: 'external api responded',
        provider,
        requestId: context.requestId,
        taskId: context.taskId,
        projectId: context.projectId,
        userId: context.userId,
        durationMs,
        details: {
          method,
          url,
          status: response.status,
          ok: response.ok,
          contentType,
        },
      })

      void captureResponseAudit(response.clone(), {
        ...baseAuditEntry,
        durationMs,
      }, writeAuditLine)

      return response
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const errorMessage = error instanceof Error ? error.message : String(error)

      logger.error({
        audit: true,
        action: 'external.api.response_failed',
        message: 'external api request failed',
        provider,
        requestId: context.requestId,
        taskId: context.taskId,
        projectId: context.projectId,
        userId: context.userId,
        durationMs,
        details: {
          method,
          url,
          error: errorMessage,
        },
      })

      void writeAuditEntry(writeAuditLine, {
        ...baseAuditEntry,
        durationMs,
        error: errorMessage,
      })

      throw error
    }
  }) as typeof fetch
}

export function installExternalApiFetchLogging(): void {
  if (typeof window !== 'undefined') return
  const runtime = globalThis as FetchInstallState
  if (runtime.__waoowaooExternalApiFetchInstalled) return
  if (typeof runtime.fetch !== 'function') return

  runtime.fetch = createExternalApiFetch(runtime.fetch)
  runtime.__waoowaooExternalApiFetchInstalled = true
}
