/** @vitest-environment node */
// 자격 엔진 검증 — 성별 규칙·만 나이 경계·Excel 시리얼 날짜·데이터 미비 처리
import { describe, expect, it } from 'vitest'
import {
  assessCandidate,
  assessVoter,
  calcBaptismYears,
  calcFullAge,
  mapGender,
  parseMemberDate,
  resolveVoterType,
  type MemberRecord,
} from '@/lib/qualification'
import { DEFAULT_ELECTION_RULES } from '@/types/election'

const TODAY = new Date('2026-09-26')
const RULES = DEFAULT_ELECTION_RULES

/** 기본 적격 교인 (서둔출석성도·성인·세례·등록 충분) */
function member(overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id: 'm-1',
    name: '홍길동',
    gender: '남',
    birth_date: '1975-05-10',
    baptism_date: '2000-03-01',
    registration_date: '2010-01-01',
    member_classification: '서둔출석성도',
    position: '집사',
    detailed_position: '',
    ...overrides,
  }
}

describe('헬퍼', () => {
  it('mapGender: 남/여만 인정', () => {
    expect(mapGender('남')).toBe('male')
    expect(mapGender('여')).toBe('female')
    expect(mapGender(undefined)).toBeNull()
    expect(mapGender('')).toBeNull()
  })

  it('parseMemberDate: Excel 시리얼 번호를 날짜로 변환', () => {
    // 25569 = 1970-01-01
    expect(parseMemberDate(25569)?.toISOString().slice(0, 10)).toBe('1970-01-01')
    expect(parseMemberDate('1975-05-10')?.getFullYear()).toBe(1975)
    expect(parseMemberDate(undefined)).toBeNull()
    expect(parseMemberDate('날짜아님')).toBeNull()
  })

  it('calcFullAge: 생일 전이면 한 살 적다 (만 나이)', () => {
    expect(calcFullAge(new Date('1986-09-26'), TODAY)).toBe(40) // 오늘이 생일
    expect(calcFullAge(new Date('1986-09-27'), TODAY)).toBe(39) // 생일 전날
  })

  it('calcBaptismYears: baptism_date 우선, 없으면 baptism_year 연도 계산', () => {
    expect(calcBaptismYears(member({ baptism_date: '2000-03-01' }), TODAY)).toBe(26)
    expect(
      calcBaptismYears(member({ baptism_date: undefined, baptism_year: 2019 }), TODAY)
    ).toBe(7)
    expect(
      calcBaptismYears(member({ baptism_date: undefined, baptism_year: undefined }), TODAY)
    ).toBeNull()
  })
})

describe('assessVoter — 선거인 자격', () => {
  it('적격 교인은 통과한다', () => {
    const result = assessVoter(member(), RULES.voter, TODAY)
    expect(result.eligible).toBe(true)
    expect(result.reasons).toEqual([])
  })

  it('서둔출석성도가 아니면 부적격', () => {
    const result = assessVoter(member({ member_classification: '타지역성도' }), RULES.voter, TODAY)
    expect(result.eligible).toBe(false)
    expect(result.reasons[0]).toContain('서둔출석성도')
  })

  it('만 18세 미만은 부적격 (경계: 생일 지난 만 18세는 적격)', () => {
    const under = assessVoter(member({ birth_date: '2009-01-01' }), RULES.voter, TODAY) // 만 17세
    expect(under.eligible).toBe(false)

    const exactly18 = assessVoter(member({ birth_date: '2008-09-26' }), RULES.voter, TODAY)
    expect(exactly18.eligible).toBe(true)
  })

  it('세례 기록이 전혀 없으면 부적격, baptism_year만 있어도 인정', () => {
    const noBaptism = assessVoter(
      member({ baptism_date: undefined, baptism_year: undefined }),
      RULES.voter,
      TODAY
    )
    expect(noBaptism.eligible).toBe(false)

    const yearOnly = assessVoter(
      member({ baptism_date: undefined, baptism_year: 2015 }),
      RULES.voter,
      TODAY
    )
    expect(yearOnly.eligible).toBe(true)
  })

  it('등록 6개월 미만은 부적격, 등록일 미상은 warning으로 통과', () => {
    const recent = assessVoter(member({ registration_date: '2026-07-01' }), RULES.voter, TODAY)
    expect(recent.eligible).toBe(false)

    const unknown = assessVoter(member({ registration_date: undefined }), RULES.voter, TODAY)
    expect(unknown.eligible).toBe(true)
    expect(unknown.warnings[0]).toContain('등록일')
  })

  it('치리 중이면 부적격', () => {
    const result = assessVoter(member({ disciplinary_status: '수찬정지' }), RULES.voter, TODAY)
    expect(result.eligible).toBe(false)
    expect(result.reasons[0]).toContain('치리')
  })

  it('voterType: 기존 항존직을 구분한다 (공천투표 참여 자격용)', () => {
    expect(resolveVoterType(member({ detailed_position: '시무장로' }))).toBe('elder')
    expect(resolveVoterType(member({ detailed_position: '안수집사' }))).toBe('deacon')
    expect(resolveVoterType(member({ detailed_position: '시무권사' }))).toBe('kwansa')
    expect(resolveVoterType(member())).toBe('member')
  })
})

