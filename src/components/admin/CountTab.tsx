'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  callCountVotes,
  listCandidates,
  updateCandidateStatusBulk,
  type CountVotesResponse,
} from '@/services/electionService'
import {
  GENDER_LABELS,
  POSITION_LABELS,
  type Candidate,
  type Election,
  type Gender,
  type PositionType,
  type VoteRound,
} from '@/types/election'

const ROUND_LABELS: Record<VoteRound, string> = {
  nomination: '공천투표',
  first: '1차투표',
  second: '2차투표',
}

export function CountTab({ electionId, election }: { electionId: string; election: Election }) {
  const [candidates, setCandidates] = useState<(Candidate & { id: string })[]>([])
  const [round, setRound] = useState<VoteRound>('first')
  const [result, setResult] = useState<CountVotesResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setCandidates(await listCandidates(electionId))
  }, [electionId])

  useEffect(() => {
    void reload()
  }, [reload])

  const nameOf = useMemo(() => {
    const map = new Map(candidates.map((c) => [c.id, c.name]))
    return (id: string) => map.get(id) ?? id
  }, [candidates])

  const count = async () => {
    if (!confirm(`${ROUND_LABELS[round]} 개표를 실행할까요? 득표수와 피택 상태가 갱신됩니다.`))
      return
    setBusy(true)
    setError('')
    try {
      setResult(await callCountVotes(electionId, round))
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '개표에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 print:hidden">
        <h2 className="mb-3 text-sm font-bold">개표 실행 (선관위 전용)</h2>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
            value={round}
            onChange={(e) => setRound(e.target.value as VoteRound)}
          >
            {Object.entries(ROUND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            disabled={busy}
            onClick={count}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? '개표 중…' : '개표 실행'}
          </button>
          {result && (
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              결과 인쇄
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      {result && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-base font-bold">
            {election.name} — {ROUND_LABELS[round]} 개표 결과
          </h2>
          <p className="mb-4 text-sm text-slate-500">총 투표지 {result.totalBallots}장</p>

          {result.secondRoundOptional !== null && (
            <p
              className={`mb-4 rounded-xl p-3 text-sm ${
                result.secondRoundOptional
                  ? 'bg-green-50 text-green-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {result.secondRoundOptional
                ? '예정인원의 70% 이상 선출 — 규정 제9조③ 단서에 따라 2차 투표를 생략할 수 있습니다.'
                : '선출 인원이 예정의 70% 미만 — 미달 몫은 미달 수의 2배수 후보로 2차 투표 대상이 지정되었습니다.'}
            </p>
          )}

          {round === 'nomination' ? (
            <NominationResult
              electionId={electionId}
              election={election}
              tally={result.tally}
              candidates={candidates}
              onDone={reload}
            />
          ) : (
            result.outcome &&
            Object.entries(result.outcome).map(([positionKey, byGender]) => (
              <div key={positionKey} className="mb-5">
                <h3 className="mb-2 text-sm font-bold">
                  {POSITION_LABELS[positionKey as PositionType]}
                </h3>
                {Object.entries(byGender).map(([genderKey, seat]) => {
                  const quota =
                    election.positions?.[positionKey as PositionType]?.[genderKey as Gender] ?? 0
                  if (quota === 0 && seat.elected.length === 0 && seat.notElected.length === 0)
                    return null
                  return (
                    <div key={genderKey} className="mb-3 rounded-xl border border-slate-100 p-3">
                      <p className="mb-2 text-xs font-medium text-slate-500">
                        {GENDER_LABELS[genderKey as Gender]}성 몫 — 정원 {quota}명 · 피택{' '}
                        {seat.elected.length}명
                        {seat.deficit > 0 && ` · 미달 ${seat.deficit}명`}
                      </p>
                      {seat.tieAtBoundary && (
                        <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-600">
                          ⚠️ 정원 경계 동점 — 자동 확정하지 않았습니다. 규정 제8조④ 준용(임직일순
                          → 연장자순)으로 선관위가 판정하세요.
                        </p>
                      )}
                      <table className="w-full text-sm">
                        <tbody>
                          {[...seat.elected, ...seat.notElected].map((candidateId) => (
                            <tr key={candidateId} className="border-t border-slate-50">
                              <td className="py-1">{nameOf(candidateId)}</td>
                              <td className="text-right font-mono">
                                {result.tally[candidateId] ?? 0}표
                              </td>
                              <td className="w-20 text-right">
                                {seat.elected.includes(candidateId) ? (
                                  <span className="text-xs font-bold text-green-700">피택</span>
                                ) : (
                                  <span className="text-xs text-slate-400">미피택</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            ))
          )}
          <p className="mt-4 text-xs text-slate-400">
            피택 기준: 장로 = 해당 직분 투표수의 2/3 이상, 안수집사·권사 = 과반 (규정 제9조).
            선거관리위원장 확인 후 결과를 공고하세요 (제16조).
          </p>
        </section>
      )}
    </div>
  )
}

/** 공천투표 결과 — 득표순 표시 + 정원 2배수 공천 확정 (규정 제8조①④) */
function NominationResult({
  electionId,
  election,
  tally,
  candidates,
  onDone,
}: {
  electionId: string
  election: Election
  tally: Record<string, number>
  candidates: (Candidate & { id: string })[]
  onDone: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [notices, setNotices] = useState<string[]>([])

  const byPosition = new Map<string, (Candidate & { id: string })[]>()
  for (const candidate of candidates) {
    const list = byPosition.get(candidate.position_type) ?? []
    list.push(candidate)
    byPosition.set(candidate.position_type, list)
  }

  /** 성별 몫별 정원×2배수 득표순 확정. 경계 동점 몫은 동점 초과 득표자만 자동 확정하고 수동 판정 안내 */
  const confirmNomination = async () => {
    const toQualify: string[] = []
    const warnings: string[] = []

    for (const [positionKey, quota] of Object.entries(election.positions ?? {})) {
      const position = positionKey as PositionType
      for (const gender of ['male', 'female'] as Gender[]) {
        const seats = quota?.[gender] ?? 0
        if (seats === 0) continue
        const limit = seats * 2
        const pool = candidates
          .filter(
            (c) => c.position_type === position && c.gender === gender && c.status === 'nominated'
          )
          .map((c) => ({ id: c.id, votes: tally[c.id] ?? 0 }))
          .sort((a, b) => b.votes - a.votes)

        if (pool.length === 0) continue
        if (pool.length <= limit) {
          toQualify.push(...pool.map((p) => p.id))
          continue
        }
        if (pool[limit - 1].votes === pool[limit].votes) {
          // 경계 동점 — 동점 표수를 초과한 득표자만 자동 확정
          const safe = pool.filter((p) => p.votes > pool[limit - 1].votes)
          toQualify.push(...safe.map((p) => p.id))
          warnings.push(
            `${POSITION_LABELS[position]}(${GENDER_LABELS[gender]}) ${limit}번째 자리 동점(${pool[limit - 1].votes}표) — 임직일순→연장자순으로 선관위가 수동 판정 후 후보자 탭에서 확정하세요 (제8조④)`
          )
        } else {
          toQualify.push(...pool.slice(0, limit).map((p) => p.id))
        }
      }
    }

    if (toQualify.length === 0) {
      alert('확정할 후보가 없습니다. 개표를 먼저 실행하세요.')
      return
    }
    if (
      !confirm(
        `득표순 상위(정원의 2배수) ${toQualify.length}명을 공천 확정(1차 투표 대상)으로 전환할까요?` +
          (warnings.length ? `\n\n⚠️ 동점 수동 판정 필요 ${warnings.length}건 있음` : '')
      )
    )
      return

    setBusy(true)
    try {
      await updateCandidateStatusBulk(electionId, toQualify, 'qualified')
      setNotices(warnings)
      await onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {[...byPosition.entries()].map(([positionKey, list]) => {
        const quota = election.positions?.[positionKey as PositionType]
        const doubled = ((quota?.male ?? 0) + (quota?.female ?? 0)) * 2
        return (
          <div key={positionKey} className="mb-4">
            <h3 className="mb-2 text-sm font-bold">
              {POSITION_LABELS[positionKey as PositionType]} — 공천 득표순{' '}
              <span className="font-normal text-slate-400">
                (확정 정원: 남 {(quota?.male ?? 0) * 2}·여 {(quota?.female ?? 0) * 2} = 총{' '}
                {doubled}명)
              </span>
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {list
                  .sort((a, b) => (tally[b.id] ?? 0) - (tally[a.id] ?? 0))
                  .map((candidate) => (
                    <tr key={candidate.id} className="border-t border-slate-50">
                      <td className="py-1">
                        {candidate.name}
                        <span className="ml-1 text-xs text-slate-400">
                          ({GENDER_LABELS[candidate.gender]})
                        </span>
                        {candidate.status === 'qualified' && (
                          <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                            공천 확정
                          </span>
                        )}
                      </td>
                      <td className="text-right font-mono">{tally[candidate.id] ?? 0}표</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )
      })}

      {notices.map((notice) => (
        <p key={notice} className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-700">
          ⚠️ {notice}
        </p>
      ))}

      <button
        disabled={busy}
        onClick={confirmNomination}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50 print:hidden"
      >
        {busy ? '처리 중…' : '공천 확정 — 성별 몫별 정원 2배수 자동 선정'}
      </button>
      <p className="mt-2 text-xs text-slate-400">
        공천 순위 규칙: 득표순 → 임직일순 → 연장자순 (규정 제8조④). 동점 몫은 자동 확정에서
        제외되며 후보자 탭에서 수동 확정합니다. 확정 후 개요 탭에서 1차투표로 전환하세요.
      </p>
    </div>
  )
}
