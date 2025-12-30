# CLAUDE.md - OPS Backend Project Constitution

> AI 모델이 백엔드 프로젝트 컨텍스트를 이해하고, 코드 품질을 일관되게 유지하기 위한 **프로젝트 헌법(Constitution)**

**버전:** 2.0.0
**최종 수정:** 2025년 12월 30일
**문서 상태:** 활성

---

<project_info>
<description>
OPS Backend - 실시간 화상통화 관제 시스템 백엔드

LiveKit 기반 실시간 통화 관제 플랫폼으로, NestJS API 서버와 Next.js 관제 웹을 포함합니다.
보호자-어르신 매칭, 카카오 로그인, 통화 녹화/분석, APNs 푸시 알림을 지원합니다.
</description>

<tech_stack>
<!-- 2025.12.30 기준 실제 버전 -->
- **Runtime**: Node.js 20+ (LTS)
- **API Framework**: NestJS 11.x (TypeScript)
- **Web Framework**: Next.js 16.x (React 19, App Router)
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Media Server**: LiveKit (SFU)
- **Push**: APNs (VoIP + Alert)
- **Auth**: JWT, Kakao OAuth
- **Container**: Docker, Docker Compose
- **Package Manager**: npm
</tech_stack>

<core_entities>
<!-- 현재 DB 스키마 기준 -->
- **users**: 사용자 (identity, display_name)
- **devices**: 디바이스 (apns_token, voip_token, supports_callkit, env)
- **rooms**: 통화방 (room_name)
- **room_members**: 방 참여자 (role: host/viewer/observer)
- **calls**: 통화 기록 (caller, callee, state, timestamps)

