import type {
  OpenAICompatImageTemplateV2,
  OpenAICompatLegacyMediaTemplate,
  OpenAICompatMediaOperationTemplate,
  TemplateBodyValue,
} from '@/lib/openai-compat-media-template'
import { isOpenAICompatImageTemplateV2 } from '@/lib/openai-compat-media-template'
import { validateOpenAICompatMediaTemplate } from '@/lib/user-api/model-template/validator'

export type OpenAIImageTemplateMigrationSummary = {
  modelsScanned: number
  migratedModels: number
  upgradedLegacyTemplates: number
  addedEditOperations: number
  initializedMissingTemplates: number
  skippedInvalidTemplates: number
  invalidPayload: boolean
}

type PayloadMigrationResult = {
  status: 'ok' | 'invalid'
  changed: boolean
  nextRaw: string | null | undefined
  summary: OpenAIImageTemplateMigrationSummary
}

type ModelMigrationResult = {
  changed: boolean
  next: unknown
  summary: Omit<OpenAIImageTemplateMigrationSummary, 'invalidPayload'>
}

function zeroSummary(): OpenAIImageTemplateMigrationSummary {
  return {
    modelsScanned: 0,
    migratedModels: 0,
    upgradedLegacyTemplates: 0,
    addedEditOperations: 0,
    initializedMissingTemplates: 0,
    skippedInvalidTemplates: 0,
    invalidPayload: false,
  }
}

function addSummary(
  left: Omit<OpenAIImageTemplateMigrationSummary, 'invalidPayload'>,
  right: Omit<OpenAIImageTemplateMigrationSummary, 'invalidPayload'>,
): Omit<OpenAIImageTemplateMigrationSummary, 'invalidPayload'> {
  return {
    modelsScanned: left.modelsScanned + right.modelsScanned,
    migratedModels: left.migratedModels + right.migratedModels,
    upgradedLegacyTemplates: left.upgradedLegacyTemplates + right.upgradedLegacyTemplates,
    addedEditOperations: left.addedEditOperations + right.addedEditOperations,
    initializedMissingTemplates: left.initializedMissingTemplates + right.initializedMissingTemplates,
    skippedInvalidTemplates: left.skippedInvalidTemplates + right.skippedInvalidTemplates,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getProviderKey(providerId: string): string {
  const index = providerId.indexOf(':')
  return index === -1 ? providerId : providerId.slice(0, index)
}

function cloneBodyValue(value: TemplateBodyValue): TemplateBodyValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneBodyValue(item))
  }
  if (isRecord(value)) {
    const cloned: Record<string, TemplateBodyValue> = {}
    for (const [key, nested] of Object.entries(value)) {
      cloned[key] = cloneBodyValue(nested as TemplateBodyValue)
    }
    return cloned
  }
  return value
}

function deriveEditPath(generatePath: string): string {
  if (generatePath.includes('/images/generations')) {
    return generatePath.replace('/images/generations', '/images/edits')
  }
  return '/images/edits'
}

function toEditBodyTemplate(generate: OpenAICompatMediaOperationTemplate): Record<string, TemplateBodyValue> {
  const body = generate.create.bodyTemplate
  const base = isRecord(body)
    ? cloneBodyValue(body as TemplateBodyValue) as Record<string, TemplateBodyValue>
    : {
      model: '{{model}}',
      prompt: '{{prompt}}',
    }

  return {
    ...base,
    image: '{{images}}',
  }
}

function buildDefaultGenerateOperation(): OpenAICompatMediaOperationTemplate {
  return {
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
      errorPath: '$.error.message',
    },
  }
}

function buildEditOperation(generate: OpenAICompatMediaOperationTemplate): OpenAICompatMediaOperationTemplate {
  return {
    mode: generate.mode,
    create: {
      method: 'POST',
      path: deriveEditPath(generate.create.path),
      contentType: 'multipart/form-data',
      ...(generate.create.headers ? { headers: generate.create.headers } : {}),
      bodyTemplate: toEditBodyTemplate(generate),
      multipartFileFields: ['image'],
    },
    ...(generate.status ? { status: generate.status } : {}),
    ...(generate.content ? { content: generate.content } : {}),
    response: generate.response,
    ...(generate.polling ? { polling: generate.polling } : {}),
  }
}

function toOperationTemplate(
  template: OpenAICompatLegacyMediaTemplate | OpenAICompatMediaOperationTemplate,
): OpenAICompatMediaOperationTemplate {
  return {
    mode: template.mode,
    create: template.create,
    ...(template.status ? { status: template.status } : {}),
    ...(template.content ? { content: template.content } : {}),
    response: template.response,
    ...(template.polling ? { polling: template.polling } : {}),
  }
}

