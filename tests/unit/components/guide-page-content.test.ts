import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

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
}))

import GuidePageContent from '@/app/[locale]/guide/GuidePageContent'

describe('GuidePageContent', () => {
  it('renders the prerequisite note, six-step workflow, and final outcome section', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(createElement(GuidePageContent))

    expect(html).toContain('使用攻略')
    expect(html).toContain('开始前先完成 API 配置')
    expect(html).toContain('导入文本')
    expect(html).toContain('角色与场景')
    expect(html).toContain('分镜与出图')
    expect(html).toContain('配音')
    expect(html).toContain('视频生成')
    expect(html).toContain('你最终会得到什么')
    expect(html).toContain('/auth/signup')
    expect(html).toContain('返回首页')
  })
})
