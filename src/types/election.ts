import type { Timestamp } from 'firebase/firestore'

// ============================================================
// Vote 도메인 모델 — churches/{churchId}/elections/{electionId} 트리
// 설계 원본: seodun-election-system (vote_seal 무기명 이중분리)
// 상세 설계: seodoon/docs/PLAN.md (2026-09-26)
// ============================================================

export type PositionType = 'elder' | 'deacon' | 'kwansa'

/** members.gender('남'|'여')는 명부 등록 시점에 이 값으로 변환해 저장한다 */
export type Gender = 'male' | 'female'

export type ElectionStage =
  | 'preparing'
  | 'nomination_voting'
  | 'first_voting'
  | 'second_voting'
  | 'completed'
  | 'cancelled'

export type VoteRound = 'nomination' | 'first' | 'second'

/** 성별 정원 배분 — 예: 여성장로 20% 결의 = { male: 4, female: 1 } */
export interface PositionQuota {
  male: number
  female: number
}

/** 피택 기준 분수 — inclusive=true면 "이상"(장로 2/3 이상), false면 "초과"(과반수) */
export interface ElectionThreshold {
  numerator: number
  denominator: number
  inclusive: boolean
}

export interface Election {
  id?: string
  name: string // 예: "2027년 항존직 선거"
  year: number
  stage: ElectionStage
  /** 직분별·성별 몫별 선출 정원. 성별 몫은 각각 독립적으로 피택 판정한다 */
  positions: Partial<Record<PositionType, PositionQuota>>
  /** 라운드 진행 기간 — 검증은 Functions 서버 시각 기준 */
  round_start_at?: Timestamp
  round_end_at?: Timestamp
  /** 현장 투표 인증키 해시 — 원문은 저장하지 않으며 검증은 Functions 전용 */
  onsite_key_hash?: string
  /** 라운드별 확정 결과 — countVotes Function만 기록 */
  results?: Partial<Record<VoteRound, RoundResult>>
  closed_at?: Timestamp
  created_by: string
  created_at: Timestamp
  updated_at?: Timestamp
}

export interface RoundResult {
  total_ballots: number
  counted_at: Timestamp
  /** 직분·성별 몫별 피택자 candidate id 목록 */
  elected: Partial<Record<PositionType, Partial<Record<Gender, string[]>>>>
}

export type CommitteeRole = 'chairman' | 'secretary' | 'member' | 'observer'

/** committees/{uid} — 문서 ID가 Firebase Auth uid (규칙에서 exists()로 판정) */
export interface CommitteeMember {
  member_id: string
  name: string
  role: CommitteeRole
  appointed_at: Timestamp
}

export interface Voter {
  id?: string
  member_id: string
  /** Firebase Auth uid — 투표 시 본인 대조용 (Functions에서 검증) */
  uid?: string
  name: string
  gender: Gender
  is_eligible: boolean
  ineligibility_reason?: string
  // 아래 필드는 Functions 전용 (rules로 클라이언트 수정 차단)
  has_voted_nomination: boolean
  has_voted_first: boolean
  has_voted_second: boolean
  registered_at: Timestamp
}

export type CandidateStatus =
  | 'nominated' // 공천 후보
  | 'qualified' // 공천 통과 → 1차 투표 대상
  | 'disqualified' // 자격 미달 탈락
  | 'second_qualified' // 1차 미피택 → 2차 투표 대상
  | 'elected' // 피택
  | 'not_elected' // 낙선

export interface Candidate {
  id?: string
  member_id: string
  name: string
  position_type: PositionType
  /** 성별 몫 판정 기준 — 여성 후보는 여성 몫에서만 경쟁 */
  gender: Gender
  status: CandidateStatus
  // 득표수는 countVotes Function만 기록
  nomination_vote_count: number
  first_round_vote_count: number
  second_round_vote_count: number
  nominated_at: Timestamp
}

/**
 * 무기명 투표지 — voter 식별 정보(uid·member_id·이름)를 절대 포함하지 않는다.
 * vote_seal은 투표확인증 대조용일 뿐 voters 문서와 역추적 연결이 없어야 한다.
 * 클라이언트 접근 전면 금지, submitBallot Function만 생성.
 */
