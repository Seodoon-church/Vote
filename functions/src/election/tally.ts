// 순수 집계 로직 — Firebase 의존성 없음 (루트 tests/unit/tally.test.ts에서 검증)
import type {
  ElectionThreshold,
  Gender,
  PositionQuota,
  PositionType,
  Selections,
} from './types'
import { GENDERS } from './types'

export interface BallotLike {
  selections: Selections
}

export interface CandidateLike {
  id: string
  position_type: PositionType
  gender: Gender
}

/** 투표지 전체에서 후보별 득표수 집계 */
export function tallyBallots(ballots: BallotLike[]): Record<string, number> {
  const tally: Record<string, number> = {}
  for (const ballot of ballots) {
    for (const byGender of Object.values(ballot.selections ?? {})) {
      for (const ids of Object.values(byGender ?? {})) {
        for (const id of ids ?? []) {
          tally[id] = (tally[id] ?? 0) + 1
        }
      }
    }
  }
  return tally
}

/**
 * 직분별 총 투표수 (피택 기준 분모) — 규정 제14조① "항존직 별로 분류하여 총 투표수 계산".
 * 해당 직분에 한 명도 기표하지 않은 투표지는 그 직분의 총 투표수에 불포함 (제15조① 백지 무효).
 */
export function countBallotsByPosition(
  ballots: BallotLike[]
): Partial<Record<PositionType, number>> {
  const counts: Partial<Record<PositionType, number>> = {}
  for (const ballot of ballots) {
    for (const [position, byGender] of Object.entries(ballot.selections ?? {})) {
      const marked = Object.values(byGender ?? {}).some((ids) => (ids ?? []).length > 0)
      if (marked) {
        counts[position as PositionType] = (counts[position as PositionType] ?? 0) + 1
      }
    }
  }
  return counts
}

/** 피택 기준 충족 여부 — inclusive=true: votes/total >= num/den, false: 초과 */
export function meetsThreshold(
  votes: number,
  totalBallots: number,
  threshold: ElectionThreshold
): boolean {
  if (totalBallots <= 0) return false
  const lhs = votes * threshold.denominator
  const rhs = totalBallots * threshold.numerator
  return threshold.inclusive ? lhs >= rhs : lhs > rhs
}

export interface SeatResult {
  /** 피택자 (기준 충족 + 득표순 정원 내) */
  elected: string[]
  /** 미피택자, 득표순 정렬 — 1차면 2차 공천 풀 산출 기준, 2차면 낙선 */
  notElected: string[]
  /** 미달 정원 수 — 2차 투표 공천 인원 = deficit × 2 (제9조③) */
  deficit: number
  /** 정원 경계 동점 — 자동 확정 금지, 선관위 판정(공천 순위 규칙 준용: 임직일순→연장자순) */
  tieAtBoundary: boolean
}

export type ElectionOutcome = Partial<Record<PositionType, Record<Gender, SeatResult>>>

/**
 * 성별 몫별 독립 피택 판정.
 * - 피택 기준 분모는 직분별 총 투표수 (제14조①, totalBallotsByPosition)
 * - 각 (직분, 성별) 몫에서 기준 충족자를 득표순으로 정원만큼 피택
 * - 여성장로 20% 정원 배분: positions.elder = { male: 8, female: 2 } 형태
 */
export function determineElected(params: {
  candidates: CandidateLike[]
  tally: Record<string, number>
  totalBallotsByPosition: Partial<Record<PositionType, number>>
  positions: Partial<Record<PositionType, PositionQuota>>
  thresholds: Record<PositionType, ElectionThreshold>
}): ElectionOutcome {
  const { candidates, tally, totalBallotsByPosition, positions, thresholds } = params
  const outcome: ElectionOutcome = {}

  for (const [positionKey, quota] of Object.entries(positions)) {
    const position = positionKey as PositionType
    if (!quota) continue
    const threshold = thresholds[position]
    const totalBallots = totalBallotsByPosition[position] ?? 0
    const byGender = {} as Record<Gender, SeatResult>

    for (const gender of GENDERS) {
      const seats = quota[gender] ?? 0
      const pool = candidates
        .filter((c) => c.position_type === position && c.gender === gender)
        .map((c) => ({ id: c.id, votes: tally[c.id] ?? 0 }))
        .sort((a, b) => b.votes - a.votes)

      const qualified = pool.filter((c) => meetsThreshold(c.votes, totalBallots, threshold))
      const elected = qualified.slice(0, seats)
      const electedIds = new Set(elected.map((c) => c.id))

      // 정원 경계 동점: 마지막 피택자와 첫 미피택 기준충족자가 동점이면 수동 판정 필요
      const boundaryTie =
        elected.length === seats &&
        qualified.length > seats &&
        qualified[seats].votes === elected[elected.length - 1].votes

      byGender[gender] = {
        elected: elected.map((c) => c.id),
        notElected: pool.filter((c) => !electedIds.has(c.id)).map((c) => c.id),
        deficit: seats - elected.length,
        tieAtBoundary: boundaryTie,
      }
    }

    outcome[position] = byGender
  }

  return outcome
}