<!-- 확장 예정 (이슈 #1) -->
- **guardians**: 보호자 (kakao_id, phone, name)
- **wards**: 피보호자/어르신 (name, phone, settings)
- **guardian_ward_relations**: 보호자-어르신 관계
</core_entities>
</project_info>

---

<coding_rules>
<typescript>
- MUST: TypeScript strict mode 사용
- MUST: 명시적 타입 선언 (any 사용 금지)
- MUST: async/await 패턴 일관성 유지
- MUST: 에러는 커스텀 예외 클래스로 처리
- SHOULD: interface보다 type 선호 (합성이 더 명확한 경우 예외)
- MUST NOT: console.log 직접 사용 - NestJS Logger 사용
- MUST NOT: 하드코딩된 문자열/숫자 - 상수 또는 환경변수
</typescript>

<nestjs>
- MUST: Controller → Service 레이어 분리
- MUST: DTO로 요청/응답 타입 정의 (Entity 직접 노출 금지)
- MUST: 환경변수는 process.env에서 읽되 getConfig() 함수로 중앙화
- MUST: 예외는 HttpException 또는 커스텀 예외 사용
- SHOULD: Injectable 서비스는 생성자 주입
- MUST NOT: Controller에서 직접 DB 쿼리
- MUST NOT: 비즈니스 로직을 Controller에 작성
</nestjs>

<nextjs>
- MUST: App Router 구조 사용 (app/ 디렉토리)
- MUST: Server Components 기본, Client Components는 'use client' 명시
- MUST: API 호출은 fetch 또는 server actions 사용
- SHOULD: CSS Modules 사용
- MUST NOT: pages/ 디렉토리 사용 (레거시)
</nextjs>

<database>
- MUST: 파라미터 바인딩 사용 (SQL Injection 방지)
- MUST: 트랜잭션 범위 최소화
- MUST: 인덱스 전략 수립 (자주 조회되는 컬럼)
- SHOULD: 대용량 쿼리는 페이지네이션 적용
- MUST NOT: SELECT * 사용 (필요한 컬럼만)
- MUST NOT: 루프 내 개별 쿼리 (배치로 처리)
</database>

<naming>
- 파일: kebab-case (예: `app.service.ts`, `push-service.ts`)
- 클래스: PascalCase (예: `AppService`, `PushService`)
- 함수/변수: camelCase (예: `sendPush`, `roomName`)
- 상수: UPPER_SNAKE_CASE (예: `DEFAULT_PAGE_SIZE`)
- 환경변수: UPPER_SNAKE_CASE (예: `DATABASE_URL`)
- React 컴포넌트: PascalCase (예: `JoinBanner`, `VideoTile`)
</naming>

<testing>
- MUST: Service 레이어 단위 테스트 작성
- MUST: 테스트 파일은 `*.spec.ts` 명명
- SHOULD: E2E 테스트는 `test/` 디렉토리
- MUST NOT: 프로덕션 DB에 테스트 수행
</testing>
</coding_rules>

---

<restrictions>
<!-- 절대 금지 사항 -->

🔴 **MUST NOT (절대 금지)**:
- Entity/Row 직접 API 응답으로 반환 (DTO 변환 필수)
- console.log 로깅 (NestJS Logger 사용)
- Controller에서 비즈니스 로직 구현
- SQL Injection 취약 쿼리 (파라미터 바인딩 필수)
- 하드코딩된 credential
- master/develop 브랜치에 직접 push
- PR 없이 develop/master에 머지
- --no-verify 옵션으로 훅 우회

⚠️ **SHOULD NOT (지양)**:
- 300줄 이상의 단일 파일
- any 타입 사용
- 동기 블로킹 외부 API 호출
- 테스트 없는 코드 커밋
</restrictions>

---

<workflow_protocol>
<!-- AI 모델이 따라야 할 단계별 프로토콜 -->

## 1. Analyze (분석)
- 사용자 요청 파악 및 관련 파일 확인
- 기존 코드베이스에서 유사 패턴 검색
- GitHub 이슈와의 연관성 확인

## 2. Plan (계획 수립)
- 변경 계획을 단계별로 수립
- 영향 받는 파일 나열
- DB 스키마 변경 필요 여부 확인

## 3. Implement (구현)
- 계획에 따라 코드 작성
- 기존 패턴과 일관성 유지
- 테스트 코드 작성

## 4. Verify (검증)
- 빌드 확인: `cd api && npm run build` / `cd web && npm run build`
- 테스트 실행: `cd api && npm test`
- 린트 확인: `npm run lint`

## 5. Commit & PR (커밋 및 PR)
- `/smart-commit` 스킬 사용
- Conventional Commit 형식 준수
- PR 본문에 변경사항 상세 기술
</workflow_protocol>

---

<branch_strategy>
<!-- 브랜치 전략 -->

| 브랜치 | 용도 | 직접 Push | PR 대상 |
|--------|------|-----------|---------|
| `master` | 프로덕션 | ❌ 금지 | hotfix/* |
| `develop` | 개발 통합 | ❌ 금지 | feature/*, fix/* |
| `feature/*` | 기능 개발 | ✅ 허용 | → develop |
| `fix/*` | 버그 수정 | ✅ 허용 | → develop |
| `hotfix/*` | 긴급 수정 | ✅ 허용 | → master |

**브랜치 명명 규칙:**
- `feature/<issue-number>-<short-description>` (예: `feature/1-db-schema-extension`)
- `fix/<issue-number>-<short-description>` (예: `fix/5-matching-logic`)
</branch_strategy>

---

<commit_convention>
<!-- Conventional Commits -->

```
feat: 새 기능 추가
fix: 버그 수정
docs: 문서 변경
style: 코드 포맷팅 (동작 변화 X)
refactor: 리팩토링 (동작 변화 X)
perf: 성능 개선
test: 테스트 추가/수정
chore: 빌드, 설정, 의존성 변경
ci: CI/CD 설정 변경
db: 데이터베이스 스키마/마이그레이션 변경
```

**예시:**
- `feat(auth): 카카오 로그인 API 추가`
- `fix(push): VoIP 푸시 실패 시 APNs alert 폴백`
- `db(schema): 보호자/어르신 테이블 추가`
- `test(api): 통화 초대 API 단위 테스트 추가`
</commit_convention>

---

<file_structure>
<!-- 프로젝트 구조 (v2.1.0 - 완전한 모듈 기반 아키텍처) -->

```
ops_backend/
├── api/                              # NestJS API 서버
│   ├── src/
│   │   ├── main.ts                   # 엔트리포인트
│   │   ├── app.module.ts             # 루트 모듈
│   │   ├── app.controller.ts         # 헬스체크, 웹훅 (최소화)
│   │   ├── app.service.ts            # 공용 비즈니스 로직
│   │   │
│   │   ├── common/                   # 공용 모듈 (@Global)
│   │   │   ├── common.module.ts
│   │   │   ├── index.ts              # 배럴 export
│   │   │   ├── guards/
│   │   │   │   ├── jwt-auth.guard.ts     # JWT 인증 가드
│   │   │   │   └── admin-auth.guard.ts   # 관제 인증 가드
│   │   │   ├── filters/
│   │   │   │   └── http-exception.filter.ts
│   │   │   └── decorators/
│   │   │       └── current-user.decorator.ts
│   │   │
│   │   ├── database/                 # 데이터베이스 모듈 (@Global) ⭐
│   │   │   ├── database.module.ts
│   │   │   ├── db.service.ts         # 데이터베이스 서비스
│   │   │   └── index.ts
│   │   │
│   │   ├── push/                     # 푸시 모듈 (@Global) ⭐
│   │   │   ├── push.module.ts
│   │   │   ├── push.service.ts       # APNs 푸시 서비스
│   │   │   ├── push.controller.ts    # /push/*
│   │   │   └── index.ts
│   │   │
│   │   ├── ai/                       # AI 모듈 (@Global) ⭐
│   │   │   ├── ai.module.ts
│   │   │   ├── ai.service.ts         # OpenAI 분석 서비스
│   │   │   └── index.ts
│   │   │
│   │   ├── scheduler/                # 스케줄러 모듈 ⭐
│   │   │   ├── scheduler.module.ts
│   │   │   ├── notification.scheduler.ts # 알림 스케줄러
│   │   │   └── index.ts
│   │   │
│   │   ├── auth/                     # 인증 모듈 ⭐
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts    # /auth/*
│   │   │   ├── auth.service.ts
│   │   │   └── dto/
│   │   │       ├── kakao-login.dto.ts
│   │   │       ├── refresh-token.dto.ts
│   │   │       └── anonymous-auth.dto.ts
│   │   │
│   │   ├── users/                    # 사용자 모듈 ⭐
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts   # /users/*
│   │   │   ├── users.service.ts
│   │   │   └── dto/
│   │   │       ├── register-guardian.dto.ts
│   │   │       └── user-response.dto.ts
│   │   │
│   │   ├── guardians/                # 보호자 모듈 ⭐
│   │   │   ├── guardians.module.ts
│   │   │   ├── guardians.controller.ts # /guardians/*
│   │   │   └── guardians.service.ts
│   │   │
│   │   ├── wards/                    # 피보호자 모듈 ⭐
│   │   │   ├── wards.module.ts
│   │   │   ├── wards.controller.ts   # /wards/*
│   │   │   └── wards.service.ts
│   │   │
│   │   ├── calls/                    # 통화 모듈 ⭐
│   │   │   ├── calls.module.ts
│   │   │   └── calls.controller.ts   # /calls/*
│   │   │
│   │   ├── rtc/                      # RTC 토큰 모듈
│   │   │   ├── rtc.module.ts
│   │   │   └── rtc.controller.ts     # /rtc-token
│   │   │
│   │   ├── devices/                  # 디바이스 모듈
│   │   │   ├── devices.module.ts
│   │   │   └── devices.controller.ts # /register-device
│   │   │
│   │   ├── push/                     # 푸시 모듈
│   │   │   ├── push.module.ts
│   │   │   └── push.controller.ts    # /push/*
│   │   │
│   │   ├── admin/                    # 관제 관리자 모듈 ⭐
│   │   │   ├── admin.module.ts
│   │   │   ├── auth/
│   │   │   │   ├── admin-auth.controller.ts # /admin/auth/*
│   │   │   │   └── admin-auth.service.ts
│   │   │   ├── dashboard/
│   │   │   │   └── dashboard.controller.ts  # /admin/dashboard/*
│   │   │   ├── wards-management/
│   │   │   │   └── wards-management.controller.ts # /admin/wards/*
│   │   │   ├── locations/
│   │   │   │   └── locations.controller.ts  # /admin/locations/*
│   │   │   └── emergencies/
│   │   │       └── emergencies.controller.ts # /admin/emergencies/*
│   │   │
│   │   └── types/
│   │       └── apn.d.ts              # APNs 타입 정의
│   │
│   ├── test/
│   │   └── app.e2e-spec.ts           # E2E 테스트
│   └── package.json
│
├── web/                              # Next.js 관제 웹
│   ├── app/
│   │   ├── layout.tsx                # 루트 레이아웃
│   │   ├── page.tsx                  # 화상통화 페이지 ⭐
│   │   ├── page.module.css           # 스타일
│   │   ├── dashboard/page.tsx        # 대시보드
│   │   ├── my-wards/page.tsx         # 피보호자 관리
│   │   ├── locations/page.tsx        # 위치 정보
│   │   ├── emergencies/page.tsx      # 비상 연락
│   │   ├── select-organization/page.tsx # 기관 선택
│   │   └── wards/bulk-upload/page.tsx   # CSV 업로드
│   │
│   ├── components/                   # React 컴포넌트 ⭐
│   │   ├── Icons.tsx                 # SVG 아이콘
│   │   ├── AuthGuard.tsx             # 인증 가드
│   │   ├── SidebarLayout.tsx         # 사이드바 레이아웃
│   │   ├── DashboardCharts.tsx       # 대시보드 차트
│   │   ├── LocationMap.tsx           # 위치 지도
│   │   └── video/                    # 화상통화 컴포넌트
│   │       ├── VideoTiles.tsx        # 비디오 타일
│   │       ├── JoinBanner.tsx        # 참가 배너
│   │       ├── ControlBar.tsx        # 컨트롤 바
│   │       ├── ParticipantSidebar.tsx # 참가자 사이드바
│   │       └── index.ts              # barrel export
│   │
│   ├── hooks/                        # React 훅 ⭐
│   │   ├── useLiveKitSession.ts      # LiveKit 세션 관리
│   │   ├── useSessionMonitor.ts      # 세션 모니터링
│   │   └── index.ts                  # barrel export
│   │
│   └── package.json
│
├── db/
│   └── init.sql                      # DB 초기화 스크립트 ⭐
│
├── scripts/
│   ├── gen_livekit_keys.sh           # LiveKit 키 생성
│   └── start-work.sh                 # 이슈 작업 시작 스크립트
│
├── .claude/
│   ├── settings.local.json           # Claude Code 설정
│   └── skills/                       # 워크플로우 스킬 ⭐
│       ├── smart-commit.md           # 스마트 커밋
│       ├── start-work.md             # 작업 시작
│       ├── code-review.md            # 코드 리뷰
│       └── sync-docs.md              # 문서 동기화
│
├── docker-compose.yml                # 컨테이너 구성
├── Caddyfile                         # 리버스 프록시
├── livekit.yaml                      # LiveKit 설정
├── api.env                           # API 환경변수
├── db.env                            # DB 환경변수
├── web.env                           # Web 환경변수
└── CLAUDE.md                         # 이 문서
```
</file_structure>

---

<commands>
<!-- 자주 사용하는 명령어 -->

| 명령어 | 설명 |
|--------|------|
| `docker compose up -d` | 전체 서비스 시작 |
| `docker compose down` | 서비스 중지 |
| `docker compose logs -f api` | API 로그 확인 |
| `docker compose build api` | API 이미지 빌드 |
| `cd api && npm run build` | API 빌드 |
| `cd api && npm test` | API 테스트 |
| `cd api && npm run lint` | API 린트 |
| `cd web && npm run build` | Web 빌드 |
| `cd web && npm run dev` | Web 개발 서버 |

**GitHub CLI:**
| 명령어 | 설명 |
|--------|------|
| `gh issue list` | 이슈 목록 |
| `gh pr create` | PR 생성 |
| `gh pr view` | PR 확인 |
| `gh pr merge` | PR 머지 |
</commands>

---

<database_config>
<!-- 개발 환경 데이터베이스 설정 -->

### PostgreSQL (docker-compose)
- **Database**: damso
- **User**: damso
- **Port**: 내부 5432

### Redis (docker-compose)
- **Host**: redis (서비스명)
- **Port**: 6379

### LiveKit (docker-compose)
- **API**: localhost:7880
- **WS**: wss://your-domain.com (Caddy 프록시)
</database_config>

---

<api_endpoints>
<!-- 현재 구현된 API 엔드포인트 (v2.0.0 - 모듈 기반) -->

### 시스템
| Method | Path | 설명 | 모듈 |
|--------|------|------|------|
| GET | `/healthz` | 헬스 체크 | app |
| POST | `/webhook/kakao/unlink` | 카카오 연결 해제 웹훅 | app |

### 인증 (auth/)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/auth/kakao` | 카카오 로그인 |
| POST | `/auth/refresh` | JWT 토큰 갱신 |
| POST | `/auth/anonymous` | 익명 인증 |

### 사용자 (users/)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/users/me` | 내 정보 조회 |
| POST | `/users/register/guardian` | 보호자 회원가입 |

### 보호자 (guardians/)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/guardians/dashboard` | 보호자 대시보드 |
| GET | `/guardians/reports` | 분석 보고서 |
| GET | `/guardians/wards` | 피보호자 목록 |

### 피보호자 (wards/)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/wards/:id` | 피보호자 상세 |
| PUT | `/wards/:id/settings` | 피보호자 설정 변경 |

### 통화 (calls/)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/calls/invite` | 통화 초대 (푸시 발송) |
| POST | `/calls/:id/answer` | 통화 응답 |
| POST | `/calls/:id/end` | 통화 종료 |
| GET | `/rooms/:name/members` | 방 참여자 목록 |

### RTC (rtc/)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/rtc-token` | LiveKit RTC 토큰 발급 |

### 디바이스 (devices/)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/register-device` | APNs 디바이스 등록 |

### 푸시 (push/)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/push/broadcast` | 브로드캐스트 푸시 |

### 관제 인증 (admin/auth/)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/admin/auth/oauth/:provider` | OAuth 로그인 (kakao/google) |
| POST | `/admin/auth/refresh` | 관제 토큰 갱신 |
| POST | `/admin/auth/logout` | 로그아웃 |
| GET | `/admin/auth/organizations` | 기관 목록 |
| GET | `/admin/auth/me` | 관리자 정보 |

### 관제 대시보드 (admin/dashboard/)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/admin/dashboard/stats` | 통계 데이터 |
| GET | `/admin/dashboard/realtime` | 실시간 데이터 |

### 관제 피보호자 관리 (admin/wards/)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/admin/wards/bulk-upload` | CSV 일괄 등록 |
| GET | `/admin/my-wards` | 피보호자 목록 |

### 관제 위치 (admin/locations/)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/admin/locations` | 위치 목록 |
| GET | `/admin/locations/history` | 위치 이력 |
| GET | `/admin/locations/status` | 실시간 상태 |

### 관제 비상 (admin/emergencies/)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/admin/emergency` | 비상 연락 발송 |
| GET | `/admin/emergencies` | 비상 목록 |
| GET | `/admin/emergencies/:id` | 비상 상세 |
| POST | `/admin/emergencies/:id/resolve` | 비상 해결 |
</api_endpoints>

---

<github_issues>
<!-- 현재 이슈 목록 (우선순위순) -->

**Phase 1: 기반 구축**
1. [#1] DB 스키마 확장 (보호자/어르신 시스템)
2. [#2] 카카오 로그인 API
3. [#3] JWT 토큰 갱신 API
4. [#4] 보호자 회원가입 API

**Phase 2: 보호자 기능**
5. [#5] 어르신 자동 매칭 로직
6. [#6] 사용자 정보 API
7. [#7] 보호자 대시보드 API
8. [#8] 보호자 분석 보고서 API
9. [#9] 보호자 피보호자 관리 API

**Phase 3: 확장 기능**
10. [#10] 카카오 웹훅
11. [#11] 어르신 설정 API
12. [#12] 푸시 알림 스케줄링
13. [#13] 통화 요약 및 AI 분석

**Phase 4: 관제 기능**
14. [#14] CSV 피보호자 일괄 등록 API
15. [#15] 실시간 위치정보 API
16. [#16] 비상연락 시스템
17. [#17] 관제페이지 통계 Dashboard
18. [#18] 관제페이지 OAuth 로그인
19. [#19] 관제페이지 CSV 일괄등록 UI
</github_issues>

---

<workflow_automation>
<!-- Claude Code 워크플로우 자동화 -->

## 사용 가능한 스킬 (Skills)

### `/start-work <이슈번호>`
이슈 기반 작업 시작. feature 브랜치 생성 및 프로젝트 상태 업데이트.
```
/start-work 1
```

### `/smart-commit`
변경사항 분석, 커밋, 푸시 후 PR 생성/업데이트.
```
/smart-commit
```

### `/code-review`
현재 PR의 코드 리뷰 수행. 치명적/경고/제안 분류.
```
/code-review
```

### `/sync-docs`
문서와 실제 코드 동기화 확인 및 업데이트.
```
/sync-docs
```

## 전체 워크플로우

```
1. /start-work <이슈번호>     → 브랜치 생성
2. 기능 구현                  → 코드 작성
3. 테스트 작성 및 실행         → npm test
4. /smart-commit              → 커밋, 푸시, PR 생성
5. /code-review               → 코드 리뷰
6. PR 머지                    → gh pr merge
7. 다음 이슈로 반복            → /start-work <다음번호>
```
</workflow_automation>

---

<ai_code_review>
<!-- AI 코드 리뷰어 지침 -->

## 리뷰어 페르소나
당신은 **OPS Backend 프로젝트의 시니어 백엔드/풀스택 개발자**입니다.

### 리뷰 우선순위
1. **치명적** (🔴): 런타임 에러, SQL Injection, 보안 취약점
2. **경고** (⚠️): 성능 이슈, 안티패턴, 타입 안전성
3. **제안** (💡): 코드 스타일, 리팩토링 (선택사항)

### 🔴 치명적 (즉시 수정)
- SQL Injection 취약점
- 인증/인가 우회 가능성
- 민감 정보 노출 (토큰, 비밀번호)
- 무한 루프 / 메모리 누수
- APNs 토큰 검증 누락

### ⚠️ 경고 (권장 수정)
- any 타입 사용
- 에러 처리 누락
- 비효율적 쿼리 (N+1 등)
- 하드코딩된 값
- 테스트 누락

### 💡 제안 (선택)
- 코드 스타일 개선
- 더 나은 네이밍
- 리팩토링 기회

## 출력 형식
```
### 🔴 치명적 (N건)
**파일:라인** - 이슈 제목
- 문제: 설명
- 개선: 코드 예시

### ⚠️ 경고 (N건)
**파일:라인** - 이슈 제목
> 설명

---
💡 **참고 제안** (선택사항)
- 제안 내용
```

🔴/⚠️가 없으면: `✅ 코드 리뷰 통과 - 수정 필요 사항 없음`
</ai_code_review>

---

<request_guidelines>
<!-- 요청 시 주의사항 -->

1. 새 API는 기존 응답 형식과 호환성 확인
2. DB 스키마 변경 시 `db/init.sql` 업데이트
3. APNs 관련 변경 시 VoIP/Alert 분기 확인
4. LiveKit 연동 변경 시 토큰 권한 확인
5. 응답은 한국어로 작성
6. 이슈 번호 참조 시 `#번호` 형식 사용
</request_guidelines>

---

## 버전 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 2.1.0 | 2025.12.30 | 서비스 파일 모듈화 완료 |
| | | - API: db.service.ts → database/ 모듈로 이동 |
| | | - API: push.service.ts → push/ 모듈로 이동 (@Global) |
| | | - API: ai.service.ts → ai/ 모듈로 분리 (@Global) |
| | | - API: notification.scheduler.ts → scheduler/ 모듈로 분리 |
| | | - API: 모든 import 경로 배럴 export 방식으로 통일 |
| 2.0.0 | 2025.12.30 | 모듈 기반 아키텍처 리팩토링 완료 |
| | | - API: auth/, users/, guardians/, wards/, calls/, rtc/, devices/, push/, admin/ 모듈 분리 |
| | | - API: common/ 모듈 (guards, filters, decorators) 추가 |
| | | - API: app.controller.ts 최소화 (healthz, webhook만 유지) |
| | | - Web: components/ 폴더 구조화 (Icons, video/) |
| | | - Web: hooks/ 폴더 추가 (useLiveKitSession, useSessionMonitor) |
| | | - Web: page.tsx 48% 감소 (1,219줄 → 636줄) |
| 1.0.0 | 2025.12.29 | 최초 작성 - ops_backend 프로젝트 전용 (NestJS/Next.js) |
