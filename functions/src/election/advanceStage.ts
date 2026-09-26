import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import {
  assertElectionManager,
  getElectionOrThrow,
  newOnsiteKey,
  REGION,
  sha256,
  writeAudit,
} from './helpers'
import type { ElectionStage } from './types'

/** 허용된 단계 전환 — 공천 생략(preparing→first_voting) 가능 */
const ALLOWED_TRANSITIONS: Record<ElectionStage, ElectionStage[]> = {
  preparing: ['nomination_voting', 'first_voting', 'cancelled'],
  nomination_voting: ['first_voting', 'cancelled'],
  first_voting: ['second_voting', 'completed', 'cancelled'],
  second_voting: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

interface AdvanceStageData {
  churchId: string
  electionId: string
  toStage: ElectionStage
  /** 라운드 진행 기간 (ISO 8601) — 투표 단계 진입 시 설정 */
  roundStartAt?: string
  roundEndAt?: string
}

/** 선거 단계 전환 (선관위 전용) — stage는 클라이언트 직접 수정이 규칙으로 차단되어 있다 */
export const advanceStage = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  }
  const { churchId, electionId, toStage, roundStartAt, roundEndAt } =
    (request.data ?? {}) as AdvanceStageData
  if (!churchId || !electionId || !toStage) {
    throw new HttpsError('invalid-argument', '요청 정보가 올바르지 않습니다.')
  }
  await assertElectionManager(churchId, electionId, uid)

  const electionSnap = await getElectionOrThrow(churchId, electionId)
  const fromStage = electionSnap.get('stage') as ElectionStage
  if (!ALLOWED_TRANSITIONS[fromStage]?.includes(toStage)) {
    throw new HttpsError(
      'failed-precondition',
      `허용되지 않는 단계 전환입니다: ${fromStage} → ${toStage}`
    )
  }

  const update: Record<string, unknown> = {
    stage: toStage,
    updated_at: FieldValue.serverTimestamp(),
  }
  if (roundStartAt) update.round_start_at = Timestamp.fromDate(new Date(roundStartAt))
  if (roundEndAt) update.round_end_at = Timestamp.fromDate(new Date(roundEndAt))
  if (toStage === 'completed') update.closed_at = FieldValue.serverTimestamp()

  await electionSnap.ref.update(update)
  writeAudit(churchId, electionId, {
    action: 'advance_stage',
    actorUid: uid,
    details: { from: fromStage, to: toStage },
  })

  return { stage: toStage }
})

interface GenerateOnsiteKeyData {
  churchId: string
  electionId: string
}

/**
 * 현장 인증키 발급/재발급 (선관위 전용).
 * 원문 키는 응답으로 한 번만 반환되고 서버에는 해시만 저장된다.
 */
export const generateOnsiteKey = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  }
  const { churchId, electionId } = (request.data ?? {}) as GenerateOnsiteKeyData
  if (!churchId || !electionId) {
    throw new HttpsError('invalid-argument', '요청 정보가 올바르지 않습니다.')
  }
  await assertElectionManager(churchId, electionId, uid)

  const electionSnap = await getElectionOrThrow(churchId, electionId)
  const key = newOnsiteKey()
  await electionSnap.ref.update({
    onsite_key_hash: sha256(key),
    updated_at: FieldValue.serverTimestamp(),
  })
  // 키 원문은 감사 로그에도 남기지 않는다
  writeAudit(churchId, electionId, { action: 'generate_onsite_key', actorUid: uid })

  return { onsiteKey: key }
})
