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
  /** 직분별 총 투표수 — 피택 기준 분모 (규정 제14조①) */
  ballots_by_position?: Partial<Record<PositionType, number>>
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
  /** 기존 항존직 구분 — 공천투표 참여 자격 판정 (제8조①, 은퇴 포함) */
  voter_type?: 'elder' | 'deacon' | 'kwansa' | 'member'
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

/** 후보 전제 봉사 경로 — 규정 제4조: "집사로 5년 이상 또는 협동안수집사로 3년 이상" 등 복수 경로 */
export interface ServicePath {
  /** position 또는 detailed_position이 목록에 있으면 이 경로에 해당 */
  positions: string[]
  minYears: number
}

export interface PositionRule {
  /** 'all'이면 남녀 모두 후보 가능 (장로 기본값) */
  gender: Gender | 'all'
  minAge: number
  /** 규정(제4조)에는 상한 없음 — 시무 정년(만 70세) 고려한 운영값. 당회 확인 대상 */
  maxAge: number
  minBaptismYears: number
  minAttendanceRate: number // 0~1 (제8조③1: 최근 2년 주일성수 70%)
  minTitheRate: number // 0~1 (제8조③2: 최근 2년 십일조 70%)
  /** 후보 전제 직분·봉사 경로 (제4조) — 하나라도 충족하면 됨 */
  servicePaths: ServicePath[]
  threshold: ElectionThreshold
}

export interface VoterRule {
  minAge: number
  requireBaptism: boolean
  /**
   * 등록 후 최소 출석 개월 — 규정(제3조)에는 없는 운영값(기본 0).
   * 제3조② "떠난 지 6개월 이상 미보고자 배제"는 memberClassification(서둔출석성도)으로 갈음
   */
  minAttendanceMonths: number
  /** 선거인 대상 교인 분류 (members.member_classification) — 빈 값이면 제한 없음 */
  memberClassification?: string
  /** 치리 중인 교인 배제 (제3조②) */
  excludeUnderDiscipline: boolean
}

export interface ElectionRules {
  voter: VoterRule
  positions: Record<PositionType, PositionRule>
}

/**
 * 서둔교회 기본 규정 — 항존직선거규정(2024-02-04 개정) 제3·4·9조 기준.
 * 교회별 settings/electionRules로 오버라이드
 */
export const DEFAULT_ELECTION_RULES: ElectionRules = {
  voter: {
    minAge: 18, // 제3조① 18세 이상 무흠 세례교인(입교인)
    requireBaptism: true,
    minAttendanceMonths: 0, // 규정에 등록기간 요건 없음 (제3조②는 분류로 갈음)
    memberClassification: '서둔출석성도',
    excludeUnderDiscipline: true,
  },
  positions: {
    elder: {
      // 제4조① — 성별 제한 없음. 여성장로 20% 정원 배분은 Election.positions에서 설정
      gender: 'all',
      minAge: 40,
      maxAge: 70,
      minBaptismYears: 7,
      minAttendanceRate: 0.7,
      minTitheRate: 0.7,
      // 제4조①: 안수집사·권사·협동장로·협동권사로 5년 이상 봉사
      servicePaths: [
        { positions: ['안수집사', '권사', '시무권사', '협동장로', '협동권사'], minYears: 5 },
      ],
      threshold: { numerator: 2, denominator: 3, inclusive: true }, // 제9조① 2/3 이상
    },
    deacon: {
      gender: 'male', // 제4조② 남자
      minAge: 35,
      maxAge: 70,
      minBaptismYears: 5,
      minAttendanceRate: 0.7,
      minTitheRate: 0.7,
      // 제4조②: 집사 5년 이상 또는 협동안수집사 3년 이상
      servicePaths: [
        { positions: ['집사'], minYears: 5 },
        { positions: ['협동안수집사'], minYears: 3 },
      ],
      threshold: { numerator: 1, denominator: 2, inclusive: false }, // 제9조② 과반
    },
    kwansa: {
      gender: 'female', // 제4조③ 여자
      minAge: 35,
      maxAge: 70,
      minBaptismYears: 5,
      minAttendanceRate: 0.7,
      minTitheRate: 0.7,
      // 제4조③: 집사 5년 이상 또는 협동권사 3년 이상
      servicePaths: [
        { positions: ['집사'], minYears: 5 },
        { positions: ['협동권사'], minYears: 3 },
      ],
      threshold: { numerator: 1, denominator: 2, inclusive: false }, // 제9조② 과반
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
