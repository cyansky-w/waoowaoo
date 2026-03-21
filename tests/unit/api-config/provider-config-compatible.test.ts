import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaState = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreference: {
      findUnique: prismaState.findUnique,
    },
  },
}))

vi.mock('@/lib/crypto-utils', () => ({
  decryptApiKey: vi.fn((value: string) => value),
}))

import { getProviderConfig } from '@/lib/api-config'

describe('api-config compatible provider config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes hakimi-compatible baseUrl to include /v1', async () => {
    prismaState.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        {
          id: 'hakimi-compatible:hk-1',
          name: 'Hakimi Compat',
          baseUrl: 'https://hakimi.example.com',
          apiKey: 'enc:hk-key',
          apiMode: 'openai-official',
          gatewayRoute: 'openai-compat',
        },
      ]),
      customModels: '[]',
    })

    const provider = await getProviderConfig('user-1', 'hakimi-compatible:hk-1')

    expect(provider.baseUrl).toBe('https://hakimi.example.com/v1')
    expect(provider.gatewayRoute).toBe('openai-compat')
  })
})
