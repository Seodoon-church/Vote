// 선거 데이터 서비스 — churches/{CHURCH_ID}/elections 트리 CRUD + Functions 콜러블
// 쓰기 권한은 firestore.rules(관리자/선관위)와 Cloud Functions가 강제한다
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/lib/firebase'
import { CHURCH_ID } from '@/lib/tenant'
import type {
  Candidate,
  CandidateStatus,
  CommitteeMember,
  Election,
  ElectionStage,
  Gender,
  PositionQuota,
  PositionType,
  Voter,
  VoteRound,
} from '@/types/election'
import type { MemberRecord } from '@/lib/qualification'

const electionsCol = () => collection(db, 'churches', CHURCH_ID, 'elections')
const electionDoc = (id: string) => doc(db, 'churches', CHURCH_ID, 'elections', id)
const subCol = (electionId: string, name: string) =>
  collection(db, 'churches', CHURCH_ID, 'elections', electionId, name)

function withId<T>(snap: { id: string; data: () => unknown }): T & { id: string } {
  return { id: snap.id, ...(snap.data() as T) }
}

// ---------- 선거 ----------

export async function listElections(): Promise<Election[]> {
  const snap = await getDocs(query(electionsCol(), orderBy('created_at', 'desc'), limit(50)))
  return snap.docs.map((d) => withId<Election>(d))
}

export async function getElection(id: string): Promise<Election | null> {
  const snap = await getDoc(electionDoc(id))
  return snap.exists() ? withId<Election>(snap) : null
}

export async function createElection(params: {
  name: string
  year: number
  positions: Partial<Record<PositionType, PositionQuota>>
  createdBy: string
}): Promise<string> {
  const ref = await addDoc(electionsCol(), {
    name: params.name,
    year: params.year,
    stage: 'preparing',
    positions: params.positions,
    created_by: params.createdBy,
    created_at: Timestamp.now(),
  })
  return ref.id
}

export async function updateElectionName(id: string, name: string): Promise<void> {
  await updateDoc(electionDoc(id), { name, updated_at: Timestamp.now() })
}

export async function deleteElection(id: string): Promise<void> {
  await deleteDoc(electionDoc(id))
}

// ---------- 선관위 ----------

export async function listCommittees(
  electionId: string
): Promise<(CommitteeMember & { id: string })[]> {
  const snap = await getDocs(subCol(electionId, 'committees'))
  return snap.docs.map((d) => withId<CommitteeMember>(d))
}

/** 위원 임명 — 문서 ID = Auth uid (규칙의 exists() 판정 기준) */
export async function addCommittee(
  electionId: string,
  uid: string,
  data: Omit<CommitteeMember, 'appointed_at'>
): Promise<void> {
  await setDoc(doc(subCol(electionId, 'committees'), uid), {
    ...data,
    appointed_at: Timestamp.now(),
  })
}

export async function removeCommittee(electionId: string, uid: string): Promise<void> {
  await deleteDoc(doc(subCol(electionId, 'committees'), uid))
}

/** users 컬렉션에서 이름으로 계정 검색 (위원 임명용 uid 확인) */
export async function searchUsersByName(
  name: string
): Promise<{ uid: string; name: string; role?: string }[]> {
  const results = new Map<string, { uid: string; name: string; role?: string }>()
  for (const field of ['name', 'displayName']) {
    const snap = await getDocs(query(collection(db, 'users'), where(field, '==', name), limit(10)))
    for (const d of snap.docs) {
      results.set(d.id, {
        uid: d.id,
        name: (d.get('name') as string) || (d.get('displayName') as string) || name,
        role: d.get('role') as string | undefined,
      })
    }
  }
  return [...results.values()]
}

// ---------- 선거인 명부 ----------

export async function listVoters(electionId: string): Promise<(Voter & { id: string })[]> {
  const snap = await getDocs(subCol(electionId, 'voters'))
  return snap.docs.map((d) => withId<Voter>(d))
}

