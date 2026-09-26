'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addCandidate,
  fetchAllMembers,
  listCandidates,
  removeCandidate,
  updateCandidateStatus,
} from '@/services/electionService'
import { assessCandidate, mapGender, type MemberRecord } from '@/lib/qualification'
import {
  DEFAULT_ELECTION_RULES,
  GENDER_LABELS,
  POSITION_LABELS,
  type Candidate,
  type CandidateStatus,
  type Election,
  type PositionType,
} from '@/types/election'

const STATUS_LABELS: Record<CandidateStatus, string> = {
  nominated: '공천 후보',
  qualified: '공천 확정(1차 대상)',
  disqualified: '자격 미달',
  second_qualified: '2차 대상',
  elected: '피택',
  not_elected: '낙선',
}

/** 선관위가 수동 변경 가능한 상태 — 피택/낙선/2차 대상은 개표(countVotes)가 확정 */
const MANUAL_STATUSES: CandidateStatus[] = ['nominated', 'qualified', 'disqualified']

export function CandidatesTab({
  electionId,
  election,
}: {
  electionId: string
  election: Election
}) {
  const positionKeys = Object.keys(election.positions ?? {}) as PositionType[]
  const [candidates, setCandidates] = useState<(Candidate & { id: string })[]>([])
  const [members, setMembers] = useState<MemberRecord[] | null>(null)
  const [searchName, setSearchName] = useState('')
  const [position, setPosition] = useState<PositionType>(positionKeys[0] ?? 'elder')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      setCandidates(await listCandidates(electionId))
    } catch {
      setError('후보자 목록을 불러오지 못했습니다.')
    }
  }, [electionId])

  useEffect(() => {
    void reload()
  }, [reload])

  const searchResults = useMemo(() => {
    if (!members || !searchName.trim()) return []
    const today = new Date()
    return members
      .filter((m) => m.name.includes(searchName.trim()))
      .slice(0, 10)
      .map((member) => ({
        member,
        assessment: assessCandidate(member, position, DEFAULT_ELECTION_RULES, today),
      }))
  }, [members, searchName, position])

  const loadMembers = async () => {
    setBusy(true)
    try {
      setMembers(await fetchAllMembers())
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = async (member: MemberRecord) => {
    const gender = mapGender(member.gender)
    if (!gender) {
      alert('성별이 등록되지 않은 교인은 후보로 추가할 수 없습니다.')
      return
    }
    if (candidates.some((c) => c.member_id === member.id && c.position_type === position)) {
      alert('이미 해당 직분 후보로 등록되어 있습니다.')
      return
    }
    await addCandidate(electionId, {
      member_id: member.id,
      name: member.name,
      position_type: position,
      gender,
    })
    setSearchName('')
    await reload()
  }

  return (
    <div className="space-y-5">
      {positionKeys.map((positionKey) => {
        const list = candidates
          .filter((c) => c.position_type === positionKey)
          .sort((a, b) => (b.nomination_vote_count ?? 0) - (a.nomination_vote_count ?? 0))
        const quota = election.positions?.[positionKey]
        return (
          <section key={positionKey} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-bold">
              {POSITION_LABELS[positionKey]} 후보{' '}
              <span className="font-normal text-slate-400">
                ({list.length}명 / 정원 남{quota?.male ?? 0}·여{quota?.female ?? 0} — 공천은
                2배수, 규정 제8조①)
              </span>
            </h2>
            {list.length === 0 ? (
              <p className="text-sm text-slate-400">등록된 후보가 없습니다.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400">
                    <th className="py-1">이름</th>
                    <th>성별 몫</th>
                    <th>공천 득표</th>
                    <th>1차</th>
                    <th>2차</th>
                    <th>상태</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((candidate) => (
                    <tr key={candidate.id} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{candidate.name}</td>
                      <td>{GENDER_LABELS[candidate.gender]}</td>
                      <td>{candidate.nomination_vote_count ?? 0}</td>
                      <td>{candidate.first_round_vote_count ?? 0}</td>
                      <td>{candidate.second_round_vote_count ?? 0}</td>
                      <td>
                        {MANUAL_STATUSES.includes(candidate.status) ? (
                          <select
                            className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                            value={candidate.status}
                            onChange={async (e) => {
                              await updateCandidateStatus(
                                electionId,
                                candidate.id,
                                e.target.value as CandidateStatus
                              )
                              await reload()
                            }}
                          >
                            {MANUAL_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${
                              candidate.status === 'elected'
                                ? 'bg-green-100 text-green-700'
                                : candidate.status === 'second_qualified'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {STATUS_LABELS[candidate.status]}
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={async () => {
                            if (confirm(`${candidate.name} 후보를 삭제할까요?`)) {
                              await removeCandidate(electionId, candidate.id)
                              await reload()
                            }
                          }}
                          className="text-xs text-slate-300 hover:text-red-600"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )
      })}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">후보 추가 (교적부 검색 + 자격 판정)</h2>
        {!members ? (
          <button
            disabled={busy}
            onClick={loadMembers}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            교적부 불러오기
          </button>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              <select
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                value={position}
                onChange={(e) => setPosition(e.target.value as PositionType)}
              >
                {positionKeys.map((key) => (
                  <option key={key} value={key}>
                    {POSITION_LABELS[key]}
                  </option>
                ))}
              </select>
              <input
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="이름 검색"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>
            <ul className="divide-y divide-slate-100">
              {searchResults.map(({ member, assessment }) => (
                <li key={member.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>
                      <span className="font-medium">{member.name}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {member.gender ?? '성별?'} · {member.detailed_position || member.position || '직분 없음'}
                      </span>
                      <span
                        className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                          assessment.eligible
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {assessment.eligible ? '적격' : '부적격'}
                      </span>
                    </span>
                    <button
                      onClick={() => handleAdd(member)}
                      className="text-xs font-medium text-slate-700 hover:underline"
                    >
                      후보 추가
                    </button>
                  </div>
                  {(assessment.reasons.length > 0 || assessment.warnings.length > 0) && (
                    <p className="mt-1 text-xs text-slate-400">
                      {assessment.reasons.length > 0 && (
                        <span className="text-red-500">{assessment.reasons.join(', ')}</span>
                      )}
                      {assessment.reasons.length > 0 && assessment.warnings.length > 0 && ' · '}
                      {assessment.warnings.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
