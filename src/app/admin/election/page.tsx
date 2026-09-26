'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getElection } from '@/services/electionService'
import type { Election } from '@/types/election'
import { STAGE_LABELS } from '@/types/election'
import { OverviewTab } from '@/components/admin/OverviewTab'
import { CommitteeTab } from '@/components/admin/CommitteeTab'
import { VotersTab } from '@/components/admin/VotersTab'
import { CandidatesTab } from '@/components/admin/CandidatesTab'
import { CountTab } from '@/components/admin/CountTab'

const TABS = [
  { key: 'overview', label: '개요' },
  { key: 'committee', label: '선관위' },
  { key: 'voters', label: '선거인' },
  { key: 'candidates', label: '후보자' },
  { key: 'count', label: '개표' },
] as const

type TabKey = (typeof TABS)[number]['key']

function ElectionDetail() {
  const electionId = useSearchParams().get('id') ?? ''
  const [election, setElection] = useState<Election | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<TabKey>('overview')

  const reload = useCallback(async () => {
    if (!electionId) {
      setNotFound(true)
      return
    }
    const data = await getElection(electionId)
    if (data) setElection(data)
    else setNotFound(true)
  }, [electionId])

  useEffect(() => {
    void reload()
  }, [reload])

  if (notFound) {
    return (
      <p className="text-sm text-slate-500">
        선거를 찾을 수 없습니다.{' '}
        <Link href="/admin" className="underline">
          목록으로
        </Link>
      </p>
    )
  }
  if (!election) {
    return <p className="text-slate-400">불러오는 중…</p>
  }

  return (
    <div>
      <div className="mb-4 print:hidden">
        <Link href="/admin" className="text-xs text-slate-400 hover:text-slate-600">
          ← 선거 목록
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-lg font-bold">{election.name}</h1>
          <span className="rounded-full bg-slate-900 px-3 py-0.5 text-xs text-white">
            {STAGE_LABELS[election.stage]}
          </span>
        </div>
      </div>

      <nav className="mb-5 flex gap-1 border-b border-slate-200 print:hidden">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === key
                ? 'border-b-2 border-slate-900 text-slate-900'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <OverviewTab electionId={electionId} election={election} onChanged={reload} />
      )}
      {tab === 'committee' && <CommitteeTab electionId={electionId} />}
      {tab === 'voters' && <VotersTab electionId={electionId} />}
      {tab === 'candidates' && <CandidatesTab electionId={electionId} election={election} />}
      {tab === 'count' && <CountTab electionId={electionId} election={election} />}
    </div>
  )
}

export default function ElectionDetailPage() {
  return (
    <Suspense fallback={<p className="text-slate-400">불러오는 중…</p>}>
      <ElectionDetail />
    </Suspense>
  )
}