/** 적격자 일괄 등록 — Firestore batch 한도(500) 아래로 나눠 기록 */
export async function registerVotersBulk(
  electionId: string,
  voters: Omit<Voter, 'id' | 'registered_at'>[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const CHUNK = 400
  for (let i = 0; i < voters.length; i += CHUNK) {
    const batch = writeBatch(db)
    for (const voter of voters.slice(i, i + CHUNK)) {
      batch.set(doc(subCol(electionId, 'voters')), { ...voter, registered_at: Timestamp.now() })
    }
    await batch.commit()
    onProgress?.(Math.min(i + CHUNK, voters.length), voters.length)
  }
}

export async function removeVoter(electionId: string, voterId: string): Promise<void> {
  await deleteDoc(doc(subCol(electionId, 'voters'), voterId))
}

export async function clearVoters(electionId: string): Promise<void> {
  const snap = await getDocs(subCol(electionId, 'voters'))
  const CHUNK = 400
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db)
    for (const d of docs.slice(i, i + CHUNK)) batch.delete(d.ref)
    await batch.commit()
  }
}

// ---------- 후보자 ----------

export async function listCandidates(
  electionId: string
): Promise<(Candidate & { id: string })[]> {
  const snap = await getDocs(subCol(electionId, 'candidates'))
  return snap.docs.map((d) => withId<Candidate>(d))
}

export async function addCandidate(
  electionId: string,
  params: { member_id: string; name: string; position_type: PositionType; gender: Gender }
): Promise<void> {
  await addDoc(subCol(electionId, 'candidates'), {
    ...params,
    status: 'nominated',
    nomination_vote_count: 0,
    first_round_vote_count: 0,
    second_round_vote_count: 0,
    nominated_at: Timestamp.now(),
  })
}

export async function removeCandidate(electionId: string, candidateId: string): Promise<void> {
  await deleteDoc(doc(subCol(electionId, 'candidates'), candidateId))
}

/** 후보 상태 변경 (공천 확정 등) — 득표수 필드는 규칙상 클라이언트 수정 불가 */
export async function updateCandidateStatus(
  electionId: string,
  candidateId: string,
  status: CandidateStatus
): Promise<void> {
  await updateDoc(doc(subCol(electionId, 'candidates'), candidateId), { status })
}

// ---------- 교적부 ----------

/** 교적부 전체 로드 — 자격 판정용 필드만 사용 (관리자 액션에서 1회성 호출) */
export async function fetchAllMembers(): Promise<MemberRecord[]> {
  const snap = await getDocs(collection(db, 'members'))
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    return {
      id: d.id,
      name: (data.name as string) ?? '',
      gender: data.gender as string | undefined,
      birth_date: data.birth_date as string | number | undefined,
      baptism_date: data.baptism_date as string | number | undefined,
      baptism_year: (data.baptism_year ?? data['세례년']) as string | number | undefined,
      registration_date: (data.registration_date ?? data['등록일']) as string | number | undefined,
      member_classification: data.member_classification as string | undefined,
      position: data.position as string | undefined,
      detailed_position: data.detailed_position as string | undefined,
      disciplinary_status: (data.disciplinary_status ?? data['치리상태']) as string | undefined,
      service_years: data.service_years as number | undefined,
      attendance_rate: data.attendance_rate as number | undefined,
      tithe_rate: data.tithe_rate as number | undefined,
      nationality: data.nationality as string | undefined,
      is_paid_staff: data.is_paid_staff as boolean | undefined,
    }
  })
}

// ---------- Cloud Functions 콜러블 ----------

export async function callAdvanceStage(params: {
  electionId: string
  toStage: ElectionStage
  roundStartAt?: string
  roundEndAt?: string
}): Promise<void> {
  await httpsCallable(functions, 'advanceStage')({ churchId: CHURCH_ID, ...params })
}

export async function callGenerateOnsiteKey(electionId: string): Promise<string> {
  const result = await httpsCallable(functions, 'generateOnsiteKey')({
    churchId: CHURCH_ID,
    electionId,
  })
  return (result.data as { onsiteKey: string }).onsiteKey
}

export interface CountVotesResponse {
  totalBallots: number
  tally: Record<string, number>
  outcome: Partial<
    Record<
      PositionType,
      Record<
        Gender,
        { elected: string[]; notElected: string[]; deficit: number; tieAtBoundary: boolean }
      >
    >
  > | null
  secondRoundOptional: boolean | null
}

export async function callCountVotes(
  electionId: string,
  round: VoteRound
): Promise<CountVotesResponse> {
  const result = await httpsCallable(functions, 'countVotes')({
    churchId: CHURCH_ID,
    electionId,
    round,
  })
  return result.data as CountVotesResponse
}
