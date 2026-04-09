# Vote — 서두교회 투표 플랫폼

> 이 문서는 프로젝트 특화 규칙을 담습니다. 공통 규칙은 `~/.claude/CLAUDE.md`에 있습니다.

## 1. 프로젝트 개요

**Vote**는 서두교회(Seodoon-church) 조직에서 사용할 **투표 플랫폼**입니다. 교회 공동체의 의사결정(임원 선출, 안건 찬반, 설문 등)을 디지털화하여 참여율을 높이고 집계를 자동화하는 것이 목표입니다.

- **상태**: 초기화 단계 — 저장소만 생성된 빈 프로젝트
- **GitHub**: https://github.com/Seodoon-church/Vote
- **Firebase 프로젝트**: {{TODO: 프로젝트 ID 미정, 생성 후 `.firebaserc` 에 등록}}
- **배포 URL**: {{TODO: 미정}}
- **레포 상태**: `.git` 만 초기화되어 있고 **commit 0건, working tree 비어 있음**. 이 CLAUDE.md 가 첫 번째 commit 이 됩니다.

### 예상 핵심 기능 (스펙 확정 전 가이드)
- 투표 생성 (관리자) — 제목, 설명, 선택지, 기간, 익명/기명, 중복 투표 금지
- 투표 참여 (교인) — 로그인 → 투표지 확인 → 선택 → 제출
- 실시간 집계 — 진행 중 부분 결과(권한별), 마감 후 최종 결과 공개
- 권한 관리 — 교인/집사/목회자/관리자 등 역할 기반 접근
- 감사 로그 — 누가 언제 어떤 투표를 생성/참여했는지 추적

> {{TODO: 위 기능들은 예상 사항입니다. 요구사항이 확정되면 섹션 전체를 교체할 것}}

## 2. 기술 스택 (팀 표준 적용 예정)

| 레이어 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | **Next.js 14+** (App Router) | 팀 표준 |
| 언어 | **TypeScript** | `strict: true`, `paths: @/* → ./src/*` |
| 스타일 | **Tailwind CSS** | 팀 표준. shadcn/ui 여부는 {{TODO}} |
| 상태 관리 | **Zustand** | 팀 표준. 서버 상태는 Firebase 실시간 구독 병행 |
| 폼 / 검증 | react-hook-form + zod | (권장) |
| 백엔드 | **Firebase** (Auth / Firestore / Functions / Hosting) | 팀 표준 |
| 인증 | **Firebase Auth** | 로그인 방식 미정 {{TODO}} |
| 테스트 | **Vitest** | 팀 표준 |
| 배포 | **Firebase Hosting + Cloud Functions** | 리전 `asia-northeast3` (팀 표준) |
| 도메인 | {{TODO}} | 커스텀 도메인 or Firebase Hosting 기본 |

> 아직 `package.json` 이 없습니다. 초기 셋업 시 `harness-standards/templates/nextjs-firebase/` 스캐폴드를 그대로 가져와 시작할 것.

## 3. 빠른 시작

**현재는 아직 실행할 수 없습니다.** 최초 셋업 순서:

```bash
# 1) harness-standards/templates/nextjs-firebase 를 이 디렉토리에 복사
# 2) 의존성 설치
npm install
# 3) Firebase 프로젝트 생성 + init
firebase login
firebase init   # hosting, firestore, functions, emulators
# 4) .env.local 작성 (§5)
# 5) 개발 서버
npm run dev     # → http://localhost:3000
# 6) 테스트 (Vitest)
npm run test
# 7) 배포
firebase deploy
```

**사전 요구사항**: Node.js 20+, Firebase CLI, Firebase 프로젝트 권한 (서두교회 조직)

## 4. 디렉토리 구조 (예정)

```
Vote/
├── src/
│   ├── app/
│   │   ├── (public)/                # 로그인, 랜딩
│   │   └── (authenticated)/
│   │       ├── polls/               # 투표 목록
│   │       ├── polls/[id]/          # 상세 / 참여
│   │       ├── polls/new/           # 생성 (관리자)
│   │       ├── results/[id]/        # 결과
│   │       └── admin/               # 관리자 대시보드
│   ├── components/{ui,poll,layout}/
│   ├── hooks/                       # use-polls, use-votes, use-user-role
│   ├── lib/
│   │   ├── firebase.ts
│   │   ├── firebaseAdmin.ts
│   │   ├── auth-context.tsx
│   │   ├── validators/              # zod 스키마
│   │   └── constants.ts
│   ├── stores/                      # Zustand
│   └── types/
├── functions/                       # Cloud Functions (asia-northeast3)
├── public/
├── firebase.json / firestore.rules / firestore.indexes.json / .firebaserc
├── next.config.ts / tsconfig.json / vitest.config.ts
└── package.json
```

