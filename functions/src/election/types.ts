// Functions 측 도메인 타입 — 웹(src/types/election.ts)과 동기 유지할 것

export type PositionType = 'elder' | 'deacon' | 'kwansa'
export type Gender = 'male' | 'female'
export type VoteRound = 'nomination' | 'first' | 'second'
export type ElectionStage =
  | 'preparing'
  | 'nomination_voting'
  | 'first_voting'
  | 'second_voting'
  | 'completed'
  | 'cancelled'

export interface PositionQuota {
  male: number
  female: number
}

/** 피택 기준 — inclusive=true면 "이상"(장로 2/3 이상), false면 "초과"(과반수) */
export interface ElectionThreshold {
  numerator: number
  denominator: number
  inclusive: boolean
}

/** 직분·성별 몫별 선택 후보 id */
export type Selections = Partial<Record<PositionType, Partial<Record<Gender, string[]>>>>

export const POSITION_TYPES: PositionType[] = ['elder', 'deacon', 'kwansa']
export const GENDERS: Gender[] = ['male', 'female']
export const VOTE_ROUNDS: VoteRound[] = ['nomination', 'first', 'second']

export const ROUND_TO_STAGE: Record<VoteRound, ElectionStage> = {
  nomination: 'nomination_voting',
  first: 'first_voting',
  second: 'second_voting',
}

export const HAS_VOTED_FIELD: Record<VoteRound, string> = {
  nomination: 'has_voted_nomination',
  first: 'has_voted_first',
  second: 'has_voted_second',
}

export const VOTE_COUNT_FIELD: Record<VoteRound, string> = {
  nomination: 'nomination_vote_count',
  first: 'first_round_vote_count',
  second: 'second_round_vote_count',
}

/** 라운드별 투표 대상 후보 상태 */
export const CANDIDATE_STATUS_FOR_ROUND: Record<VoteRound, string> = {
  nomination: 'nominated',
  first: 'qualified',
  second: 'second_qualified',
}

/** 규정 미설정 시 기본 피택 기준 — 장로 2/3 이상, 안수집사·권사 과반(초과) */
export const DEFAULT_THRESHOLDS: Record<PositionType, ElectionThreshold> = {
  elder: { numerator: 2, denominator: 3, inclusive: true },
  deacon: { numerator: 1, denominator: 2, inclusive: false },
  kwansa: { numerator: 1, denominator: 2, inclusive: false },
}
