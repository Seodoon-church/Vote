import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { findVoterForUser, REGION } from './helpers'

interface GetVoterStatusData {
  churchId: string
  electionId: string
}

/**
 * 로그인 사용자의 선거인 상태 조회 — 투표 화면 진입용.
 * voters 컬렉션은 명부 보호를 위해 클라이언트 읽기가 차단되어 있어(관리자 전용)
 * 본인 상태만 이 콜러블로 노출한다.
 */
export const getVoterStatus = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.')
  }
  const { churchId, electionId } = (request.data ?? {}) as GetVoterStatusData
  if (!churchId || !electionId) {
    throw new HttpsError('invalid-argument', '요청 정보가 올바르지 않습니다.')
  }

  const voterSnap = await findVoterForUser(churchId, electionId, uid)
  if (!voterSnap) {
    return { registered: false }
  }
  return {
    registered: true,
    name: voterSnap.get('name') ?? null,
    voterType: voterSnap.get('voter_type') ?? null,
    eligible: voterSnap.get('is_eligible') !== false,
    hasVoted: {
      nomination: voterSnap.get('has_voted_nomination') === true,
      first: voterSnap.get('has_voted_first') === true,
      second: voterSnap.get('has_voted_second') === true,
    },
  }
})
