/** @vitest-environment node */
// 집계·피택 판정 순수 로직 검증 (functions/src/election/tally.ts)
// 규정 근거: 제9조(2/3·과반·2차 배수), 제14조(직분별 총 투표수), 제15조(백지 불포함)
import { describe, expect, it } from 'vitest'
import {
  countBallotsByPosition,
  determineElected,
  meetsThreshold,
  tallyBallots,
  type BallotLike,
  type CandidateLike,
} from '../../functions/src/election/tally'
import { DEFAULT_THRESHOLDS } from '../../functions/src/election/types'

describe('tallyBallots', () => {
  it('직분·성별 몫을 가로질러 후보별 득표수를 집계한다', () => {
    const ballots: BallotLike[] = [
      { selections: { elder: { male: ['a', 'b'], female: ['f1'] } } },
      { selections: { elder: { male: ['a'] }, kwansa: { female: ['k1'] } } },
      { selections: { elder: { female: ['f1'] } } },
    ]
    expect(tallyBallots(ballots)).toEqual({ a: 2, b: 1, f1: 2, k1: 1 })
  })

  it('빈 투표지는 무시한다', () => {
    expect(tallyBallots([{ selections: {} }])).toEqual({})
  })
})

describe('countBallotsByPosition — 직분별 총 투표수 (제14조①)', () => {
  it('직분에 기표한 투표지만 그 직분의 분모에 포함한다 (제15조① 백지 불포함)', () => {
    const ballots: BallotLike[] = [
      { selections: { elder: { male: ['a'] }, deacon: { male: ['d1'] } } },
      { selections: { elder: { female: ['f1'] } } }, // deacon 미기표 → deacon 분모 제외
      { selections: { elder: { male: [] } } }, // 빈 배열 = 미기표
    ]
    expect(countBallotsByPosition(ballots)).toEqual({ elder: 2, deacon: 1 })
  })
})

describe('meetsThreshold — 피택 기준 (제9조)', () => {
  const elder = DEFAULT_THRESHOLDS.elder // 2/3 이상 (inclusive)
  const deacon = DEFAULT_THRESHOLDS.deacon // 과반 (초과)

  it('장로 2/3: 정확히 2/3도 충족(이상)', () => {
    expect(meetsThreshold(20, 30, elder)).toBe(true) // 20/30 = 2/3
    expect(meetsThreshold(19, 30, elder)).toBe(false)
    expect(meetsThreshold(7, 10, elder)).toBe(true) // 21 >= 20
  })

  it('과반: 정확히 절반은 미충족(초과)', () => {
    expect(meetsThreshold(5, 10, deacon)).toBe(false) // 50%는 과반 아님
    expect(meetsThreshold(6, 10, deacon)).toBe(true)
  })

  it('투표지 0장이면 아무도 피택되지 않는다', () => {
    expect(meetsThreshold(0, 0, elder)).toBe(false)
  })
})

