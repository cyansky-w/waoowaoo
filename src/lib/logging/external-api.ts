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

function toHeadersRecord(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {}
  headers.forEach((value, key) => {
    output[key] = value
  })
  return output
}

function toRequestHeaders(input: RequestInfo | URL, init?: RequestInit): Record<string, string> {
  const headers = new Headers()

  if (typeof Request !== 'undefined' && input instanceof Request) {
    input.headers.forEach((value, key) => {
      headers.set(key, value)
    })
  }

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value)
    })
  }

  return toHeadersRecord(headers)
}

function hasOwnKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0
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

function buildOutgoingFilePlaceholder(field: string, details: string[] = []): string {
  return buildFilePlaceholder('FILE_CONTENT', [`field=${field}`, ...details])
}

function sanitizeStringField(key: string, value: string): string {
  if (value.startsWith('data:')) {
    return buildFilePlaceholder('FILE_CONTENT', [`field=${key}`, 'encoding=data-url'])
  }
  if (looksLikeBase64(value)) {
    if (FILE_FIELD_PATTERN.test(key)) {
      return buildFilePlaceholder('FILE_CONTENT', [`field=${key}`, 'encoding=base64', `length=${value.length}`])
    }
    if (!key || key === 'body') {
      return buildFilePlaceholder('FILE_CONTENT', [`field=${key || 'body'}`, 'encoding=base64', `length=${value.length}`])
    }
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
    return buildOutgoingFilePlaceholder(currentKey || 'buffer', [`size=${value.byteLength} bytes`])
  }
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return buildOutgoingFilePlaceholder(currentKey || 'arrayBuffer', [`size=${value.byteLength} bytes`])
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
    return buildOutgoingFilePlaceholder(currentKey || 'typedArray', [`size=${value.byteLength} bytes`])
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return buildOutgoingFilePlaceholder(currentKey || 'blob', [
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

function appendSnapshotField(target: Record<string, unknown>, key: string, value: unknown) {
  const existing = target[key]
  if (existing === undefined) {
    target[key] = value
    return
  }
  if (Array.isArray(existing)) {
    existing.push(value)
    return
  }
  target[key] = [existing, value]
}

function serializeSearchParams(params: URLSearchParams): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of params.entries()) {
    appendSnapshotField(output, key, sanitizeStringField(key, value))
  }
  return output
}

function serializeFormData(formData: FormData): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      appendSnapshotField(output, key, sanitizeStringField(key, value))
      continue
    }

    const details: string[] = []
    if (typeof File !== 'undefined' && value instanceof File && value.name) {
      details.push(`name=${value.name}`)
    }
    details.push(value.type ? `type=${value.type}` : 'type=application/octet-stream')
    details.push(`size=${value.size} bytes`)
    appendSnapshotField(output, key, buildOutgoingFilePlaceholder(key, details))
  }
  return output
}

function isJsonContentType(contentType: string): boolean {
  return contentType.includes('application/json') || contentType.includes('+json')
}

function isTextLikeContentType(contentType: string): boolean {
  return contentType.startsWith('text/')
    || contentType.includes('xml')
    || contentType.includes('html')
    || contentType.includes('event-stream')
}

function isReadableStreamLike(value: unknown): boolean {
  return !!value
    && typeof value === 'object'
    && (
      typeof (value as { getReader?: unknown }).getReader === 'function'
      || typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
    )
}

function buildRequestBinaryPlaceholder(field: string, contentType?: string | null, size?: number | null): string {
  const details: string[] = []
  if (contentType) details.push(`type=${contentType}`)
  if (typeof size === 'number') details.push(`size=${size} bytes`)
  return buildOutgoingFilePlaceholder(field, details)
}

