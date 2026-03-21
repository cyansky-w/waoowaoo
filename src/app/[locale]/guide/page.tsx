import Navbar from '@/components/Navbar'
import GuidePageContent from './GuidePageContent'

export default function GuidePage() {
  return (
    <div className="glass-page min-h-screen overflow-hidden selection:bg-[var(--glass-tone-info-bg)]">
      <div className="relative z-50">
        <Navbar />
      </div>

      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(138,170,255,0.12),transparent),radial-gradient(900px_500px_at_0%_100%,rgba(148,163,184,0.16),transparent)]" />
        <div className="absolute inset-x-0 top-24 h-40 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />
      </div>

      <div className="relative z-10 pb-10 sm:pb-16">
        <GuidePageContent />
      </div>
    </div>
  )
}
