'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { LoginForm } from '@/components/LoginForm'
import {
  callGetVoterStatus,
  callSubmitBallot,
  getElection,
  listCandidates,
  listElections,
  type VoterStatus,
} from '@/services/electionService'
import {
  GENDER_LABELS,
  POSITION_LABELS,
  STAGE_LABELS,
  type Candidate,
  type Election,
  type ElectionStage,
  type Gender,
  type PositionType,
  type VoteRound,
} from '@/types/election'

const STAGE_TO_ROUND: Partial<Record<ElectionStage, VoteRound>> = {
  nomination_voting: 'nomination',
  first_voting: 'first',
  second_voting: 'second',
}

const ROUND_CANDIDATE_STATUS: Record<VoteRound, string> = {
  nomination: 'nominated',
  first: 'qualified',
  second: 'second_qualified',
}

const ROUND_LABELS: Record<VoteRound, string> = {
  nomination: '공천투표',
  first: '1차투표',
  second: '2차투표',
}

function VoteFlow() {
  const preselectedId = useSearchParams().get('id')
  const { user, loading, logout } = useAuth()

  const [elections, setElections] = useState<Election[]>([])
  const [election, setElection] = useState<Election | null>(null)
  const [status, setStatus] = useState<VoterStatus | null>(null)
  const [candidates, setCandidates] = useState<(Candidate & { id: string })[]>([])
  const [selections, setSelections] = useState<Record<string, string[]>>({}) // `${position}:${gender}` → ids
  const [onsiteKey, setOnsiteKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [voteSeal, setVoteSeal] = useState('')

  const round = election ? STAGE_TO_ROUND[election.stage] : undefined

  // 진행 중 선거 로드 (+?id= 자동 선택)
  useEffect(() => {
    if (!user) return
    void (async () => {
      try {
        const list = (await listElections()).filter((e) => STAGE_TO_ROUND[e.stage])
        setElections(list)
        const target = preselectedId
          ? list.find((e) => e.id === preselectedId)
          : list.length === 1
            ? list[0]
            : undefined
        if (target) setElection(target)
      } catch {
        setError('선거 정보를 불러오지 못했습니다.')
      }
    })()
  }, [user, preselectedId])

  // 선거 선택 시: 본인 선거인 상태 + 후보 로드
  const selectedElectionId = election?.id
  useEffect(() => {
    if (!selectedElectionId) return
    void (async () => {
      setError('')
      setStatus(null)
      try {
        const [voterStatus, candidateList, fresh] = await Promise.all([
          callGetVoterStatus(selectedElectionId),
          listCandidates(selectedElectionId),
          getElection(selectedElectionId),
        ])
        if (fresh) setElection(fresh)
        setStatus(voterStatus)
        setCandidates(candidateList)
        setSelections({})
      } catch (e) {
        setError(e instanceof Error ? e.message : '선거인 확인에 실패했습니다.')
      }
    })()
  }, [selectedElectionId])

  const ballotSheet = useMemo(() => {
    if (!election || !round) return []
    const requiredStatus = ROUND_CANDIDATE_STATUS[round]
    return Object.entries(election.positions ?? {}).flatMap(([positionKey, quota]) =>
      (['male', 'female'] as Gender[])
        .map((gender) => ({
          position: positionKey as PositionType,
          gender,
          seats: quota?.[gender] ?? 0,
          candidates: candidates.filter(
            (c) =>
              c.position_type === positionKey &&
              c.gender === gender &&
              c.status === requiredStatus
          ),
        }))
        .filter((seat) => seat.seats > 0 && seat.candidates.length > 0)
    )
  }, [election, round, candidates])

  const toggle = (position: PositionType, gender: Gender, candidateId: string, max: number) => {
    const key = `${position}:${gender}`
    setSelections((prev) => {
      const current = prev[key] ?? []
      if (current.includes(candidateId)) {
        return { ...prev, [key]: current.filter((id) => id !== candidateId) }
      }
      if (current.length >= max) return prev // 정원 초과 기표 방지 (제15조②)
      return { ...prev, [key]: [...current, candidateId] }
    })
  }

  const selectedTotal = Object.values(selections).reduce((sum, ids) => sum + ids.length, 0)

  const submit = async () => {
    if (!election?.id || !round) return
    if (
      !confirm(
        `${selectedTotal}명을 선택하셨습니다. 제출 후에는 수정할 수 없습니다. 투표를 제출할까요?`
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      const payload: Partial<Record<PositionType, Partial<Record<Gender, string[]>>>> = {}
      for (const [key, ids] of Object.entries(selections)) {
        if (ids.length === 0) continue
        const [position, gender] = key.split(':') as [PositionType, Gender]
        payload[position] = { ...(payload[position] ?? {}), [gender]: ids }
      }
      setVoteSeal(
        await callSubmitBallot({
          electionId: election.id,
          round,
          selections: payload,
          onsiteKey: onsiteKey || undefined,
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '투표 제출에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-slate-400">로딩 중…</div>
  }
  if (!user) {
    return <LoginForm title="투표 로그인" description="서둔교회 교인 계정으로 로그인하세요." />
  }

  // 투표 완료 — 확인증(vote_seal) 표시
  if (voteSeal) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-4xl mb-3">✅</p>
          <h1 className="text-lg font-bold mb-2">투표가 완료되었습니다</h1>
          <p className="mb-4 text-sm text-slate-500">
            아래 투표 확인증(직인)은 본인 보관용입니다. 시스템은 이 직인과 투표자를 연결하는
            정보를 저장하지 않습니다.
          </p>
          <p className="mb-5 break-all rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-600">
            {voteSeal}
          </p>
          <Link href="/" className="text-sm text-slate-500 underline">
            처음으로
          </Link>
        </div>
      </main>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <span className="font-bold">🗳️ 투표</span>
          <button onClick={logout} className="text-sm text-slate-400 hover:text-slate-700">
            로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {!election ? (
          <section>
            <h1 className="mb-3 text-lg font-bold">진행 중인 투표</h1>
            {elections.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                현재 진행 중인 투표가 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {elections.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setElection(item)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-400"
                    >
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">{STAGE_LABELS[item.stage]}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : !status ? (
          <p className="text-slate-400">선거인 확인 중…</p>
        ) : !status.registered ? (
          <Notice icon="🚫" title="선거인 명부에 없습니다">
            선거인 명부에 등록되어 있지 않습니다. 선거관리위원회에 문의하세요.
          </Notice>
        ) : status.eligible === false ? (
          <Notice icon="🚫" title="선거권이 없습니다">
            선거인 자격이 확인되지 않았습니다. 선거관리위원회에 문의하세요.
          </Notice>
        ) : round && status.hasVoted?.[round] ? (
          <Notice icon="✅" title="이미 투표하셨습니다">
            {ROUND_LABELS[round]}에 이미 참여하셨습니다. 중복 투표는 불가합니다.
          </Notice>
        ) : round === 'nomination' && status.voterType === 'member' ? (
          <Notice icon="🚫" title="공천투표 대상이 아닙니다">
            공천투표는 항존직(은퇴 포함)만 참여할 수 있습니다 (선거규정 제8조①).
          </Notice>
        ) : (
          round && (
            <section>
              <div className="mb-4">
                <h1 className="text-lg font-bold">{election.name}</h1>
                <p className="text-sm text-slate-500">
                  {ROUND_LABELS[round]} · {status.name}님
                </p>
              </div>

              {election.onsite_key_hash && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-medium text-amber-700">
                    현장 인증 — 공동의회 현장에서 안내된 6자리 인증 키를 입력하세요.
                  </p>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full rounded-lg border border-amber-300 px-3 py-2.5 text-center font-mono text-xl tracking-widest"
                    placeholder="○○○○○○"
                    value={onsiteKey}
                    onChange={(e) => setOnsiteKey(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              )}

              {ballotSheet.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                  이번 라운드의 투표 대상 후보가 아직 등록되지 않았습니다.
                </p>
              ) : (
                <>
                  {ballotSheet.map(({ position, gender, seats, candidates: list }) => {
                    const key = `${position}:${gender}`
                    const picked = selections[key] ?? []
                    return (
                      <div
                        key={key}
                        className="mb-4 rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <p className="mb-1 text-sm font-bold">
                          {POSITION_LABELS[position]} ({GENDER_LABELS[gender]}) —{' '}
                          {seats}명 선택
                        </p>
                        <p className="mb-3 text-xs text-slate-400">
                          {picked.length}/{seats}명 선택됨 · 정원을 초과해 선택할 수 없습니다
                        </p>
                        <ul className="grid gap-2 sm:grid-cols-2">
                          {list.map((candidate) => {
                            const checked = picked.includes(candidate.id)
                            return (
                              <li key={candidate.id}>
                                <button
                                  onClick={() => toggle(position, gender, candidate.id, seats)}
                                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                                    checked
                                      ? 'border-slate-900 bg-slate-900 text-white'
                                      : 'border-slate-200 bg-white hover:border-slate-400'
                                  }`}
                                >
                                  {checked ? '✓ ' : ''}
                                  {candidate.name}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}

                  {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
                  <button
                    disabled={busy || selectedTotal === 0}
                    onClick={submit}
                    className="w-full rounded-xl bg-slate-900 py-3.5 font-medium text-white hover:bg-slate-700 disabled:opacity-40"
                  >
                    {busy ? '제출 중…' : `투표 제출 (${selectedTotal}명 선택)`}
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-400">
                    투표는 무기명으로 기록되며, 제출 후에는 수정할 수 없습니다.
                  </p>
                </>
              )}
            </section>
          )
        )}
        {error && !election && <p className="text-sm text-red-600">{error}</p>}
      </main>
    </div>
  )
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <p className="mb-2 text-3xl">{icon}</p>
      <h2 className="mb-1 font-bold">{title}</h2>
      <p className="text-sm text-slate-500">{children}</p>
      <Link href="/" className="mt-4 inline-block text-sm text-slate-400 underline">
        처음으로
      </Link>
    </div>
  )
}

export default function VotePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-slate-400">로딩 중…</div>
      }
    >
      <VoteFlow />
    </Suspense>
  )
}