> 위는 팀 표준 기반 **예상 구조**입니다. 실제 셋업 후 이 섹션을 갱신할 것.

## 5. 환경 변수 (예정)

`.env.local` (git 제외):

```bash
# Firebase 클라이언트 (NEXT_PUBLIC_ 프리픽스 필수)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (Cloud Functions 서버 사이드)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

**획득**: Firebase Console → 프로젝트 설정 → 일반 → 앱에서 복사. Admin 키는 서비스 계정 JSON에서 추출.

> ⚠️ `.env.local`, 서비스 계정 JSON 은 절대 commit 하지 말 것. 초기 셋업 시 `.gitignore` 에 반드시 포함.

## 6. 핵심 아키텍처 (예정)

### 6.1 배포 모드 결정 필요 {{TODO}}

팀 내 전례:
- **family** — Next.js Static Export (`output: "export"`) + Firebase Hosting
- **legpia** — 순수 정적 HTML (Next.js 미사용)

Vote 는 **실시간 집계 + 권한 검증**이 핵심이므로 둘 중 선택:
1. **Static Export + 클라이언트 Firestore 구독** — 단순, 저렴, family 패턴 재사용
2. **SSR (Cloud Functions rewrites)** — 서버측 권한 검증에 유리

### 6.2 권한 모델 (예정)

```
anonymous       → 로그인 페이지만
member          → 투표 목록 열람 + 참여
admin           → 투표 생성/수정/마감, 부분 집계 열람
platform_admin  → 계정/역할 관리
```

역할은 **Firebase Auth Custom Claims** 또는 `users/{uid}.role` 에 저장. firestore.rules 에서 체크. family 프로젝트의 rules 헬퍼 함수 패턴 참고 권장.

## 7. 도메인 모델 (예정, Firestore)

```
users/{userId}                       # email, displayName, role, 소속(구역/부서 {{TODO}})

polls/{pollId}
  ├─ title, description
  ├─ options: [{ id, label, count }]
  ├─ startAt, endAt (Timestamp)
  ├─ isAnonymous, allowMultiple: boolean
  ├─ eligibleRoles: string[]
  ├─ status: "draft" | "open" | "closed"
  ├─ createdBy, createdAt
  └─ votes/{voteId}                  # 서브컬렉션
        ├─ userId (익명이면 해시 또는 null)
        ├─ optionIds: string[]
        └─ submittedAt

pollParticipants/{pollId}/{userId}   # 중복 투표 방지 (익명 투표라도 여기엔 기록)
auditLogs/{logId}                    # actor, action, target, timestamp
```

### 용어
- **투표(Poll)** — 하나의 질문 + 선택지 묶음
- **선택지(Option)** — 투표의 개별 보기
- **투표 기록(Vote)** — 한 사용자의 제출물
- **익명 투표** — `votes` 에 `userId` 대신 해시/null. 중복 방지는 `pollParticipants` 로 분리

> {{TODO: 스펙 확정 시 실제 구현과 동기화}}

## 8. 자주 쓰는 명령 (예정)

```bash
npm run dev
npm run test
npm run build

# 에뮬레이터 (firestore.rules 수정 시 로컬 검증 필수)
firebase emulators:start --only firestore,auth,functions,hosting

# 규칙만 배포
firebase deploy --only firestore:rules