function parseTextRequestBody(text: string, contentType: string): unknown {
  if (!text) return text
  if (isJsonContentType(contentType)) {
    try {
      return sanitizeExternalApiPayload(JSON.parse(text), 'body')
    } catch {
      return sanitizeStringField('body', text)
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return serializeSearchParams(new URLSearchParams(text))
  }
  return sanitizeStringField('body', text)
}

async function readBodyInitSnapshot(body: BodyInit, headers: Record<string, string>): Promise<unknown> {
  const contentType = (headers['content-type'] || '').toLowerCase()

  if (typeof body === 'string') {
    return parseTextRequestBody(body, contentType)
  }
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return serializeSearchParams(body)
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return serializeFormData(body)
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return buildRequestBinaryPlaceholder('body', body.type || contentType || null, body.size)
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    return buildRequestBinaryPlaceholder('body', contentType || 'application/octet-stream', body.byteLength)
  }
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return buildRequestBinaryPlaceholder('body', contentType || 'application/octet-stream', body.byteLength)
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body)) {
    return buildRequestBinaryPlaceholder('body', contentType || 'application/octet-stream', body.byteLength)
  }
  if (isReadableStreamLike(body)) {
    return buildRequestBinaryPlaceholder('body', contentType || 'application/octet-stream')
  }

  return sanitizeExternalApiPayload(body, 'body')
}

async function readRequestInputSnapshot(request: Request): Promise<unknown> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  if (!request.body) return undefined

  if (isJsonContentType(contentType) || isTextLikeContentType(contentType) || contentType.includes('application/x-www-form-urlencoded')) {
    return parseTextRequestBody(await request.text(), contentType)
  }

  if (contentType.includes('multipart/form-data')) {
    try {
      return serializeFormData(await request.formData())
    } catch {
      return buildRequestBinaryPlaceholder('body', contentType || 'multipart/form-data')
    }
  }

  const arrayBuffer = await request.arrayBuffer()
  return buildRequestBinaryPlaceholder('body', contentType || 'application/octet-stream', arrayBuffer.byteLength)
}

async function readRequestSnapshot(input: RequestInfo | URL, init?: RequestInit): Promise<{ headers?: Record<string, string>; body?: unknown }> {
  const headers = toRequestHeaders(input, init)
  const snapshot: { headers?: Record<string, string>; body?: unknown } = {}

  if (hasOwnKeys(headers as Record<string, unknown>)) {
    snapshot.headers = headers
  }

  if (init?.body !== undefined && init.body !== null) {
    snapshot.body = await readBodyInitSnapshot(init.body, headers)
    return snapshot
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    snapshot.body = await readRequestInputSnapshot(input.clone())
  }

  return snapshot
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
  snapshot?: { body?: unknown; auditError?: string },
) {
  const body = snapshot?.body
  const auditError = snapshot?.auditError
  await writeAuditEntry(writeAuditLine, {
    ...baseEntry,
    response: {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: toResponseHeaders(response),
      ...(body !== undefined ? { body } : {}),
    },
    ...(auditError ? { auditError } : {}),
  })
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
    let requestSnapshot: { headers?: Record<string, string>; body?: unknown } = {}
    let requestSnapshotError: string | null = null
    try {
      requestSnapshot = await readRequestSnapshot(input, init)
    } catch (error) {
      requestSnapshotError = error instanceof Error ? error.message : String(error)
    }

    const requestAuditEntry: Record<string, unknown> = {
      method,
      url,
    }
    if (requestSnapshot.headers && hasOwnKeys(requestSnapshot.headers as Record<string, unknown>)) {
      requestAuditEntry.headers = requestSnapshot.headers
    }
    if (requestSnapshot.body !== undefined) {
      requestAuditEntry.body = requestSnapshot.body
    }
    if (requestSnapshotError) {
      requestAuditEntry.auditError = requestSnapshotError
    }

    const baseAuditEntry = {
      ts: now(),
      request: requestAuditEntry,
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
        ...requestAuditEntry,
      },
    })

    try {
      const response = await baseFetch.call(globalThis, input, init)
      const durationMs = Date.now() - startedAt
      const contentType = response.headers.get('content-type') || null
      let responseBodySnapshot: unknown
      let responseAuditError: string | null = null
      try {
        responseBodySnapshot = await readResponseBodySnapshot(response.clone())
      } catch (error) {
        responseAuditError = error instanceof Error ? error.message : String(error)
      }

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
          ...(responseBodySnapshot !== undefined ? { body: responseBodySnapshot } : {}),
          ...(responseAuditError ? { auditError: responseAuditError } : {}),
        },
      })

      void captureResponseAudit(response.clone(), {
        ...baseAuditEntry,
        durationMs,
      }, writeAuditLine, {
        ...(responseBodySnapshot !== undefined ? { body: responseBodySnapshot } : {}),
        ...(responseAuditError ? { auditError: responseAuditError } : {}),
      })

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
