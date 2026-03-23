import type { OpenAICompatMediaTemplate, OpenAICompatMediaOperationTemplate } from '@/lib/openai-compat-media-template'
import { isOpenAICompatImageTemplateV2 } from '@/lib/openai-compat-media-template'
import {
  parseOpenAICompatMediaTemplate,
  type ModelTemplateValidationIssue,
} from './schema'

function hasHttpProtocol(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://')
}

function isRelativePath(path: string): boolean {
  return path.startsWith('/')
}

function validatePath(path: string, field: string): ModelTemplateValidationIssue | null {
  const trimmed = path.trim()
  if (!trimmed) {
    return {
      code: 'MODEL_TEMPLATE_INVALID',
      field,
      message: 'path must be non-empty',
    }
  }

  if (!hasHttpProtocol(trimmed) && !isRelativePath(trimmed)) {
    return {
      code: 'MODEL_TEMPLATE_INVALID',
      field,
      message: 'path must be absolute URL or relative path',
    }
  }
  return null
}

function validateOperationEndpointPaths(
  template: OpenAICompatMediaOperationTemplate,
  fieldPrefix: string,
): ModelTemplateValidationIssue[] {
  const issues: ModelTemplateValidationIssue[] = []
  const withField = (suffix: string) => (fieldPrefix ? `${fieldPrefix}.${suffix}` : suffix)
  const createPathIssue = validatePath(template.create.path, withField('create.path'))
  if (createPathIssue) issues.push(createPathIssue)
  if (template.status) {
    const statusPathIssue = validatePath(template.status.path, withField('status.path'))
    if (statusPathIssue) issues.push(statusPathIssue)
  }
  if (template.content) {
    const contentPathIssue = validatePath(template.content.path, withField('content.path'))
    if (contentPathIssue) issues.push(contentPathIssue)
  }
  return issues
}

function validateEndpointPaths(template: OpenAICompatMediaTemplate): ModelTemplateValidationIssue[] {
  if (isOpenAICompatImageTemplateV2(template)) {
    return [
      ...validateOperationEndpointPaths(template.operations.generate, 'operations.generate'),
      ...(template.operations.edit ? validateOperationEndpointPaths(template.operations.edit, 'operations.edit') : []),
    ]
  }
  return validateOperationEndpointPaths(template, '')
}

export function validateOpenAICompatMediaTemplate(raw: unknown): {
  ok: boolean
  template: OpenAICompatMediaTemplate | null
  issues: ModelTemplateValidationIssue[]
} {
  const parsed = parseOpenAICompatMediaTemplate(raw)
  if (!parsed.template) {
    return { ok: false, template: null, issues: parsed.issues }
  }
  const endpointIssues = validateEndpointPaths(parsed.template)
  if (endpointIssues.length > 0) {
    return {
      ok: false,
      template: null,
      issues: [...parsed.issues, ...endpointIssues],
    }
  }
  return { ok: true, template: parsed.template, issues: [] }
}

