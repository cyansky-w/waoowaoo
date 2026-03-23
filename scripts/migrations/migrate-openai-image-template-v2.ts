import { prisma } from '@/lib/prisma'
import { migrateOpenAICompatImageTemplatePayload } from '@/lib/migrations/openai-image-template-v2'

const APPLY = process.argv.includes('--apply')

type PreferenceRow = {
  id: string
  userId: string
  customModels: string | null
}

type MigrationSummary = {
  mode: 'dry-run' | 'apply'
  scanned: number
  updatedRows: number
  migratedModels: number
  upgradedLegacyTemplates: number
  addedEditOperations: number
  initializedMissingTemplates: number
  skippedInvalidRows: number
  skippedInvalidTemplates: number
}

async function main() {
  const summary: MigrationSummary = {
    mode: APPLY ? 'apply' : 'dry-run',
    scanned: 0,
    updatedRows: 0,
    migratedModels: 0,
    upgradedLegacyTemplates: 0,
    addedEditOperations: 0,
    initializedMissingTemplates: 0,
    skippedInvalidRows: 0,
    skippedInvalidTemplates: 0,
  }

  const rows = await prisma.userPreference.findMany({
    select: {
      id: true,
      userId: true,
      customModels: true,
    },
  }) as PreferenceRow[]

  summary.scanned = rows.length

  for (const row of rows) {
    const result = migrateOpenAICompatImageTemplatePayload(row.customModels)
    if (result.status === 'invalid') {
      summary.skippedInvalidRows += 1
      continue
    }

    summary.migratedModels += result.summary.migratedModels
    summary.upgradedLegacyTemplates += result.summary.upgradedLegacyTemplates
    summary.addedEditOperations += result.summary.addedEditOperations
    summary.initializedMissingTemplates += result.summary.initializedMissingTemplates
    summary.skippedInvalidTemplates += result.summary.skippedInvalidTemplates

    if (!result.changed) continue
    summary.updatedRows += 1

    if (APPLY) {
      await prisma.userPreference.update({
        where: { id: row.id },
        data: {
          customModels: result.nextRaw ?? null,
        },
      })
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error: unknown) => {
    console.error('[migrate-openai-image-template-v2] failed', error)
    await prisma.$disconnect()
    process.exit(1)
  })
