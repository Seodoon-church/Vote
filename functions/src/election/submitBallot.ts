import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import {
  db,
  electionRef,
  findVoterForUser,
  getElectionOrThrow,
  newVoteSeal,
  REGION,
  sha256,
  writeAudit,
} from './helpers'
import type { Gender, PositionQuota, PositionType, Selections, VoteRound } from './types'
import {
  CANDIDATE_STATUS_FOR_ROUND,
  GENDERS,
  HAS_VOTED_FIELD,
  ROUND_TO_STAGE,
  VOTE_ROUNDS,
} from './types'

interface SubmitBallotData {
  churchId: string
  electionId: string
  round: VoteRound
  selections: Selections
  onsiteKey?: string
}

/**
 * 무기명 투표 제출 — 유일한 투표지 생성 경로.
 * 트랜잭션으로 중복 투표를 차단하고, 투표지(ballots)에는 투표자 식별 정보를
 * 일절 남기지 않는다. vote_seal은 투표자에게만 반환되는 확인증이다.
 */
export const submitBallot = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  }

  const { churchId, electionId, round, selections, onsiteKey } =
    (request.data ?? {}) as SubmitBallotData
  if (!churchId || !electionId || !VOTE_ROUNDS.includes(round)) {
    throw new HttpsError('invalid-argument', '요청 정보가 올바르지 않습니다.')
  }
  if (!selections || typeof selections !== 'object' || Object.keys(selections).length === 0) {
    throw new HttpsError('invalid-argument', '투표 내용이 비어 있습니다.')
  }

  const electionSnap = await getElectionOrThrow(churchId, electionId)
  const election = electionSnap.data()!

  // 1. 단계 검증 — 서버 데이터 기준
  if (election.stage !== ROUND_TO_STAGE[round]) {
    throw new HttpsError('failed-precondition', '현재 진행 중인 투표 단계가 아닙니다.')
  }

  // 2. 기간 검증 — 서버 시각 기준 (클라이언트 시계 신뢰 금지)
  const now = Timestamp.now()
  if (election.round_start_at && now.toMillis() < election.round_start_at.toMillis()) {
    throw new HttpsError('failed-precondition', '투표가 아직 시작되지 않았습니다.')
  }
  if (election.round_end_at && now.toMillis() > election.round_end_at.toMillis()) {
    throw new HttpsError('failed-precondition', '투표가 마감되었습니다.')
  }

  // 3. 현장 인증키 검증 (현장 투표 전용 선거)
  if (election.onsite_key_hash) {
    if (!onsiteKey || sha256(String(onsiteKey)) !== election.onsite_key_hash) {
      throw new HttpsError('permission-denied', '현장 인증 키가 올바르지 않습니다.')
    }
  }

  // 4. 선거인 자격 검증
  const voterSnap = await findVoterForUser(churchId, electionId, uid)
  if (!voterSnap) {
    throw new HttpsError('permission-denied', '선거인 명부에 등록되어 있지 않습니다.')
  }
  if (voterSnap.get('is_eligible') === false) {
    throw new HttpsError('permission-denied', '선거권이 없습니다.')
  }
  // 공천투표는 항존직(은퇴 포함)만 참여 (규정 제8조①)
  if (round === 'nomination' && !['elder', 'deacon', 'kwansa'].includes(voterSnap.get('voter_type'))) {
    throw new HttpsError('permission-denied', '공천투표는 항존직(은퇴 포함)만 참여할 수 있습니다.')
  }

  // 5. 선택 내용 검증 — 정원 초과·중복·후보 상태 확인
  const positions = (election.positions ?? {}) as Partial<Record<PositionType, PositionQuota>>
  const requiredStatus = CANDIDATE_STATUS_FOR_ROUND[round]
  const candidatesCol = electionRef(churchId, electionId).collection('candidates')

  for (const [positionKey, byGender] of Object.entries(selections)) {
    const position = positionKey as PositionType
    const quota = positions[position]
    if (!quota) {
      throw new HttpsError('invalid-argument', `이 선거에 없는 직분입니다: ${positionKey}`)
    }
    for (const gender of GENDERS) {
      const ids = byGender?.[gender] ?? []
      if (ids.length === 0) continue
      if (new Set(ids).size !== ids.length) {
        throw new HttpsError('invalid-argument', '같은 후보를 중복 선택할 수 없습니다.')
      }
      if (ids.length > (quota[gender] ?? 0)) {
        throw new HttpsError('invalid-argument', '선출 정원보다 많은 후보를 선택했습니다.')
      }
      const candidateSnaps = await db().getAll(...ids.map((id) => candidatesCol.doc(id)))
      for (const snap of candidateSnaps) {
        if (!snap.exists) {
          throw new HttpsError('invalid-argument', '존재하지 않는 후보가 포함되어 있습니다.')
        }
        if (snap.get('position_type') !== position || snap.get('gender') !== (gender as Gender)) {
          throw new HttpsError('invalid-argument', '후보의 직분·성별 몫이 일치하지 않습니다.')
        }
        if (snap.get('status') !== requiredStatus) {
          throw new HttpsError('invalid-argument', '이번 라운드의 투표 대상 후보가 아닙니다.')
        }
      }
    }
  }

  // 6. 트랜잭션 — 중복 차단 + 무기명 투표지 기록
  const voteSeal = newVoteSeal()
  const hasVotedField = HAS_VOTED_FIELD[round]
  const ballotRef = electionRef(churchId, electionId).collection('ballots').doc()

  await db().runTransaction(async (tx) => {
    const freshVoter = await tx.get(voterSnap.ref)
    if (freshVoter.get(hasVotedField) === true) {
      throw new HttpsError('already-exists', '이미 투표하셨습니다.')
    }
    tx.update(voterSnap.ref, { [hasVotedField]: true })
    // 투표지에는 투표자 식별 정보(uid·member_id·이름)를 절대 넣지 않는다
    tx.create(ballotRef, {
      vote_seal: voteSeal,
      round,
      selections,
      cast_at: FieldValue.serverTimestamp(),
    })
    // 감사 로그도 익명 — 누가 투표했는지는 voters.has_voted로만 관리
    writeAudit(churchId, electionId, { action: 'cast_ballot', details: { round } }, tx)
  })

  return { voteSeal }
})
