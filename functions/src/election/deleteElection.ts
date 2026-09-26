import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { assertChurchAdmin, db, electionRef, getElectionOrThrow, REGION } from './helpers'

interface DeleteElectionData {
  churchId: string
  electionId: string
}

/**
 * 선거 완전 삭제 (교회 관리자 전용) — 준비중/취소 선거만.
 * ballots·auditLogs는 규칙상 클라이언트가 지울 수 없으므로(무기명·감사 보호)
 * Admin SDK recursiveDelete로 하위 컬렉션까지 정리한다.
 * 완료(completed) 선거는 기록 보존을 위해 삭제 불가.
 */
export const deleteElectionDeep = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  }
  const { churchId, electionId } = (request.data ?? {}) as DeleteElectionData
  if (!churchId || !electionId) {
    throw new HttpsError('invalid-argument', '요청 정보가 올바르지 않습니다.')
  }
  await assertChurchAdmin(uid)

  const electionSnap = await getElectionOrThrow(churchId, electionId)
  const stage = electionSnap.get('stage')
  if (stage !== 'preparing' && stage !== 'cancelled') {
    throw new HttpsError(
      'failed-precondition',
      '준비중 또는 취소된 선거만 삭제할 수 있습니다. 진행 중인 선거는 먼저 취소하세요.'
    )
  }

  await db().recursiveDelete(electionRef(churchId, electionId))
  console.log(`[deleteElectionDeep] ${churchId}/${electionId} 삭제 (stage=${stage}, by=${uid})`)
  return { deleted: true }
})