export interface Ballot {
  id?: string
  vote_seal: string
  round: VoteRound
  /** 직분·성별 몫별 선택 후보 id — 예: { elder: { male: [..], female: [..] } } */
  selections: Partial<Record<PositionType, Partial<Record<Gender, string[]>>>>
  cast_at: Timestamp
}

export interface AuditLog {
  id?: string
  action: string // 'create_election' | 'register_voters' | 'cast_ballot' | 'count_votes' | 'advance_stage' | ...
  actor_uid?: string // cast_ballot은 익명성 보호를 위해 actor를 기록하지 않는다
  target_id?: string
  details?: Record<string, unknown>
  created_at: Timestamp
}

// ------------------------------------------------------------
// churches/{churchId}/settings/electionRules — 테넌트별 규정 설정
// ------------------------------------------------------------

export interface PositionRule {
  /** 'all'이면 남녀 모두 후보 가능 (장로 기본값) */
  gender: Gender | 'all'
  minAge: number
  maxAge: number
  minBaptismYears: number
  minServiceYears: number
  minAttendanceRate: number // 0~1
  minTitheRate: number // 0~1
  /** 후보 전제 현재 직분 — position 또는 detailed_position이 목록에 있으면 충족 */
  eligibleCurrentPositions: string[]
  threshold: ElectionThreshold
}

export interface VoterRule {
  minAge: number
  requireBaptism: boolean
  minAttendanceMonths: number
  /** 선거인 대상 교인 분류 (members.member_classification) — 빈 값이면 제한 없음 */
  memberClassification?: string
  /** 치리 중인 교인 배제 */
  excludeUnderDiscipline: boolean
}

export interface ElectionRules {
  voter: VoterRule
  positions: Record<PositionType, PositionRule>
}

/** 서둔교회 기본 규정 — 교회별 settings/electionRules로 오버라이드 */
export const DEFAULT_ELECTION_RULES: ElectionRules = {
  voter: {
    minAge: 18,
    requireBaptism: true,
    minAttendanceMonths: 6,
    memberClassification: '서둔출석성도',
    excludeUnderDiscipline: true,
  },
  positions: {
    elder: {
      gender: 'all', // 여성장로 허용 — 정원 배분은 Election.positions에서 설정
      minAge: 40,
      maxAge: 70,
      minBaptismYears: 7,
      minServiceYears: 5,
      minAttendanceRate: 0.7,
      minTitheRate: 0.7,
      eligibleCurrentPositions: ['안수집사', '협동안수집사', '시무권사', '협동권사'],
      threshold: { numerator: 2, denominator: 3, inclusive: true }, // 2/3 이상
    },
    deacon: {
      gender: 'male',
      minAge: 35,
      maxAge: 70,
      minBaptismYears: 5,
      minServiceYears: 5,
      minAttendanceRate: 0.7,
      minTitheRate: 0.7,
      eligibleCurrentPositions: ['집사'],
      threshold: { numerator: 1, denominator: 2, inclusive: false }, // 과반(초과)
    },
    kwansa: {
      gender: 'female',
      minAge: 35,
      maxAge: 70,
      minBaptismYears: 5,
      minServiceYears: 5,
      minAttendanceRate: 0.7,
      minTitheRate: 0.7,
      eligibleCurrentPositions: ['집사'],
      threshold: { numerator: 1, denominator: 2, inclusive: false }, // 과반(초과)
    },
  },
}

export const POSITION_LABELS: Record<PositionType, string> = {
  elder: '장로',
  deacon: '안수집사',
  kwansa: '권사',
}

export const STAGE_LABELS: Record<ElectionStage, string> = {
  preparing: '준비중',
  nomination_voting: '공천투표',
  first_voting: '1차투표',
  second_voting: '2차투표',
  completed: '완료',
  cancelled: '취소',
}

export const GENDER_LABELS: Record<Gender, string> = {
  male: '남',
  female: '여',
}