describe('assessCandidate — 후보자 자격 (성별 규칙)', () => {
  /** 장로 후보 적격 남성 (안수집사, 만 51세, 세례 26년) */
  const elderMale = () =>
    member({ birth_date: '1975-05-10', detailed_position: '안수집사', service_years: 10 })
  /** 장로 후보 적격 여성 (시무권사) */
  const elderFemale = () =>
    member({
      gender: '여',
      birth_date: '1978-02-01',
      detailed_position: '시무권사',
      service_years: 8,
    })

  it('장로는 남녀 모두 후보 가능 (gender=all)', () => {
    expect(assessCandidate(elderMale(), 'elder', RULES, TODAY).eligible).toBe(true)
    expect(assessCandidate(elderFemale(), 'elder', RULES, TODAY).eligible).toBe(true)
  })

  it('안수집사는 남성만, 권사는 여성만', () => {
    const female = member({ gender: '여', birth_date: '1980-01-01', service_years: 6 })
    const male = member({ gender: '남', birth_date: '1980-01-01', service_years: 6 })

    expect(assessCandidate(female, 'deacon', RULES, TODAY).eligible).toBe(false)
    expect(assessCandidate(female, 'deacon', RULES, TODAY).reasons.join()).toContain('성별')
    expect(assessCandidate(male, 'deacon', RULES, TODAY).eligible).toBe(true)

    expect(assessCandidate(male, 'kwansa', RULES, TODAY).eligible).toBe(false)
    expect(assessCandidate(female, 'kwansa', RULES, TODAY).eligible).toBe(true)
  })

  it('성별 미등록이면 부적격 (자격에 성별 필수)', () => {
    const result = assessCandidate(elderMale(), 'elder', RULES, TODAY)
    expect(result.eligible).toBe(true)
    const noGender = assessCandidate(
      member({ gender: undefined, detailed_position: '안수집사', service_years: 10 }),
      'elder',
      RULES,
      TODAY
    )
    expect(noGender.eligible).toBe(false)
    expect(noGender.reasons[0]).toContain('성별 미등록')
  })

  it('장로 나이 요건: 만 40세 이상 ~ 만 70세 미만', () => {
    const tooYoung = assessCandidate(
      member({ birth_date: '1990-01-01', detailed_position: '안수집사', service_years: 10 }),
      'elder',
      RULES,
      TODAY
    ) // 만 36세
    expect(tooYoung.eligible).toBe(false)

    const tooOld = assessCandidate(
      member({ birth_date: '1955-01-01', detailed_position: '안수집사', service_years: 10 }),
      'elder',
      RULES,
      TODAY
    ) // 만 71세
    expect(tooOld.eligible).toBe(false)
  })

  it('장로 후보 전제 직분: 안수집사·협동안수집사·시무권사·협동권사만', () => {
    const plain = assessCandidate(
      member({ position: '집사', detailed_position: '', service_years: 10 }),
      'elder',
      RULES,
      TODAY
    )
    expect(plain.eligible).toBe(false)
    expect(plain.reasons.join()).toContain('전제 직분')
  })

  it('세례연수 미달은 부적격, 데이터 없으면 warning으로 통과', () => {
    const short = assessCandidate(
      member({
        baptism_date: undefined,
        baptism_year: 2022,
        detailed_position: '안수집사',
        service_years: 10,
      }),
      'elder',
      RULES,
      TODAY
    ) // 세례 4년 < 7년
    expect(short.eligible).toBe(false)

    const unknown = assessCandidate(
      member({
        baptism_date: undefined,
        baptism_year: undefined,
        detailed_position: '안수집사',
        service_years: 10,
      }),
      'elder',
      RULES,
      TODAY
    )
    expect(unknown.eligible).toBe(true)
    expect(unknown.warnings.join()).toContain('세례연수')
  })

  it('출석률·헌금률은 데이터 있으면 판정, 없으면 warning', () => {
    const low = assessCandidate(
      member({ detailed_position: '안수집사', service_years: 10, attendance_rate: 0.5 }),
      'elder',
      RULES,
      TODAY
    )
    expect(low.eligible).toBe(false)
    expect(low.reasons.join()).toContain('출석률')

    const unknown = assessCandidate(elderMale(), 'elder', RULES, TODAY)
    expect(unknown.eligible).toBe(true)
    expect(unknown.warnings.join()).toContain('출석률')
    expect(unknown.warnings.join()).toContain('헌금률')
  })
})
