// 자격 엔진 — 교적부(members) 레코드 기반 선거인/후보자 자격 판정 (순수 로직)
// 기존 churchos-admin ElectionManagementPage 판정 로직을 테넌트 설정형으로 이식.
// 정책: 데이터가 없어 확인 불가한 항목은 warnings로 남기고 통과시킨다
// (기존 시스템 답습 — 세례연수·출석률·헌금률은 교적부에 없는 경우가 많음).

import type {
  ElectionRules,
  Gender,
  PositionRule,
  PositionType,
  VoterRule,
} from '@/types/election'

/** seodoon 교적부 members 문서에서 자격 판정에 쓰는 필드 */
export interface MemberRecord {
  id: string
  name: string
  gender?: string // '남' | '여'
  birth_date?: string | number
  baptism_date?: string | number
  baptism_year?: string | number
  registration_date?: string | number
  member_classification?: string
  position?: string
  detailed_position?: string
  disciplinary_status?: string
  service_years?: number
  attendance_rate?: number // 0~1 (없으면 확인 불가 처리)
  tithe_rate?: number // 0~1
  nationality?: string // 제4조④ 대한민국 국적자만 피선거권
  is_paid_staff?: boolean // 제4조④ 교회 유급 직원 피선거권 없음
}

export interface QualificationResult {
  eligible: boolean
  /** 부적격 사유 */
  reasons: string[]
  /** 데이터 미비로 확인하지 못한 항목 (판정은 통과, 선관위 수동 확인 대상) */
  warnings: string[]
}

export interface VoterQualificationResult extends QualificationResult {
  /** 공천투표 참여 자격 판정용 — 기존 항존직 여부 */
  voterType: 'elder' | 'deacon' | 'kwansa' | 'member'
}

/** members.gender('남'/'여') → 도메인 Gender. 그 외 값은 null */
export function mapGender(raw: string | undefined): Gender | null {
  if (raw === '남') return 'male'
  if (raw === '여') return 'female'
  return null
}

/** Excel 날짜 시리얼 번호 또는 일반 날짜 문자열 파싱 (기존 시스템과 동일 규칙) */
export function parseMemberDate(value: string | number | undefined): Date | null {
  if (value === undefined || value === null || value === '') return null
  const str = String(value)
  if (/^\d+$/.test(str) && str.length <= 6) {
    // 숫자만 있으면 Excel 시리얼 번호 (25569 = 1970-01-01)
    return new Date((parseInt(str, 10) - 25569) * 86400 * 1000)
  }
  const date = new Date(str)
  return isNaN(date.getTime()) ? null : date
}

