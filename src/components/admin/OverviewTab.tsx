'use client'

import { useState } from 'react'
import { callAdvanceStage, callGenerateOnsiteKey } from '@/services/electionService'
import type { Election, ElectionStage, PositionType } from '@/types/election'
import { POSITION_LABELS, STAGE_LABELS } from '@/types/election'

/** 허용 전환 — functions/advanceStage의 화이트리스트와 동일하게 유지 */
const NEXT_STAGES: Record<ElectionStage, ElectionStage[]> = {
  preparing: ['nomination_voting', 'first_voting', 'cancelled'],
  nomination_voting: ['first_voting', 'cancelled'],
  first_voting: ['second_voting', 'completed', 'cancelled'],
  second_voting: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function OverviewTab({
  electionId,
  election,
  onChanged,
}: {
  electionId: string
  election: Election
  onChanged: () => Promise<void>
}) {
  const [roundStartAt, setRoundStartAt] = useState('')
  const [roundEndAt, setRoundEndAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [onsiteKey, setOnsiteKey] = useState('')
  const [error, setError] = useState('')

  const advance = async (toStage: ElectionStage) => {
    const label = STAGE_LABELS[toStage]
    if (!confirm(`단계를 "${label}"(으)로 전환할까요?`)) return
    setBusy(true)
    setError('')
    try {
      await callAdvanceStage({
        electionId,
        toStage,
        roundStartAt: roundStartAt ? new Date(roundStartAt).toISOString() : undefined,
        roundEndAt: roundEndAt ? new Date(roundEndAt).toISOString() : undefined,
      })
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : '단계 전환에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const generateKey = async () => {
    if (
      !confirm(
        '현장 인증 키를 발급할까요? 기존 키는 즉시 무효화되며, 새 키는 이 화면에 한 번만 표시됩니다.'
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      setOnsiteKey(await callGenerateOnsiteKey(electionId))
    } catch (e) {
      setError(e instanceof Error ? e.message : '인증 키 발급에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">선출 정원 (성별 몫 배분)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400">
              <th className="py-1">직분</th>
              <th>남성 몫</th>
              <th>여성 몫</th>
              <th>계</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(election.positions ?? {}).map(([position, quota]) => (
              <tr key={position} className="border-t border-slate-100">
                <td className="py-2 font-medium">{POSITION_LABELS[position as PositionType]}</td>
                <td>{quota!.male}명</td>
                <td>{quota!.female}명</td>
                <td>{quota!.male + quota!.female}명</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">단계 전환</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">라운드 시작 (선택)</span>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={roundStartAt}
              onChange={(e) => setRoundStartAt(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">라운드 마감 (선택)</span>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={roundEndAt}
              onChange={(e) => setRoundEndAt(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {NEXT_STAGES[election.stage].map((stage) => (
            <button
              key={stage}
              disabled={busy}
              onClick={() => advance(stage)}
              className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                stage === 'cancelled'
                  ? 'border border-red-200 text-red-600 hover:bg-red-50'
                  : 'bg-slate-900 text-white hover:bg-slate-700'
              }`}
            >
              {STAGE_LABELS[stage]}(으)로 전환
            </button>
          ))}
          {NEXT_STAGES[election.stage].length === 0 && (
            <p className="text-sm text-slate-400">전환 가능한 단계가 없습니다.</p>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          기간을 입력하면 해당 라운드의 투표 가능 시간이 서버 시각 기준으로 강제됩니다.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">현장 인증 키</h2>
        <p className="mb-3 text-xs text-slate-500">
          현장 투표 시 투표자가 입력하는 6자리 키입니다. 서버에는 해시만 저장되며 키 유출 시
          재발급하면 기존 키는 즉시 무효화됩니다.
        </p>
        {onsiteKey && (
          <p className="mb-3 rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
            <span className="block text-xs text-amber-700 mb-1">
              새 인증 키 — 지금만 표시됩니다. 현장 스크린에 공지하세요.
            </span>
            <span className="font-mono text-3xl font-bold tracking-widest">{onsiteKey}</span>
          </p>
        )}
        <button
          disabled={busy}
          onClick={generateKey}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {election.onsite_key_hash ? '인증 키 재발급' : '인증 키 발급'}
        </button>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-400">
        단계 전환·인증 키·개표는 Cloud Functions로 처리됩니다 (배포 전에는 에뮬레이터에서만
        동작).
      </p>
    </div>
  )
}