function migrateTemplate(rawTemplate: unknown): {
  changed: boolean
  nextTemplate: OpenAICompatImageTemplateV2
  summary: Omit<OpenAIImageTemplateMigrationSummary, 'invalidPayload'>
} | {
  changed: boolean
  nextTemplate: unknown
  summary: Omit<OpenAIImageTemplateMigrationSummary, 'invalidPayload'>
  skipped: true
} {
  const base = {
    modelsScanned: 0,
    migratedModels: 0,
    upgradedLegacyTemplates: 0,
    addedEditOperations: 0,
    initializedMissingTemplates: 0,
    skippedInvalidTemplates: 0,
  }

  if (rawTemplate === undefined || rawTemplate === null) {
    const generate = buildDefaultGenerateOperation()
    return {
      changed: true,
      nextTemplate: {
        version: 2,
        mediaType: 'image',
        operations: {
          generate,
          edit: buildEditOperation(generate),
        },
      },
      summary: {
        ...base,
        migratedModels: 1,
        addedEditOperations: 1,
        initializedMissingTemplates: 1,
      },
    }
  }

  const validated = validateOpenAICompatMediaTemplate(rawTemplate)
  if (!validated.ok || !validated.template || validated.template.mediaType !== 'image') {
    return {
      changed: false,
      nextTemplate: rawTemplate,
      summary: {
        ...base,
        skippedInvalidTemplates: 1,
      },
      skipped: true,
    }
  }

  if (!isOpenAICompatImageTemplateV2(validated.template)) {
    const generate = toOperationTemplate(validated.template as OpenAICompatLegacyMediaTemplate)
    return {
      changed: true,
      nextTemplate: {
        version: 2,
        mediaType: 'image',
        operations: {
          generate,
          edit: buildEditOperation(generate),
        },
      },
      summary: {
        ...base,
        migratedModels: 1,
        upgradedLegacyTemplates: 1,
        addedEditOperations: 1,
      },
    }
  }

  if (validated.template.operations.edit) {
    return {
      changed: false,
      nextTemplate: validated.template,
      summary: base,
    }
  }

  return {
    changed: true,
    nextTemplate: {
      ...validated.template,
      operations: {
        ...validated.template.operations,
        edit: buildEditOperation(validated.template.operations.generate),
      },
    },
    summary: {
      ...base,
      migratedModels: 1,
      addedEditOperations: 1,
    },
  }
}

function migrateModelEntry(rawModel: unknown): ModelMigrationResult {
  const base = {
    modelsScanned: 0,
    migratedModels: 0,
    upgradedLegacyTemplates: 0,
    addedEditOperations: 0,
    initializedMissingTemplates: 0,
    skippedInvalidTemplates: 0,
  }

  if (!isRecord(rawModel)) {
    return { changed: false, next: rawModel, summary: base }
  }

  const provider = readTrimmedString(rawModel.provider)
  const type = readTrimmedString(rawModel.type)
  if (getProviderKey(provider) !== 'openai-compatible' || type !== 'image') {
    return { changed: false, next: rawModel, summary: base }
  }

  const migratedTemplate = migrateTemplate(rawModel.compatMediaTemplate)
  const summary = {
    ...migratedTemplate.summary,
    modelsScanned: 1,
  }
  if ('skipped' in migratedTemplate) {
    return {
      changed: false,
      next: rawModel,
      summary,
    }
  }

  if (!migratedTemplate.changed) {
    return {
      changed: false,
      next: rawModel,
      summary,
    }
  }

  return {
    changed: true,
    next: {
      ...rawModel,
      compatMediaTemplate: migratedTemplate.nextTemplate,
    },
    summary,
  }
}

export function migrateOpenAICompatImageTemplatePayload(
  rawModels: string | null | undefined,
): PayloadMigrationResult {
  const baseSummary = zeroSummary()
  if (!rawModels) {
    return {
      status: 'ok',
      changed: false,
      nextRaw: rawModels,
      summary: baseSummary,
    }
  }

  let parsedUnknown: unknown
  try {
    parsedUnknown = JSON.parse(rawModels) as unknown
  } catch {
    return {
      status: 'invalid',
      changed: false,
      nextRaw: rawModels,
      summary: {
        ...baseSummary,
        invalidPayload: true,
      },
    }
  }

  if (!Array.isArray(parsedUnknown)) {
    return {
      status: 'invalid',
      changed: false,
      nextRaw: rawModels,
      summary: {
        ...baseSummary,
        invalidPayload: true,
      },
    }
  }

  let changed = false
  let summary = {
    modelsScanned: 0,
    migratedModels: 0,
    upgradedLegacyTemplates: 0,
    addedEditOperations: 0,
    initializedMissingTemplates: 0,
    skippedInvalidTemplates: 0,
  }

  const nextModels = parsedUnknown.map((model) => {
    const result = migrateModelEntry(model)
    summary = addSummary(summary, result.summary)
    changed = changed || result.changed
    return result.next
  })

  return {
    status: 'ok',
    changed,
    nextRaw: changed ? JSON.stringify(nextModels) : rawModels,
    summary: {
      ...summary,
      invalidPayload: false,
    },
  }
}
