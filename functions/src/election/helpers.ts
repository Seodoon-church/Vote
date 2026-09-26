import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import type {
  CollectionReference,
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import type { ElectionThreshold, PositionType } from './types'
import { DEFAULT_THRESHOLDS, POSITION_TYPES } from './types'

export const REGION = 'asia-northeast3'

/** 교회 관리자 역할 — seodoon users/{uid}.role 기준 */
const ADMIN_ROLES = ['최고관리자', '관리자']

export const db = () => getFirestore()

export function electionRef(churchId: string, electionId: string): DocumentReference {
  return db().doc(`churches/${churchId}/elections/${electionId}`)
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** 무기명 투표 직인 — 투표자 정보와 무관한 순수 난수 (역추적 연결 금지) */
export function newVoteSeal(): string {
  return randomBytes(32).toString('hex')
}

/** 현장 인증키 — 6자리 숫자 */
export function newOnsiteKey(): string {
  return String(randomInt(100000, 1000000))
}

export async function getElectionOrThrow(churchId: string, electionId: string) {
  const snap = await electionRef(churchId, electionId).get()
  if (!snap.exists) {
    throw new HttpsError('not-found', '선거를 찾을 수 없습니다.')
  }
  return snap
}

/** 교회 관리자인지 검증 (선관위 불포함 — 선거 생성/삭제 등 관리자 전용 작업) */
export async function assertChurchAdmin(uid: string): Promise<void> {
  const userSnap = await db().doc(`users/${uid}`).get()
  if (!userSnap.exists || !ADMIN_ROLES.includes(userSnap.get('role'))) {
    throw new HttpsError('permission-denied', '교회 관리자 권한이 없습니다.')
  }
}

/** 교회 관리자 또는 해당 선거 선관위원인지 검증 */
export async function assertElectionManager(
  churchId: string,
  electionId: string,
  uid: string
): Promise<void> {
  const [userSnap, committeeSnap] = await Promise.all([
    db().doc(`users/${uid}`).get(),
    electionRef(churchId, electionId).collection('committees').doc(uid).get(),
  ])
  const isAdmin = userSnap.exists && ADMIN_ROLES.includes(userSnap.get('role'))
  if (!isAdmin && !committeeSnap.exists) {
    throw new HttpsError('permission-denied', '선거 관리 권한이 없습니다.')
  }
}

/**
 * 로그인 사용자의 선거인 문서 조회 —
 * ① voters.uid == auth uid ② users/{uid}.member_id → voters.member_id 순서로 대조
 */
export async function findVoterForUser(
  churchId: string,
  electionId: string,
  uid: string
): Promise<DocumentSnapshot | null> {
  const voters = electionRef(churchId, electionId).collection('voters')

  const byUid = await voters.where('uid', '==', uid).limit(1).get()
  if (!byUid.empty) return byUid.docs[0]

  const userSnap = await db().doc(`users/${uid}`).get()
  const memberId = userSnap.exists ? userSnap.get('member_id') : null
  if (memberId) {
    const byMember = await voters.where('member_id', '==', memberId).limit(1).get()
    if (!byMember.empty) return byMember.docs[0]
  }
  return null
}

/** 테넌트 규정(settings/electionRules)에서 피택 기준 로드, 없으면 기본값 */
export async function loadThresholds(
  churchId: string
): Promise<Record<PositionType, ElectionThreshold>> {
  const snap = await db().doc(`churches/${churchId}/settings/electionRules`).get()
  const thresholds = { ...DEFAULT_THRESHOLDS }
  if (snap.exists) {
    for (const position of POSITION_TYPES) {
      const t = snap.get(`positions.${position}.threshold`)
      if (t && typeof t.numerator === 'number' && typeof t.denominator === 'number') {
        thresholds[position] = {
          numerator: t.numerator,
          denominator: t.denominator,
          inclusive: t.inclusive ?? DEFAULT_THRESHOLDS[position].inclusive,
        }
      }
    }
  }
  return thresholds
}

export function auditCol(churchId: string, electionId: string): CollectionReference {
  return electionRef(churchId, electionId).collection('auditLogs')
}

/** 감사 로그 기록 — cast_ballot은 익명성 보호를 위해 actorUid를 넘기지 말 것 */
export function writeAudit(
  churchId: string,
  electionId: string,
  entry: { action: string; actorUid?: string; targetId?: string; details?: Record<string, unknown> },
  tx?: Transaction
): void {
  const ref = auditCol(churchId, electionId).doc()
  const data = {
    action: entry.action,
    ...(entry.actorUid ? { actor_uid: entry.actorUid } : {}),
    ...(entry.targetId ? { target_id: entry.targetId } : {}),
    ...(entry.details ? { details: entry.details } : {}),
    created_at: FieldValue.serverTimestamp(),
  }
  if (tx) {
    tx.create(ref, data)
  } else {
    void ref.create(data)
  }
}
