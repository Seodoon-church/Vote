'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import {
  callDeleteElectionDeep,
  createElection,
  listElections,
} from '@/services/electionService'
import type { Election, PositionQuota, PositionType } from '@/types/election'
import { POSITION_LABELS, STAGE_LABELS } from '@/types/election'

const POSITION_KEYS: PositionType[] = ['elder', 'deacon', 'kwansa']

export default function AdminHomePage() {
  const { user } = useAuth()
  const [elections, setElections] = useState<Election[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // 생성 폼 상태 — 직분별 남/여 정원
  const [name, setName] = useState(`${new Date().getFullYear() + 1}년 항존직 선거`)
  const [year, setYear] = useState(new Date().getFullYear() + 1)
  const [quotas, setQuotas] = useState<Record<PositionType, PositionQuota>>({
    elder: { male: 8, female: 2 }, // 2027 당회 결의: 장로 10명 = 남 8 + 여 2
    deacon: { male: 0, female: 0 },
    kwansa: { male: 0, female: 0 },
  })

  const reload = async () => {
    setLoading(true)
    setError('')
    try {
      setElections(await listElections())
    } catch {
      setError('선거 목록을 불러오지 못했습니다. 권한을 확인해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    const positions: Partial<Record<PositionType, PositionQuota>> = {}
    for (const key of POSITION_KEYS) {
      const quota = quotas[key]
      if (quota.male + quota.female > 0) positions[key] = quota
    }
    if (Object.keys(positions).length === 0) {
      setError('선출 정원을 1명 이상 입력하세요.')
      return
    }
    await createElection({ name, year, positions, createdBy: user.uid })
    setShowCreate(false)
    await reload()
  }

  const handleDelete = async (election: Election) => {
    if (election.stage !== 'preparing' && election.stage !== 'cancelled') {
      alert('준비중 또는 취소된 선거만 삭제할 수 있습니다. 진행 중인 선거는 먼저 취소하세요.')
      return
    }
    if (
      !confirm(
        `"${election.name}" 선거를 완전히 삭제할까요?\n명부·후보·투표지 등 하위 데이터가 모두 삭제되며 되돌릴 수 없습니다.`
      )
    )
      return
    try {
      await callDeleteElectionDeep(election.id!)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">선거 목록</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          {showCreate ? '닫기' : '+ 새 선거'}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">선거명</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500">연도</span>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                required
              />
            </label>
          </div>

          <p className="mb-2 text-sm font-medium">
            선출 정원 (성별 몫 배분 — 각 몫에서 독립 경쟁·피택)
          </p>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {POSITION_KEYS.map((key) => (
              <div key={key} className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm font-medium">{POSITION_LABELS[key]}</p>
                <div className="flex items-center gap-2 text-sm">
                  {(['male', 'female'] as const).map((gender) => (
                    <label key={gender} className="flex items-center gap-1">
                      <span className="text-slate-500">{gender === 'male' ? '남' : '여'}</span>
                      <input
                        type="number"
                        min={0}
                        className="w-16 rounded-lg border border-slate-300 px-2 py-1.5"
                        value={quotas[key][gender]}
                        onChange={(e) =>
                          setQuotas((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], [gender]: Math.max(0, Number(e.target.value)) },
                          }))
                        }
                      />
                    </label>
                  ))}
                  <span className="ml-auto text-xs text-slate-400">
                    계 {quotas[key].male + quotas[key].female}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">
            선거 생성
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">불러오는 중…</p>
      ) : elections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          등록된 선거가 없습니다. 새 선거를 생성하세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {elections.map((election) => (
            <li
              key={election.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <Link href={`/admin/election?id=${election.id}`} className="flex-1">
                <p className="font-medium">{election.name}</p>
                <p className="text-xs text-slate-500">
                  {STAGE_LABELS[election.stage]} ·{' '}
                  {Object.entries(election.positions ?? {})
                    .map(
                      ([position, quota]) =>
                        `${POSITION_LABELS[position as PositionType]} ${quota!.male + quota!.female}명(남${quota!.male}·여${quota!.female})`
                    )
                    .join(', ')}
                </p>
              </Link>
              <button
                onClick={() => handleDelete(election)}
                className="ml-3 text-xs text-slate-400 hover:text-red-600"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