# 전체 배포
firebase deploy
```

## 9. 주의 사항

### 초기 셋업 시
- ⚠️ **팀 표준을 따를 것** — Next.js 14+ / TypeScript / Firebase / Tailwind / Zustand / Vitest. 이유 없이 벗어나지 말고, 벗어난다면 §2 에 **이유 명시**
- ⚠️ **Cloud Functions 리전은 `asia-northeast3`** — family 프로젝트가 실수로 `us-central1` 을 사용한 전례가 있음. 반복하지 말 것
- ⚠️ **`.env.local`, 서비스 계정 JSON은 절대 commit 금지**
- ⚠️ **Firestore Rules 를 먼저 설계** — 권한이 투표 플랫폼의 핵심. 코드보다 rules 를 먼저 그리고 에뮬레이터로 검증

### 투표 도메인 특화 주의
- ⚠️ **중복 투표 방지** — 클라이언트 체크만으로는 불충분. rules + `pollParticipants/{pollId}/{userId}` 존재 여부로 원자적 차단
- ⚠️ **투표 기간 검증** — `startAt <= now < endAt` 은 반드시 **서버 시각**(`request.time`) 기준으로 rules 에서 검증. 클라이언트 시계 신뢰 금지
- ⚠️ **익명 투표의 진짜 익명성** — `votes.userId` 를 null/해시로 저장해도 `pollParticipants` 에 userId 가 남으면 교차 조회로 깨질 수 있음. 두 컬렉션의 경계를 문서화하고 rules 로 구분
- ⚠️ **결과 조기 노출 금지** — `status != "closed"` 인 투표는 일반 사용자가 집계를 못 보도록 rules 로 차단. 관리자만 부분 집계 열람
- ⚠️ **감사 로그** — 투표 생성/수정/삭제/참여는 `auditLogs` 에 남기고 rules 로 `delete` 금지

### 빈 저장소 상태
- ⚠️ **지금 이 commit 이 첫 번째 commit 입니다** — 이후 실제 프로젝트 스캐폴드를 가져올 때는 별도 commit 으로 분리할 것 (문서와 코드가 섞이지 않게)

## 10. 개발 히스토리

저장소가 방금 초기화되어 **commit 이 0건**입니다.

| 세션 | Commit | 핵심 변경 |
|---|---|---|
| **Initial** | (이번 commit) | `docs: Claude Code 컨텍스트 문서 추가 (CLAUDE.md)` |

앞으로의 계획:
1. **Phase 0 (setup)** — `nextjs-firebase` 템플릿 스캐폴드 + Firebase 프로젝트 연결
2. **Phase 1 (auth)** — Firebase Auth + 역할 시스템 + 기본 레이아웃
3. **Phase 2 (polls CRUD)** — 관리자 투표 생성/수정/마감 + firestore.rules
4. **Phase 3 (voting)** — 교인 투표 참여 + 중복 방지 + 익명 옵션
5. **Phase 4 (results)** — 실시간 집계 + 차트 + 결과 공개
6. **Phase 5 (admin)** — 감사 로그, 사용자/역할 관리
7. **Phase 6 (polish)** — 알림, 다크모드, PWA, 접근성

각 Phase 마무리 시 이 섹션에 commit 요약을 추가할 것.

## 11. TODO / 정리 필요 항목

### 가장 시급 (셋업 전 확정 필요)
- [ ] **기능 스펙 확정** — 기획서/요구사항 문서 위치 지정
- [ ] **Firebase 프로젝트 생성** 및 ID 결정 → `.firebaserc` 등록
- [ ] **인증 방식 결정** — Email / Google / Kakao 중 어떤 것
- [ ] **커스텀 도메인 결정**
- [ ] **배포 모드 결정** — Static Export vs SSR (§6.1)
- [ ] **역할 체계 확정** — 교인/집사/목회자/관리자 외 필요한 역할, 교회 내 소속(구역/부서) 필드 필요 여부

### 초기 구현
- [ ] `nextjs-firebase` 템플릿 적용
- [ ] `.gitignore` (node_modules, .env*, .firebase, out/, .next/, 서비스 계정 JSON)
- [ ] `firestore.rules` 권한 모델 초안 + 에뮬레이터 테스트
- [ ] CI (GitHub Actions) — lint + test + build
- [ ] 이 CLAUDE.md 를 실제 구현 상태에 맞게 갱신 (§4, §5, §7)

## 12. 참고

- **공통 규칙**: `~/.claude/CLAUDE.md` (Seodoon-church 전역)
- **하네스 표준**: `C:\Users\samsung\Documents\project\harness-standards\`
- **Next.js + Firebase 템플릿**: `C:\Users\samsung\Documents\project\harness-standards\templates\nextjs-firebase\`
- **참고 프로젝트**:
  - `C:\Users\samsung\Documents\project\family\` — Next.js + Firebase 대규모 레퍼런스
  - `C:\Users\samsung\Documents\project\legpia\` — 정적 Firebase Hosting 소규모 레퍼런스
- **Firebase Console**: {{TODO: 프로젝트 생성 후 URL 추가}}
- **GitHub 저장소**: https://github.com/Seodoon-church/Vote