/** 만 나이 계산 */
export function calcFullAge(birthDate: Date, today: Date): number {
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

/** 세례연수 — baptism_date 우선, 없으면 baptism_year(연도)로 계산. 둘 다 없으면 null */
export function calcBaptismYears(member: MemberRecord, today: Date): number | null {
  const baptismDate = parseMemberDate(member.baptism_date)
  if (baptismDate) {
    return Math.floor(monthsBetween(baptismDate, today) / 12)
  }
  const year = Number(member.baptism_year)
  if (!isNaN(year) && year > 1900) {
    return today.getFullYear() - year
  }
  return null
}

/** 기존 항존직 여부 — 공천투표 참여 자격 판정용 (제8조①: 은퇴 항존직 포함) */
export function resolveVoterType(member: MemberRecord): VoterQualificationResult['voterType'] {
  const detailed = member.detailed_position || ''
  if (['담임목사', '부목사', '시무장로', '은퇴장로', '협동장로'].includes(detailed)) return 'elder'
  if (['안수집사', '협동안수집사', '은퇴안수집사'].includes(detailed)) return 'deacon'
  if (['시무권사', '협동권사', '은퇴권사'].includes(detailed)) return 'kwansa'
  return 'member'
}

/** 선거인 자격 판정 */
export function assessVoter(
  member: MemberRecord,
  rule: VoterRule,
  today: Date = new Date()
): VoterQualificationResult {
  const reasons: string[] = []
  const warnings: string[] = []

  // 1. 교인 분류
  if (rule.memberClassification && member.member_classification !== rule.memberClassification) {
    reasons.push(`${rule.memberClassification}이(가) 아님`)
  }

  // 2. 만 나이
  const birthDate = parseMemberDate(member.birth_date)
  if (birthDate) {
    const age = calcFullAge(birthDate, today)
    if (age < rule.minAge) {
      reasons.push(`만 ${rule.minAge}세 미만 (만 ${age}세)`)
    }
  } else {
    reasons.push('생년월일 미등록')
  }

  // 3. 세례교인
  if (rule.requireBaptism && !member.baptism_date && !member.baptism_year) {
    reasons.push('세례일 미등록 (세례교인 확인 필요)')
  }

  // 4. 등록(출석) 기간 — 규칙이 0이면 판정하지 않음 (규정 제3조에는 없는 운영값)
  if (rule.minAttendanceMonths > 0) {
    const regDate = parseMemberDate(member.registration_date)
    if (regDate) {
      const months = monthsBetween(regDate, today)
      if (months < rule.minAttendanceMonths) {
        reasons.push(`출석 ${rule.minAttendanceMonths}개월 미만 (${months}개월)`)
      }
    } else {
      warnings.push('등록일 미등록 — 출석 기간 확인 불가')
    }
  }

  // 5. 치리 중
  const discipline = member.disciplinary_status
  if (rule.excludeUnderDiscipline && discipline && discipline !== '없음') {
    reasons.push(`치리 중 (${discipline})`)
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    warnings,
    voterType: resolveVoterType(member),
  }
}

/** 후보자 자격 판정 — 성별 규칙 포함 */
export function assessCandidate(
  member: MemberRecord,
  positionType: PositionType,
  rules: ElectionRules,
  today: Date = new Date()
): QualificationResult {
  const rule: PositionRule = rules.positions[positionType]
  const reasons: string[] = []
  const warnings: string[] = []

  // 0. 선거인 공통 전제 (교인 분류·치리)
  if (
    rules.voter.memberClassification &&
    member.member_classification !== rules.voter.memberClassification
  ) {
    reasons.push(`${rules.voter.memberClassification}이(가) 아님`)
  }
  const discipline = member.disciplinary_status
  if (rules.voter.excludeUnderDiscipline && discipline && discipline !== '없음') {
    reasons.push(`치리 중 (${discipline})`)
  }

  // 1. 성별 — 직분 성별 규칙 (장로 all, 안수집사 male, 권사 female 기본값)
  const gender = mapGender(member.gender)
  if (!gender) {
    reasons.push('성별 미등록')
  } else if (rule.gender !== 'all' && gender !== rule.gender) {
    reasons.push(`성별 요건 불일치 (${rule.gender === 'male' ? '남성' : '여성'} 직분)`)
  }

  // 2. 만 나이 (min 이상, max 미만)
  const birthDate = parseMemberDate(member.birth_date)
  if (birthDate) {
    const age = calcFullAge(birthDate, today)
    if (age < rule.minAge) reasons.push(`만 ${rule.minAge}세 미만 (만 ${age}세)`)
    if (age >= rule.maxAge) reasons.push(`만 ${rule.maxAge}세 이상 (만 ${age}세)`)
  } else {
    reasons.push('생년월일 미등록')
  }

  // 3. 세례연수
  const baptismYears = calcBaptismYears(member, today)
  if (baptismYears === null) {
    warnings.push(`세례연수 확인 불가 (기준 ${rule.minBaptismYears}년)`)
  } else if (baptismYears < rule.minBaptismYears) {
    reasons.push(`세례 ${rule.minBaptismYears}년 미만 (${baptismYears}년)`)
  }

  // 4. 전제 직분·봉사 경로 (제4조 — 복수 경로 중 하나 충족)
  //    예: 안수집사 후보 = 집사 5년 이상 또는 협동안수집사 3년 이상
  const current = [member.position || '', member.detailed_position || '']
  const matchedPaths = rule.servicePaths.filter((path) =>
    path.positions.some((p) => current.includes(p))
  )
  if (rule.servicePaths.length > 0 && matchedPaths.length === 0) {
    const allPositions = rule.servicePaths.flatMap((p) => p.positions)
    reasons.push(`후보 전제 직분 아님 (${allPositions.join('/')})`)
  } else if (matchedPaths.length > 0) {
    const minYears = Math.min(...matchedPaths.map((p) => p.minYears))
    if (member.service_years === undefined) {
      warnings.push(`봉사연수 확인 불가 (기준 ${minYears}년)`)
    } else if (member.service_years < minYears) {
      reasons.push(`봉사 ${minYears}년 미만 (${member.service_years}년)`)
    }
  }

  // 5. 국적·유급 직원 (제4조④) — 데이터 없으면 수동 확인 대상
  if (member.nationality !== undefined && member.nationality !== '대한민국') {
    reasons.push('대한민국 국적 아님 (제4조④)')
  }
  if (member.is_paid_staff === true) {
    reasons.push('교회 유급 직원 (제4조④)')
  }
  if (member.nationality === undefined || member.is_paid_staff === undefined) {
    warnings.push('국적·유급직원 여부 수동 확인 필요 (제4조④)')
  }

  // 6. 출석률·헌금률 (제8조③ 최근 2년) — 데이터 있으면 판정, 없으면 확인 불가
  if (member.attendance_rate === undefined) {
    warnings.push(`출석률 확인 불가 (기준 ${rule.minAttendanceRate * 100}%)`)
  } else if (member.attendance_rate < rule.minAttendanceRate) {
    reasons.push(`출석률 ${rule.minAttendanceRate * 100}% 미만`)
  }
  if (member.tithe_rate === undefined) {
    warnings.push(`헌금률 확인 불가 (기준 ${rule.minTitheRate * 100}%)`)
  } else if (member.tithe_rate < rule.minTitheRate) {
    reasons.push(`헌금률 ${rule.minTitheRate * 100}% 미만`)
  }

  return { eligible: reasons.length === 0, reasons, warnings }
}
