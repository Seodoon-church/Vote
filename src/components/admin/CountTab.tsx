'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  callCountVotes,
  listCandidates,
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
            <NominationResult tally={result.tally} candidates={candidates} />
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

/** 공천투표 결과 — 득표순 정렬만 제공, 2배수 공천 확정은 선관위 수동 (제8조①④) */
function NominationResult({
  tally,
  candidates,
}: {
  tally: Record<string, number>
  candidates: (Candidate & { id: string })[]
}) {
  const byPosition = new Map<string, (Candidate & { id: string })[]>()
  for (const candidate of candidates) {
    const list = byPosition.get(candidate.position_type) ?? []
    list.push(candidate)
    byPosition.set(candidate.position_type, list)
  }
  return (
    <div>
      {[...byPosition.entries()].map(([positionKey, list]) => (
        <div key={positionKey} className="mb-4">
          <h3 className="mb-2 text-sm font-bold">
            {POSITION_LABELS[positionKey as PositionType]} — 공천 득표순
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
                    </td>
                    <td className="text-right font-mono">{tally[candidate.id] ?? 0}표</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-xs text-slate-400">
        공천 확정(정원의 2배수)은 득표순 → 임직일순 → 연장자순으로 선관위가 평가·결의 후
        후보자 탭에서 &quot;공천 확정&quot; 상태로 변경하세요 (규정 제8조).
      </p>
    </div>
  )
}
