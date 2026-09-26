/** @vitest-environment node */
// 집계·피택 판정 순수 로직 검증 (functions/src/election/tally.ts)
import { describe, expect, it } from 'vitest'
import {
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

describe('meetsThreshold — 피택 기준', () => {
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
  // 2027 장로선거 시나리오: 장로 5명 = 남 4 + 여 1 (여성 20% 정원 배분)
  const candidates: CandidateLike[] = [
    { id: 'm1', position_type: 'elder', gender: 'male' },
    { id: 'm2', position_type: 'elder', gender: 'male' },
    { id: 'm3', position_type: 'elder', gender: 'male' },
    { id: 'm4', position_type: 'elder', gender: 'male' },
    { id: 'm5', position_type: 'elder', gender: 'male' },
    { id: 'f1', position_type: 'elder', gender: 'female' },
    { id: 'f2', position_type: 'elder', gender: 'female' },
  ]
  const positions = { elder: { male: 4, female: 1 } }
  const thresholds = DEFAULT_THRESHOLDS

  it('남성 몫·여성 몫이 독립적으로 판정된다', () => {
    // 총 30표. 2/3 기준 = 20표 이상
    const tally = { m1: 28, m2: 25, m3: 22, m4: 20, m5: 19, f1: 21, f2: 18 }
    const outcome = determineElected({ candidates, tally, totalBallots: 30, positions, thresholds })

    expect(outcome.elder!.male.elected).toEqual(['m1', 'm2', 'm3', 'm4']) // 20표(경계 포함)까지 피택
    expect(outcome.elder!.male.notElected).toEqual(['m5'])
    expect(outcome.elder!.female.elected).toEqual(['f1']) // 여성 몫 1석
    expect(outcome.elder!.female.notElected).toEqual(['f2'])
  })

  it('기준 충족자가 정원보다 적으면 충족자만 피택된다', () => {
    const tally = { m1: 26, m2: 21, m3: 10, m4: 9, m5: 8, f1: 12, f2: 5 }
    const outcome = determineElected({ candidates, tally, totalBallots: 30, positions, thresholds })

    expect(outcome.elder!.male.elected).toEqual(['m1', 'm2']) // 2명만 2/3 충족
    expect(outcome.elder!.female.elected).toEqual([]) // 여성 몫 미충원 (2차 대상)
    expect(outcome.elder!.female.notElected).toEqual(['f1', 'f2'])
  })

  it('여성 후보는 남성 몫 정원과 무관하게 여성 몫에서만 경쟁한다', () => {
    // 여성 f1이 전체 1등이어도 여성 몫 1석만 차지, 남성 몫은 남성끼리
    const tally = { f1: 30, f2: 29, m1: 22, m2: 21, m3: 20, m4: 20, m5: 5 }
    const outcome = determineElected({ candidates, tally, totalBallots: 30, positions, thresholds })

    expect(outcome.elder!.female.elected).toEqual(['f1'])
    expect(outcome.elder!.female.notElected).toContain('f2') // 기준 충족해도 여성 몫 1석 초과
    expect(outcome.elder!.male.elected).toHaveLength(4)
  })

  it('정원 경계 동점이면 tieAtBoundary로 표시한다 (자동 확정 금지)', () => {
    const tally = { m1: 28, m2: 25, m3: 22, m4: 21, m5: 21, f1: 21, f2: 3 }
    const outcome = determineElected({ candidates, tally, totalBallots: 30, positions, thresholds })

    expect(outcome.elder!.male.tieAtBoundary).toBe(true) // m4·m5 동점(21표)이 4번째 자리를 다툼
    expect(outcome.elder!.female.tieAtBoundary).toBe(false)
  })

  it('과반 기준 직분(안수집사)도 독립 판정된다', () => {
    const deaconCandidates: CandidateLike[] = [
      { id: 'd1', position_type: 'deacon', gender: 'male' },
      { id: 'd2', position_type: 'deacon', gender: 'male' },
    ]
    const tally = { d1: 16, d2: 15 } // 총 30표: 과반=16표 이상(15 초과)
    const outcome = determineElected({
      candidates: deaconCandidates,
      tally,
      totalBallots: 30,
      positions: { deacon: { male: 2, female: 0 } },
      thresholds,
    })

    expect(outcome.deacon!.male.elected).toEqual(['d1'])
    expect(outcome.deacon!.male.notElected).toEqual(['d2']) // 정확히 절반은 과반 아님
  })
})
