# Vote — 교회 선거/투표 플랫폼 (멀티테넌트)

> 이 문서는 프로젝트 특화 규칙을 담습니다. 공통 규칙은 `~/.claude/CLAUDE.md`에 있습니다.
> 전체 설계서: `seodoon/docs/PLAN.md` (2026-09-26, 선거 시스템 신규 기획)

## 1. 프로젝트 개요

**Vote**는 교회 공동체의 선거(항존직)·투표·설문을 디지털화하는 **멀티테넌트 투표 플랫폼**입니다.
seodun-election-system(독립형 프로토타입)의 설계 사상 — vote_seal 무기명 이중분리, 선거관리위원회, 감사 로그, 규정 엔진 — 을 계승해 Firebase 기반으로 재구축합니다.

- **상태**: 개발 중 (0~1단계 완료: 스캐폴드 + 도메인모델 + 보안규칙)
- **GitHub**: https://github.com/Seodoon-church/Vote
- **Firebase Project ID**: `seodoon-church` (기존 프로젝트 재사용, `churches/{churchId}` 테넌트 스코프)
- **1호 테넌트**: 서둔교회 — 2027년 초 장로선거 (현장 투표만)

### 확정 결정 사항 (2026-09-26)
- **여성장로 20% = 정원 배분 방식**: 선출 정원을 남성 몫/여성 몫으로 분리 (`positions: { elder: { male: N, female: M } }`), 여성 후보는 여성 몫에서 경쟁, 피택 기준(장로 2/3)은 몫별 동일 적용
- **자격 요건에 성별 포함**: 직분별 성별 규칙은 테넌트 설정(`settings/electionRules`)으로 관리 (기본값: 장로=all, 안수집사=male, 권사=female)
- **투표는 현장만**: 교인 로그인 + 현장 인증키(해시 저장, Functions 검증). 온라인 원격 투표 없음

## 2. 기술 스택

| 레이어 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript (strict) |
| 스타일 | Tailwind CSS v4 |
| 상태 | Zustand |
| 인증 | Firebase Auth (기존 seodoon-church 교인 계정) |
| DB | Cloud Firestore |
| 서버 로직 | Cloud Functions (`asia-northeast3`) — 투표 제출·집계·단계전환 |
| 테스트 | Vitest (+ @firebase/rules-unit-testing) |
| 배포 | Firebase Hosting (사이트 미생성, 6단계에서) |

## 3. 빠른 시작

```bash
npm install
npm run dev          # http://localhost:3000
npm run build
npm run test         # 유닛 테스트 (rules 제외)
npm run test:rules   # firestore.rules 에뮬레이터 검증 (Java 필요)
```

## 4. 디렉토리 구조

```
Vote/
├── src/
│   ├── app/                # Next.js App Router
│   ├── lib/firebase.ts     # 클라이언트 SDK 초기화 (asia-northeast3 Functions)
│   └── types/election.ts   # 도메인 모델 + DEFAULT_ELECTION_RULES
├── tests/rules/            # firestore.rules 유닛 테스트
├── firestore.rules         # 보안 규칙 초안 (⚠️ §8 배포 금지 참고)
├── firestore.indexes.json
├── firebase.json           # 에뮬레이터 설정 (firestore 8092, auth 9092)
└── .firebaserc             # default: seodoon-church
```

## 5. 환경 변수

`.env.local` (커밋 금지, `.env.example` 참고):
- `NEXT_PUBLIC_FIREBASE_*` — seodoon-church 웹 앱 클라이언트 설정
- `NEXT_PUBLIC_USE_EMULATOR=true` — 로컬 에뮬레이터 연결 스위치

## 6. 도메인 모델 (Firestore)

```
churches/{churchId}/
  settings/electionRules            # 테넌트별 자격 규칙·피택 기준 (ElectionRules)
  elections/{electionId}            # 선거: stage, positions(성별 정원), results(Functions 전용)
    committees/{uid}                # 선관위 — 문서 ID = Auth uid (규칙에서 exists() 판정)
    voters/{voterId}                # 선거인 명부 — has_voted_*는 Functions 전용
    candidates/{candidateId}        # 후보 — gender 필수, 득표수는 Functions 전용
    ballots/{ballotId}              # 무기명 투표지 — 클라이언트 접근 전면 금지
    announcements/{id}              # 선거 공고
    auditLogs/{id}                  # 감사 로그 — 쓰기 Functions 전용, 삭제 불가
```

