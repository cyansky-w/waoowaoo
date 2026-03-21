import { Link } from '@/i18n/navigation'
import {
  guideCta,
  guideHero,
  guideOutcomes,
  guidePrerequisite,
  guideSteps,
} from './guide-content'

export default function GuidePageContent() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <section className="glass-surface-modal relative overflow-hidden rounded-[36px] px-6 py-10 sm:px-10 sm:py-12">
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(138,170,255,0.12),transparent)]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="inline-flex rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--glass-tone-info-fg)]">
            {guideHero.badge}
          </p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-[var(--glass-text-primary)] sm:text-5xl lg:text-6xl">
            {guideHero.title}
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-[var(--glass-text-secondary)] sm:text-lg">
            {guideHero.summary}
          </p>
        </div>
      </section>

      <section className="glass-surface rounded-[28px] border border-[var(--glass-stroke-base)] px-6 py-6 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--glass-tone-info-fg)]">
              {guidePrerequisite.title}
            </p>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--glass-text-secondary)]">
              {guidePrerequisite.description}
            </p>
          </div>
          <div className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-soft)] px-4 py-3 text-sm leading-6 text-[var(--glass-text-secondary)] lg:max-w-sm">
            不同阶段依赖的模型能力并不相同，先在设置中心确认可用 provider，后续体验会更顺畅。
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:gap-5">
        {guideSteps.map((step, index) => (
          <article
            key={step.id}
            className="glass-surface rounded-[24px] border border-[var(--glass-stroke-base)] px-6 py-6 sm:px-8"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3">
                  <span className="glass-surface-soft flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--glass-stroke-soft)] text-sm font-bold text-[var(--glass-tone-info-fg)]">
                    {index + 1}
                  </span>
                  <h2 className="text-2xl font-semibold text-[var(--glass-text-primary)]">
                    {step.title}
                  </h2>
                </div>
                <p className="mt-4 text-base leading-7 text-[var(--glass-text-secondary)]">
                  {step.description}
                </p>
              </div>
              <div className="glass-surface-soft min-w-[220px] rounded-2xl border border-[var(--glass-stroke-soft)] px-4 py-4 text-sm text-[var(--glass-text-secondary)] lg:max-w-xs">
                <p className="font-medium text-[var(--glass-text-primary)]">当前产出</p>
                <p className="mt-2 leading-6">{step.output}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="glass-surface rounded-[28px] border border-[var(--glass-stroke-base)] px-6 py-8 sm:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--glass-text-primary)]">你最终会得到什么</h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--glass-text-secondary)]">
              这不是一个只产出最终视频的黑盒，而是一条会逐步沉淀中间资产的创作链路。
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {guideOutcomes.map((item) => (
            <div
              key={item}
              className="glass-surface-soft rounded-2xl border border-[var(--glass-stroke-soft)] px-4 py-4 text-base text-[var(--glass-text-secondary)]"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="glass-surface-modal rounded-[32px] px-6 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-[var(--glass-text-primary)]">{guideCta.title}</h2>
            <p className="mt-3 text-base leading-7 text-[var(--glass-text-secondary)]">
              {guideCta.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={{ pathname: '/auth/signup' }}
              className="glass-btn-base glass-btn-primary rounded-2xl px-8 py-4 text-base font-semibold"
            >
              {guideCta.primaryLabel}
            </Link>
            <Link
              href={{ pathname: '/' }}
              className="glass-btn-base glass-btn-secondary rounded-2xl px-8 py-4 text-base font-semibold"
            >
              {guideCta.secondaryLabel}
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
