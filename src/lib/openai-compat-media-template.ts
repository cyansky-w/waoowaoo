export type TemplateHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type TemplateContentType =
  | 'application/json'
  | 'multipart/form-data'
  | 'application/x-www-form-urlencoded'

export type TemplateHeaderMap = Record<string, string>

export type TemplateBodyValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: TemplateBodyValue }
  | TemplateBodyValue[]

export interface TemplateEndpoint {
  method: TemplateHttpMethod
  path: string
  contentType?: TemplateContentType
  headers?: TemplateHeaderMap
  bodyTemplate?: TemplateBodyValue
  multipartFileFields?: string[]
}

export interface TemplateResponseMap {
  taskIdPath?: string
  statusPath?: string
  outputUrlPath?: string
  outputUrlsPath?: string
  errorPath?: string
}

export interface TemplatePollingConfig {
  intervalMs: number
  timeoutMs: number
  doneStates: string[]
  failStates: string[]
}

export interface OpenAICompatMediaOperationTemplate {
  mode: 'sync' | 'async'
  create: TemplateEndpoint
  status?: TemplateEndpoint
  content?: TemplateEndpoint
  response: TemplateResponseMap
  polling?: TemplatePollingConfig
}

export interface OpenAICompatLegacyMediaTemplate extends OpenAICompatMediaOperationTemplate {
  version: 1
  mediaType: 'image' | 'video'
}

export interface OpenAICompatImageTemplateV2 {
  version: 2
  mediaType: 'image'
  operations: {
    generate: OpenAICompatMediaOperationTemplate
    edit?: OpenAICompatMediaOperationTemplate
  }
}

export type OpenAICompatMediaTemplate =
  | OpenAICompatLegacyMediaTemplate
  | OpenAICompatImageTemplateV2

export type OpenAICompatMediaTemplateSource = 'ai' | 'manual'

export type OpenAICompatImageOperation = 'generate' | 'edit'

export function isOpenAICompatImageTemplateV2(
  template: OpenAICompatMediaTemplate,
): template is OpenAICompatImageTemplateV2 {
  return template.version === 2 && template.mediaType === 'image'
}

export function resolveOpenAICompatTemplateOperation(
  template: OpenAICompatMediaTemplate,
  operation: OpenAICompatImageOperation = 'generate',
): OpenAICompatMediaOperationTemplate | null {
  if (isOpenAICompatImageTemplateV2(template)) {
    return operation === 'edit'
      ? template.operations.edit || null
      : template.operations.generate
  }

  if (template.mediaType === 'image' && operation === 'edit') {
    return null
  }

  return template
}

export const TEMPLATE_PLACEHOLDER_ALLOWLIST = new Set([
  'model',
  'prompt',
  'image',
  'images',
  'aspect_ratio',
  'duration',
  'resolution',
  'size',
  'task_id',
])