**무기명 원칙 (절대 규칙)**:
- `voters`(누가 투표했는가) ↔ `ballots`(무엇을 찍었는가)는 **vote_seal로만 연결**, 역추적 불가
- `ballots`에 uid·member_id·이름 등 식별 정보 저장 금지
- 투표 제출은 `submitBallot` Function 트랜잭션 전용 (자격·기간·중복 검증 → has_voted 마킹 → 투표지 기록 → seal 반환)

**선거 진행**: `preparing → nomination_voting → first_voting → second_voting → completed`
피택: 장로 2/3, 안수집사·권사 과반 — 성별 몫별 독립 판정. 단계 전환·집계는 Functions 전용.

## 7. 인증·권한

- 교인 인증: 기존 seodoon-church Firebase Auth 재사용
- 교회 관리자: `users/{uid}.role in ['최고관리자','관리자']` (병합 시 seodoon 본 룰셋 헬퍼로 대체)
- 선관위: `elections/{id}/committees/{uid}` 문서 존재 여부
- 일반 교인: 선거 정보·후보·공고 열람만. 명부·투표지·감사로그 접근 불가

## 8. 배포 주의 (중요)

- ⚠️ **이 저장소에서 `firebase deploy` 절대 금지** (`.claude/settings.json`에서 deny 처리됨).
  seodoon-church 프로젝트의 Firestore 룰셋은 **seodoon 저장소 `firestore.rules`가 단일 원본**이다.
  여기서 rules를 배포하면 기존 전체 규칙이 대체되어 서비스가 깨진다.
- 이 저장소의 `firestore.rules`는 **에뮬레이터 검증용 초안** — 배포 시 seodoon/firestore.rules에 병합 후 그쪽에서 배포.
- Cloud Functions 리전은 `asia-northeast3` 고정 (us-central1 실수 전례 있음).
- Hosting 사이트는 6단계(서둔 온보딩)에서 생성 예정.

## 9. 주의 사항

- ⚠️ `firestore.rules` 수정 시 `npm run test:rules`로 에뮬레이터 검증 필수
- ⚠️ 투표 기간 검증은 서버 시각(request.time / Functions) 기준. 클라이언트 시계 신뢰 금지
- ⚠️ 결과 조기 노출 금지 — stage=completed 전 집계는 선관위만
- ⚠️ 현장 투표 동시 접속 폭주 대비 — 공동의회 리허설(모의선거) 필수
- ⚠️ `members.gender`('남'/'여')는 명부 등록 시 `Gender`('male'/'female')로 변환

## 10. 개발 히스토리

| 날짜 | 단계 | 내용 |
|---|---|---|
| 2026-09-26 | 0~1단계 | Next.js 16 스캐폴드 + Firebase 연결 + 도메인 모델(`src/types/election.ts`) + firestore.rules 초안 + rules 유닛테스트 |
| 2026-09-26 | 2단계 | Cloud Functions 코어(`functions/src/election/`): submitBallot(무기명 트랜잭션)·countVotes(성별 몫 독립 피택 판정)·advanceStage·generateOnsiteKey. 집계 순수로직 단위테스트 10개 |
| 2026-09-26 | 3단계 | 자격 엔진(`src/lib/qualification.ts`): 성별 규칙 포함 선거인/후보 판정, 테넌트 설정형(VoterRule·PositionRule 확장). 데이터 미비=warnings 통과 정책. 단위테스트 18개 |

### Functions 메모
- codebase = `vote` (seodoon 기본 codebase와 분리 — 배포해도 기존 함수에 영향 없음)
- 피택 기준: `inclusive` 구분 — 장로 2/3 **이상**, 집사·권사 과반(**초과**). 테넌트 규정(`settings/electionRules`)이 기본값 오버라이드
- 정원 경계 동점은 `tieAtBoundary`로 표시만 하고 자동 확정하지 않는다 (선관위 수동 판정)
- 공천(nomination) 집계는 득표수만 기록 — 공천 확정(qualified)은 선관위 수동 (공천 인원 규정 미확정)

### 다음 단계 (seodoon/docs/PLAN.md 기준)
- 3단계: 자격 엔진 (성별 포함, 테넌트 설정형)
- 4단계: 관리자 화면 / 5단계: 현장 투표 화면
- 미결: 장로 정원 확정 숫자(남/여 배분), 항존직선거규정 원문 확보
