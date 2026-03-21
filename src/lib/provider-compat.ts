function normalizeProviderKey(input?: string | null): string {
  if (typeof input !== 'string') return ''
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return ''
  const colonIndex = trimmed.indexOf(':')
  return colonIndex === -1 ? trimmed : trimmed.slice(0, colonIndex)
}

const OPENAI_COMPAT_GATEWAY_PROVIDER_KEYS = new Set([
  'openai-compatible',
  'hakimi-compatible',
])

const BASE_URL_COMPATIBLE_PROVIDER_KEYS = new Set([
  ...OPENAI_COMPAT_GATEWAY_PROVIDER_KEYS,
  'gemini-compatible',
])

export function isOpenAICompatGatewayProvider(input?: string | null): boolean {
  return OPENAI_COMPAT_GATEWAY_PROVIDER_KEYS.has(normalizeProviderKey(input))
}

export function isGeminiCompatibleProvider(input?: string | null): boolean {
  return normalizeProviderKey(input) === 'gemini-compatible'
}

export function isBaseUrlCompatibleProvider(input?: string | null): boolean {
  return BASE_URL_COMPATIBLE_PROVIDER_KEYS.has(normalizeProviderKey(input))
}