describe('determineElected — 성별 정원 배분 피택 판정', () => {
  // 2027 장로선거 확정 정원: 총 10명 = 남 8 + 여 2 (여성 20% 정원 배분)
  const candidates: CandidateLike[] = [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `m${i + 1}`,
      position_type: 'elder' as const,
      gender: 'male' as const,
    })),
    { id: 'f1', position_type: 'elder', gender: 'female' },
    { id: 'f2', position_type: 'elder', gender: 'female' },
    { id: 'f3', position_type: 'elder', gender: 'female' },
  ]
  const positions = { elder: { male: 8, female: 2 } }
  const thresholds = DEFAULT_THRESHOLDS
  const BALLOTS = { elder: 30 } // 2/3 기준 = 20표 이상

  it('남성 몫 8·여성 몫 2가 독립적으로 판정된다', () => {
    const tally = {
      m1: 29, m2: 28, m3: 27, m4: 26, m5: 25, m6: 24, m7: 23, m8: 20, // 8명 충족
      m9: 19, m10: 5, // 미충족
      f1: 25, f2: 21, f3: 20, // 3명 모두 충족하지만 여성 몫은 2석
    }
    const outcome = determineElected({
      candidates, tally, totalBallotsByPosition: BALLOTS, positions, thresholds,
    })

    expect(outcome.elder!.male.elected).toHaveLength(8)
    expect(outcome.elder!.male.deficit).toBe(0)
    expect(outcome.elder!.female.elected).toEqual(['f1', 'f2']) // 상위 2명만
    expect(outcome.elder!.female.notElected).toContain('f3') // 기준 충족해도 몫 초과
  })

  it('기준 충족자가 정원보다 적으면 충족자만 피택되고 deficit이 남는다', () => {
    const tally = {
      m1: 26, m2: 21, m3: 19, m4: 18, m5: 17, m6: 10, m7: 9, m8: 8, m9: 7, m10: 6,
      f1: 22, f2: 12, f3: 3,
    }
    const outcome = determineElected({
      candidates, tally, totalBallotsByPosition: BALLOTS, positions, thresholds,
    })

    expect(outcome.elder!.male.elected).toEqual(['m1', 'm2']) // 2명만 2/3 충족
    expect(outcome.elder!.male.deficit).toBe(6) // 2차 공천 = 6×2=12명 (제9조③)
    expect(outcome.elder!.male.notElected[0]).toBe('m3') // 득표순 정렬 (2차 풀 산출용)
    expect(outcome.elder!.female.elected).toEqual(['f1'])
    expect(outcome.elder!.female.deficit).toBe(1)
  })

  it('여성 후보는 남성 몫 정원과 무관하게 여성 몫에서만 경쟁한다', () => {
    const tally = {
      f1: 30, f2: 29, f3: 28, // 여성이 전체 상위여도 여성 몫 2석
      m1: 22, m2: 21, m3: 20, m4: 20, m5: 20, m6: 20, m7: 20, m8: 20, m9: 5, m10: 4,
    }
    const outcome = determineElected({
      candidates, tally, totalBallotsByPosition: BALLOTS, positions, thresholds,
    })

    expect(outcome.elder!.female.elected).toEqual(['f1', 'f2'])
    expect(outcome.elder!.female.notElected).toContain('f3')
    expect(outcome.elder!.male.elected).toHaveLength(8)
  })

  it('정원 경계 동점이면 tieAtBoundary로 표시한다 (자동 확정 금지 — 임직일순·연장자순 수동 판정)', () => {
    const tally = {
      m1: 29, m2: 28, m3: 27, m4: 26, m5: 25, m6: 24, m7: 21, m8: 21, m9: 21, m10: 3,
      f1: 25, f2: 21, f3: 3,
    } // m7·m8·m9 동점(21표)이 7·8번째 자리를 다툼
    const outcome = determineElected({
      candidates, tally, totalBallotsByPosition: BALLOTS, positions, thresholds,
    })

    expect(outcome.elder!.male.tieAtBoundary).toBe(true)
    expect(outcome.elder!.female.tieAtBoundary).toBe(false)
  })

  it('직분별 분모가 다르면 각자의 분모로 판정한다 (제14조①)', () => {
    const mixed: CandidateLike[] = [
      { id: 'e1', position_type: 'elder', gender: 'male' },
      { id: 'd1', position_type: 'deacon', gender: 'male' },
    ]
    // elder 분모 30 (20표=2/3 충족), deacon 분모 10 (6표=과반 충족)
    const outcome = determineElected({
      candidates: mixed,
      tally: { e1: 20, d1: 6 },
      totalBallotsByPosition: { elder: 30, deacon: 10 },
      positions: { elder: { male: 1, female: 0 }, deacon: { male: 1, female: 0 } },
      thresholds,
    })

    expect(outcome.elder!.male.elected).toEqual(['e1'])
    expect(outcome.deacon!.male.elected).toEqual(['d1'])
  })

  it('과반 기준 직분(안수집사)도 독립 판정된다', () => {
    const deaconCandidates: CandidateLike[] = [
      { id: 'd1', position_type: 'deacon', gender: 'male' },
      { id: 'd2', position_type: 'deacon', gender: 'male' },
    ]
    const tally = { d1: 16, d2: 15 } // 총 30표: 15표=절반은 과반 아님
    const outcome = determineElected({
      candidates: deaconCandidates,
      tally,
      totalBallotsByPosition: { deacon: 30 },
      positions: { deacon: { male: 2, female: 0 } },
      thresholds,
    })

    expect(outcome.deacon!.male.elected).toEqual(['d1'])
    expect(outcome.deacon!.male.notElected).toEqual(['d2'])
  })
})
