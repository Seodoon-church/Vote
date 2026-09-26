/** @vitest-environment node */
// firestore.rules 에뮬레이터 검증 — 실행: npm run test:rules
// (firebase emulators:exec가 Firestore 에뮬레이터를 띄운 상태에서 돌아간다)
// RULES_FILE 환경변수로 다른 룰셋 검증 가능 — seodoon 병합본 검증:
//   RULES_FILE=../seodoon/firestore.rules npm run test:rules
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const CHURCH = 'seodoon-church'
const ELECTION = 'election-2027'
const BASE = `churches/${CHURCH}/elections/${ELECTION}`

let env: RulesTestEnvironment

const adminDb = () => env.authenticatedContext('admin-uid').firestore()
const committeeDb = () => env.authenticatedContext('committee-uid').firestore()
const memberDb = () => env.authenticatedContext('member-uid').firestore()
const anonDb = () => env.unauthenticatedContext().firestore()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'vote-rules-test',
    firestore: {
      rules: readFileSync(process.env.RULES_FILE ?? 'firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8092,
    },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    // churchId는 seodoon 병합 룰셋의 belongsToChurch 폴백(users 문서) 대응
    await db.doc('users/admin-uid').set({ role: '최고관리자', churchId: CHURCH })
    await db.doc('users/member-uid').set({ role: '교인', churchId: CHURCH })
    await db.doc(BASE).set({ name: '2027년 항존직 선거', year: 2027, stage: 'preparing' })
    await db.doc(`${BASE}/committees/committee-uid`).set({ name: '위원', role: 'member' })
    await db.doc(`${BASE}/voters/v1`).set({ name: '홍길동', gender: 'male', has_voted_first: false })
    await db.doc(`${BASE}/ballots/b1`).set({ vote_seal: 'seal-1', round: 'first' })
    await db.doc(`${BASE}/candidates/c1`).set({ name: '후보', position_type: 'elder', gender: 'female', nomination_vote_count: 0 })
  })
})

describe('elections 기본 정보', () => {
  it('로그인 교인은 선거 정보를 읽을 수 있다', async () => {
    await assertSucceeds(memberDb().doc(BASE).get())
  })

  it('비로그인은 읽을 수 없다', async () => {
    await assertFails(anonDb().doc(BASE).get())
  })

  it('일반 교인은 선거를 만들 수 없다', async () => {
    await assertFails(
      memberDb().doc(`churches/${CHURCH}/elections/new-election`).set({ name: 'x', stage: 'preparing' })
    )
  })

  it('선관위도 stage(단계 전환)는 직접 수정할 수 없다 — Functions 전용', async () => {
    await assertFails(committeeDb().doc(BASE).update({ stage: 'first_voting' }))
  })

  it('선관위는 stage 외 일반 필드는 수정할 수 있다', async () => {
    await assertSucceeds(committeeDb().doc(BASE).update({ name: '2027년 항존직 선거(수정)' }))
  })
})

describe('ballots — 무기명 투표지 전면 차단', () => {
  it('교회 관리자도 투표지를 읽을 수 없다', async () => {
    await assertFails(adminDb().doc(`${BASE}/ballots/b1`).get())
  })

  it('교인이 투표지를 직접 쓸 수 없다 (submitBallot Function 전용)', async () => {
    await assertFails(
      memberDb().doc(`${BASE}/ballots/b2`).set({ vote_seal: 'x', round: 'first', selections: {} })
    )
  })
})

describe('voters — 선거인 명부', () => {
  it('일반 교인은 명부를 읽을 수 없다', async () => {
    await assertFails(memberDb().doc(`${BASE}/voters/v1`).get())
  })

  it('선관위는 명부를 읽을 수 있다', async () => {
    await assertSucceeds(committeeDb().doc(`${BASE}/voters/v1`).get())
  })

  it('선관위는 선거인을 등록할 수 있다', async () => {
    await assertSucceeds(
      committeeDb().doc(`${BASE}/voters/v2`).set({ name: '김철수', gender: 'male', is_eligible: true })
    )
  })

  it('선관위도 has_voted 마킹은 할 수 없다 — Functions 전용', async () => {
    await assertFails(committeeDb().doc(`${BASE}/voters/v1`).update({ has_voted_first: true }))
  })
})

describe('candidates — 후보자', () => {
  it('로그인 교인은 후보 명단을 읽을 수 있다', async () => {
    await assertSucceeds(memberDb().doc(`${BASE}/candidates/c1`).get())
  })

  it('선관위도 득표수는 수정할 수 없다 — Functions 전용', async () => {
    await assertFails(committeeDb().doc(`${BASE}/candidates/c1`).update({ nomination_vote_count: 99 }))
  })

  it('선관위는 후보 상태(공천 통과 등)는 수정할 수 있다', async () => {
    await assertSucceeds(committeeDb().doc(`${BASE}/candidates/c1`).update({ status: 'qualified' }))
  })
})

describe('auditLogs — 감사 로그', () => {
  it('관리자도 감사 로그를 직접 쓸 수 없다', async () => {
    await assertFails(adminDb().doc(`${BASE}/auditLogs/l1`).set({ action: 'x' }))
  })

  it('선관위는 감사 로그를 읽을 수 있다', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${BASE}/auditLogs/l1`).set({ action: 'create_election' })
    })
    await assertSucceeds(committeeDb().doc(`${BASE}/auditLogs/l1`).get())
  })
})

describe('committees — 선거관리위원회', () => {
  it('교회 관리자는 위원을 임명할 수 있다', async () => {
    await assertSucceeds(
      adminDb().doc(`${BASE}/committees/new-uid`).set({ name: '신임위원', role: 'member' })
    )
  })

  it('선관위원 스스로는 위원을 임명할 수 없다', async () => {
    await assertFails(
      committeeDb().doc(`${BASE}/committees/friend-uid`).set({ name: 'x', role: 'member' })
    )
  })
})
