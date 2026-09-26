'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearVoters,
  fetchAllMembers,
  listVoters,
  registerVotersBulk,
  removeVoter,
} from '@/services/electionService'
import { assessVoter, mapGender, type MemberRecord } from '@/lib/qualification'
import { DEFAULT_ELECTION_RULES, type Voter } from '@/types/election'

interface Assessment {
  member: MemberRecord
  eligible: boolean
  reasons: string[]
  warnings: string[]
  voterType: string
}

export function VotersTab({ electionId }: { electionId: string }) {
  const [voters, setVoters] = useState<(Voter & { id: string })[]>([])
  const [assessments, setAssessments] = useState<Assessment[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      setVoters(await listVoters(electionId))
    } catch {
      setError('선거인 명부를 불러오지 못했습니다 (관리자/선관위 권한 필요).')
    }
  }, [electionId])

  useEffect(() => {
    void reload()
  }, [reload])

  // 교적부 로드 + 자격 판정
  const assess = async () => {
    setBusy(true)
    setError('')
    try {
      const members = await fetchAllMembers()
      const today = new Date()
      setAssessments(
        members.map((member) => ({
          member,
          ...assessVoter(member, DEFAULT_ELECTION_RULES.voter, today),
        }))
      )
    } catch {
      setError('교적부를 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const eligibleList = useMemo(
    () => (assessments ?? []).filter((a) => a.eligible && mapGender(a.member.gender)),
    [assessments]
  )

  const register = async () => {
    if (!confirm(`적격 선거인 ${eligibleList.length}명을 명부에 등록할까요?`)) return
    setBusy(true)
    try {
      await registerVotersBulk(
        electionId,
        eligibleList.map((a) => ({
          member_id: a.member.id,
          name: a.member.name,
          gender: mapGender(a.member.gender)!,
          voter_type: a.voterType as Voter['voter_type'],
          is_eligible: true,
          has_voted_nomination: false,
          has_voted_first: false,
          has_voted_second: false,
        })),
        (done, total) => setProgress(`${done}/${total} 등록 중…`)
      )
      setProgress('')
      setAssessments(null)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const votedCounts = useMemo(
    () => ({
      nomination: voters.filter((v) => v.has_voted_nomination).length,
      first: voters.filter((v) => v.has_voted_first).length,
      second: voters.filter((v) => v.has_voted_second).length,
    }),
    [voters]
  )

  const visibleVoters = useMemo(() => {
    const list = filter ? voters.filter((v) => v.name.includes(filter)) : voters
    return list.slice(0, 200)
  }, [voters, filter])

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">
            선거인 명부 <span className="font-normal text-slate-400">({voters.length}명)</span>
          </h2>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={assess}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
            >
              교적부에서 자격 판정
            </button>
            {voters.length > 0 && (
              <button
                disabled={busy}
                onClick={async () => {
                  if (confirm(`명부 전체(${voters.length}명)를 삭제할까요?`)) {
                    setBusy(true)
                    await clearVoters(electionId)
                    await reload()
                    setBusy(false)
                  }
                }}
                className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                전체 삭제
              </button>
            )}
          </div>
        </div>

        {voters.length > 0 && (
          <p className="mb-3 text-xs text-slate-500">
            투표 현황 — 공천 {votedCounts.nomination}명 · 1차 {votedCounts.first}명 · 2차{' '}
            {votedCounts.second}명
          </p>
        )}

        <input
          className="mb-3 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="이름 검색"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        {visibleVoters.length === 0 ? (
          <p className="text-sm text-slate-400">등록된 선거인이 없습니다.</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {visibleVoters.map((voter) => (
                <li key={voter.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span>
                    {voter.name}
                    <span className="ml-2 text-xs text-slate-400">
                      {voter.gender === 'male' ? '남' : '여'}
                      {voter.has_voted_first && ' · 1차 투표함'}
                      {voter.has_voted_second && ' · 2차 투표함'}
                    </span>
                  </span>
                  <button
                    onClick={async () => {
                      if (confirm(`${voter.name}을(를) 명부에서 삭제할까요?`)) {
                        await removeVoter(electionId, voter.id)
                        await reload()
                      }
                    }}
                    className="text-xs text-slate-300 hover:text-red-600"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
            {voters.length > 200 && (
              <p className="mt-2 text-xs text-slate-400">
                상위 200명만 표시됩니다. 이름 검색으로 찾아 관리하세요.
              </p>
            )}
          </>
        )}
      </section>

      {assessments && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-bold">자격 판정 결과</h2>
          <p className="mb-3 text-sm">
            전체 {assessments.length}명 중{' '}
            <span className="font-bold text-green-700">적격 {eligibleList.length}명</span> · 부적격{' '}
            {assessments.filter((a) => !a.eligible).length}명 · 성별 미등록 제외{' '}
            {assessments.filter((a) => a.eligible && !mapGender(a.member.gender)).length}명
          </p>
          <div className="mb-3 max-h-48 overflow-y-auto rounded-xl border border-slate-100 p-3 text-xs text-slate-500">
            {assessments
              .filter((a) => !a.eligible)
              .slice(0, 100)
              .map((a) => (
                <p key={a.member.id}>
                  <span className="font-medium text-slate-700">{a.member.name}</span> —{' '}
                  {a.reasons.join(', ')}
                </p>
              ))}
          </div>
          <button
            disabled={busy || eligibleList.length === 0}
            onClick={register}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            적격자 {eligibleList.length}명 일괄 등록
          </button>
          {progress && <span className="ml-3 text-xs text-slate-500">{progress}</span>}
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
