import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-slate-200 text-center">
        <p className="text-4xl mb-3">🗳️</p>
        <h1 className="text-xl font-bold mb-1">서둔교회 선거 시스템</h1>
        <p className="text-sm text-slate-500 mb-6">항존직 선거 · 공동의회 현장 투표</p>
        <div className="space-y-2">
          <Link
            href="/admin"
            className="block w-full rounded-xl bg-slate-900 py-3 text-white font-medium hover:bg-slate-700 transition"
          >
            선거 관리 (선관위)
          </Link>
          <Link
            href="/vote"
            className="block w-full rounded-xl border border-slate-300 py-3 font-medium hover:bg-slate-50 transition"
          >
            투표 참여
          </Link>
        </div>
      </div>
    </main>
  )
}
