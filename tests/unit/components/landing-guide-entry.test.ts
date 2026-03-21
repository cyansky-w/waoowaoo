import * as React from 'react'
import { createElement } from 'react'
import type { ComponentProps, ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import Home from '@/app/[locale]/page'

const useSessionMock = vi.fn()
const replaceMock = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: () => useSessionMock(),
}))

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string } & Record<string, unknown>) =>
    createElement('img', { alt, ...props }),
}))

vi.mock('@/components/Navbar', () => ({
  default: () => createElement('nav', null, 'Navbar'),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname: string }
    children: React.ReactNode
  } & Record<string, unknown>) => {
    const resolvedHref = typeof href === 'string' ? href : href.pathname
    return createElement('a', { href: resolvedHref, ...props }, children)
  },
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}))

const renderWithIntl = (node: ReactElement) => {
  const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
    locale: 'zh',
    messages: {
      landing: {
        title: 'waoowaoo',
        subtitle: 'AI影像 Studio',
        getStarted: '立即体验',
        usageGuide: '使用攻略',
      },
    } as unknown as AbstractIntlMessages,
    timeZone: 'Asia/Shanghai',
    children: node,
  }

  return renderToStaticMarkup(createElement(NextIntlClientProvider, providerProps))
}

describe('landing guide entry', () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    replaceMock.mockReset()
  })

  it('shows the guide link for logged-out users', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({ data: null, status: 'unauthenticated' })

    const html = renderWithIntl(createElement(Home))

    expect(html).toContain('/guide')
    expect(html).toContain('使用攻略')
  })

  it('does not render the guide link for authenticated users', () => {
    Reflect.set(globalThis, 'React', React)
    useSessionMock.mockReturnValue({
      data: { user: { name: 'Earth' } },
      status: 'authenticated',
    })

    const html = renderWithIntl(createElement(Home))

    expect(html).not.toContain('/guide')
    expect(html).not.toContain('使用攻略')
  })
})
