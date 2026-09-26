import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue } from 'firebase-admin/firestore'
import {
  assertElectionManager,
  db,
  electionRef,
  getElectionOrThrow,
  loadThresholds,
  REGION,
  writeAudit,
} from './helpers'
import type { BallotLike, CandidateLike } from './tally'
import { countBallotsByPosition, determineElected, tallyBallots } from './tally'
import type { Gender, PositionQuota, PositionType, VoteRound } from './types'
import {
  CANDIDATE_STATUS_FOR_ROUND,
  ROUND_TO_STAGE,
  VOTE_COUNT_FIELD,
  VOTE_ROUNDS,
} from './types'

interface CountVotesData {
  churchId: string
  electionId: string
  round: VoteRound
}

/**
 * 라운드 집계 + 피택 판정 (선관위 전용).
 * - 공천(nomination): 득표수만 기록 — 공천 확정(qualified)은 선관위가 수동 처리
 * - 1차(first): 성별 몫별 피택 판정. 피택=elected, 미피택=second_qualified(2차 대상)
 * - 2차(second): 피택=elected, 미피택=not_elected
 * 정원 경계 동점(tieAtBoundary)은 자동 확정하지 않고 결과에 표시만 한다.
 */
export const countVotes = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  }
  const { churchId, electionId, round } = (request.data ?? {}) as CountVotesData
  if (!churchId || !electionId || !VOTE_ROUNDS.includes(round)) {
    throw new HttpsError('invalid-argument', '요청 정보가 올바르지 않습니다.')
  }
  await assertElectionManager(churchId, electionId, uid)

  const electionSnap = await getElectionOrThrow(churchId, electionId)
  const election = electionSnap.data()!
  // 진행 중이거나 이미 지난 라운드만 집계 가능 (미래 라운드 차단)
  const stageOrder = ['preparing', 'nomination_voting', 'first_voting', 'second_voting', 'completed']
  if (stageOrder.indexOf(election.stage) < stageOrder.indexOf(ROUND_TO_STAGE[round])) {
    throw new HttpsError('failed-precondition', '아직 진행되지 않은 라운드입니다.')
  }

  const base = electionRef(churchId, electionId)
  const [ballotsSnap, candidatesSnap] = await Promise.all([
    base.collection('ballots').where('round', '==', round).get(),
    base.collection('candidates').get(),
  ])

  const ballots: BallotLike[] = ballotsSnap.docs.map((d) => ({ selections: d.get('selections') ?? {} }))
  const tally = tallyBallots(ballots)
  const totalBallots = ballotsSnap.size
  const countField = VOTE_COUNT_FIELD[round]

  const batch = db().batch()
  for (const snap of candidatesSnap.docs) {
    batch.update(snap.ref, { [countField]: tally[snap.id] ?? 0 })
  }

  let outcome = null
  let secondRoundOptional: boolean | null = null
  if (round !== 'nomination') {
    // 이번 라운드 투표 대상 후보만 판정 풀에 포함
    const requiredStatus = CANDIDATE_STATUS_FOR_ROUND[round]
    const pool: CandidateLike[] = candidatesSnap.docs
      .filter((d) => d.get('status') === requiredStatus)
      .map((d) => ({
        id: d.id,
        position_type: d.get('position_type') as PositionType,
        gender: d.get('gender') as Gender,
      }))

    const thresholds = await loadThresholds(churchId)
    const totalBallotsByPosition = countBallotsByPosition(ballots) // 제14조① 직분별 분모
    const positions = (election.positions ?? {}) as Partial<Record<PositionType, PositionQuota>>
    outcome = determineElected({
      candidates: pool,
      tally,
      totalBallotsByPosition,
      positions,
      thresholds,
    })

    const electedByPosition: Record<string, Record<string, string[]>> = {}
    let totalSeats = 0
    let totalElected = 0
    for (const [position, byGender] of Object.entries(outcome)) {
      electedByPosition[position] = {}
      for (const [gender, seat] of Object.entries(byGender)) {
        const quota = positions[position as PositionType]
        totalSeats += quota?.[gender as Gender] ?? 0
        totalElected += seat.elected.length
        electedByPosition[position][gender] = seat.elected
        for (const id of seat.elected) {
          batch.update(base.collection('candidates').doc(id), { status: 'elected' })
        }
        if (round === 'first') {
          // 제9조③: 미달 시 미달 인원의 2배수만 2차 투표 대상으로 공천 (득표순)
          const secondPool = seat.deficit > 0 ? seat.notElected.slice(0, seat.deficit * 2) : []
          const secondPoolSet = new Set(secondPool)
          for (const id of seat.notElected) {
            batch.update(base.collection('candidates').doc(id), {
              status: secondPoolSet.has(id) ? 'second_qualified' : 'not_elected',
            })
          }
        } else {
          for (const id of seat.notElected) {
            batch.update(base.collection('candidates').doc(id), { status: 'not_elected' })
          }
        }
      }
    }

    // 제9조③ 단서: 예정인원의 70% 이상 선출 시 2차 투표 생략 가능 (선관위 판단 참고용)
    secondRoundOptional =
      round === 'first' && totalSeats > 0 ? totalElected >= totalSeats * 0.7 : null

    batch.update(base, {
      [`results.${round}`]: {
        total_ballots: totalBallots,
        ballots_by_position: totalBallotsByPosition,
        counted_at: FieldValue.serverTimestamp(),
        elected: electedByPosition,
      },
    })
  }

  await batch.commit()
  writeAudit(churchId, electionId, {
    action: 'count_votes',
    actorUid: uid,
    details: { round, totalBallots },
  })

  return { totalBallots, tally, outcome, secondRoundOptional }
})
