# ops-shared 레포지토리 설정 가이드

> 서비스 간 공유 타입 및 이벤트 정의 패키지

## 목차

1. [개요](#1-개요)
2. [레포지토리 생성](#2-레포지토리-생성)
3. [로컬 개발 환경 설정](#3-로컬-개발-환경-설정)
4. [패키지 구조](#4-패키지-구조)
5. [타입 정의 가이드](#5-타입-정의-가이드)
6. [빌드 및 배포](#6-빌드-및-배포)
7. [npm 배포](#7-npm-배포)
8. [다른 프로젝트에서 사용](#8-다른-프로젝트에서-사용)
9. [CI/CD 설정](#9-cicd-설정)
10. [버전 관리](#10-버전-관리)
11. [트러블슈팅](#11-트러블슈팅)

---

## 1. 개요

### 역할
- ops-api, ops-admin-api 간 공유 타입 정의
- Redis Event Bus 이벤트 타입 정의
- API 요청/응답 DTO 타입 공유

### 기술 스택
- **Language**: TypeScript
- **Build**: tsc (TypeScript Compiler)
- **Package Manager**: npm

### 사용처

| 서비스 | 용도 |
|--------|------|
| ops-api | 타입 import, 이벤트 발행 |
| ops-admin-api | 타입 import, 이벤트 구독 |

---

## 2. 레포지토리 생성

### Step 1: GitHub 레포 생성
```bash
gh repo create Namanmoo-Damso/ops-shared --private --description "OPS 공유 타입 및 이벤트 패키지"
```

### Step 2: 로컬에서 폴더 복사 및 초기화
```bash
# ops_backend에서 ops-shared 폴더 복사
cp -r /path/to/ops_backend/services/ops-shared ~/projects/ops-shared
cd ~/projects/ops-shared

# Git 초기화
git init
git remote add origin git@github.com:Namanmoo-Damso/ops-shared.git

# .gitignore 생성
cat > .gitignore << 'EOF'
# Dependencies
node_modules/

# Build output
dist/

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log

# npm
.npm
*.tgz
EOF

# .npmignore 생성 (npm 배포 시 제외 파일)
cat > .npmignore << 'EOF'
# Source files (배포 시 dist만 포함)
src/
tsconfig.json

# Development
.git/
.github/
.vscode/
.idea/

# Tests
__tests__/
*.spec.ts
*.test.ts
coverage/

# Docs
*.md
!README.md
EOF

# 초기 커밋
git add .
git commit -m "chore: 레포지토리 초기화"
git branch -M main
git push -u origin main
```

---

## 3. 로컬 개발 환경 설정

### 필수 소프트웨어
```bash
nvm install 20
nvm use 20
```

### 의존성 설치
```bash
npm install
```

### 개발 의존성 추가 (필요시)
```bash
npm install -D typescript @types/node
```

---

## 4. 패키지 구조

```
ops-shared/
├── src/
│   ├── index.ts                # 메인 export
│   ├── types/
│   │   ├── index.ts            # 타입 배럴 export
│   │   ├── user.types.ts       # 사용자 타입
│   │   ├── ward.types.ts       # 피보호자 타입
│   │   ├── call.types.ts       # 통화 타입
│   │   ├── device.types.ts     # 디바이스 타입
│   │   └── emergency.types.ts  # 비상 타입
│   └── events/
│       ├── index.ts            # 이벤트 배럴 export
│       ├── call.events.ts      # 통화 이벤트
│       └── user.events.ts      # 사용자 이벤트
├── dist/                       # 빌드 출력 (gitignore)
├── package.json
├── tsconfig.json
└── README.md
```

### package.json
```json
{
  "name": "@namanmoo/ops-shared",
  "version": "1.0.0",
  "description": "OPS 공유 타입 및 이벤트",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Namanmoo-Damso/ops-shared.git"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## 5. 타입 정의 가이드

### 타입 정의 규칙

1. **Entity 타입**: DB 스키마와 1:1 매핑
2. **DTO 타입**: API 요청/응답용
3. **Event 타입**: Redis Event Bus 이벤트

### 예시: 사용자 타입

```typescript
// src/types/user.types.ts

/**
 * 사용자 엔티티 (DB 스키마 기반)
 */
export interface User {
  id: string;
  identity: string;
  displayName: string;
  userType: UserType;
  email: string | null;
  nickname: string | null;
  profileImageUrl: string | null;
  kakaoId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 사용자 유형
 */
export type UserType = 'guardian' | 'ward' | 'admin' | 'anonymous';

/**
 * 사용자 응답 DTO
 */
export interface UserResponseDto {
  id: string;
  identity: string;
  displayName: string;
  userType: UserType;
  email: string | null;
  nickname: string | null;
  profileImageUrl: string | null;
}

/**
 * 사용자 생성 요청 DTO
 */
export interface CreateUserDto {
  identity: string;
  displayName: string;
  userType: UserType;
  email?: string;
  kakaoId?: string;
}
```

### 예시: 이벤트 타입

```typescript
// src/events/call.events.ts

/**
 * 통화 이벤트 채널
 */
export const CALL_EVENTS = {
  STARTED: 'call:started',
  ENDED: 'call:ended',
  PARTICIPANT_JOINED: 'call:participant:joined',
  PARTICIPANT_LEFT: 'call:participant:left',
} as const;

/**
 * 통화 시작 이벤트
 */
export interface CallStartedEvent {
  callId: string;
  roomName: string;
  callerId: string;
  calleeId: string;
  startedAt: string; // ISO 8601
}

/**
 * 통화 종료 이벤트
 */
export interface CallEndedEvent {
  callId: string;
  roomName: string;
  endedAt: string;
  duration: number; // seconds
  endReason: 'completed' | 'cancelled' | 'failed' | 'timeout';
}

/**
 * 참가자 입장 이벤트
 */
export interface ParticipantJoinedEvent {
  roomName: string;
  participantId: string;
  participantName: string;
  joinedAt: string;
}
```

### Export 정리

```typescript
// src/types/index.ts
export * from './user.types';
export * from './ward.types';
export * from './call.types';
export * from './device.types';
export * from './emergency.types';

// src/events/index.ts
export * from './call.events';
export * from './user.events';

// src/index.ts
export * from './types';
export * from './events';
```

---

## 6. 빌드 및 배포

### 빌드
```bash
npm run build
```

### 빌드 결과 확인
```bash
ls -la dist/
# index.js, index.d.ts 등 생성 확인
```

### 로컬 테스트
```bash
# 다른 프로젝트에서 로컬 패키지 링크
cd ../ops-api
npm link ../ops-shared

# 사용
import { User, CallStartedEvent } from '@namanmoo/ops-shared';
```

---

## 7. npm 배포

### GitHub Packages 사용 (권장)

#### 1. GitHub Token 설정
```bash
# ~/.npmrc 파일 생성
cat > ~/.npmrc << 'EOF'
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
@namanmoo:registry=https://npm.pkg.github.com
EOF
```

토큰 생성: GitHub > Settings > Developer settings > Personal access tokens
- 필요 권한: `read:packages`, `write:packages`

#### 2. 배포
```bash
# 버전 업데이트
npm version patch  # 또는 minor, major

# 배포
npm publish
```

### npm Public Registry 사용 (선택)

```bash
# package.json에서 publishConfig 수정
{
  "publishConfig": {
    "access": "public"
  }
}

# npm 로그인
npm login

# 배포
npm publish
```

---

## 8. 다른 프로젝트에서 사용

### 설치 (GitHub Packages)

#### 1. 프로젝트 .npmrc 설정
```bash
# ops-api/.npmrc
@namanmoo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

#### 2. 설치
```bash
npm install @namanmoo/ops-shared
```

### 사용 예시

```typescript
// ops-api/src/calls/calls.service.ts
import {
  CallStartedEvent,
  CallEndedEvent,
  CALL_EVENTS,
} from '@namanmoo/ops-shared';

@Injectable()
export class CallsService {
  constructor(private readonly eventBus: EventBus) {}

  async startCall(callerId: string, calleeId: string) {
    const call = await this.createCall(callerId, calleeId);

    // 이벤트 발행 (타입 안전)
    const event: CallStartedEvent = {
      callId: call.id,
      roomName: call.roomName,
      callerId,
      calleeId,
      startedAt: new Date().toISOString(),
    };

    await this.eventBus.publish(CALL_EVENTS.STARTED, event);

    return call;
  }
}
```

```typescript
// ops-admin-api/src/dashboard/dashboard.service.ts
import {
  CallStartedEvent,
  CALL_EVENTS,
} from '@namanmoo/ops-shared';

@Injectable()
export class DashboardService implements OnModuleInit {
  constructor(private readonly eventBus: EventBus) {}

  onModuleInit() {
    // 이벤트 구독 (타입 안전)
    this.eventBus.subscribe<CallStartedEvent>(
      CALL_EVENTS.STARTED,
      (event) => {
        console.log('Call started:', event.callId);
        this.updateDashboardStats();
      }
    );
  }
}
```

---

## 9. CI/CD 설정

### .github/workflows/publish.yml
```yaml
name: Publish Package

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://npm.pkg.github.com'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Publish
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 배포 트리거
```bash
# 버전 태그 생성 후 푸시
git tag v1.0.1
git push origin v1.0.1
# → GitHub Actions가 자동으로 npm publish 실행
```

---

## 10. 버전 관리

### Semantic Versioning

| 버전 | 변경 유형 | 예시 |
|------|-----------|------|
| MAJOR (1.x.x) | Breaking changes | 타입 삭제, 필수 필드 추가 |
| MINOR (x.1.x) | 새 기능 추가 | 새 타입, 새 이벤트 추가 |
| PATCH (x.x.1) | 버그 수정 | 오타 수정, 문서 업데이트 |

### Breaking Change 시 주의사항

1. **MAJOR 버전 업데이트** 필수
2. **CHANGELOG.md** 작성
3. 사용 중인 서비스 **동시 업데이트**

```bash
# Breaking change 배포
npm version major  # 1.0.0 → 2.0.0

git push origin main --tags
```

### CHANGELOG.md 예시
```markdown
# Changelog

## [2.0.0] - 2024-01-15

### Breaking Changes
- `User.displayName` → `User.name`으로 변경
- `CallEndedEvent.reason` 필드 필수화

### Added
- `EmergencyEvent` 타입 추가

## [1.1.0] - 2024-01-10

### Added
- `DeviceType` enum 추가
- `LocationUpdatedEvent` 이벤트 추가

## [1.0.0] - 2024-01-01

### Added
- 초기 릴리스
- User, Ward, Call, Device, Emergency 타입
- Call, User 이벤트
```

---

## 11. 트러블슈팅

### 문제: npm install 시 패키지를 찾을 수 없음
```bash
# 1. .npmrc 설정 확인
cat .npmrc
# @namanmoo:registry=https://npm.pkg.github.com

# 2. GitHub Token 확인
echo $GITHUB_TOKEN

# 3. 패키지가 배포되었는지 확인
# https://github.com/Namanmoo-Damso/ops-shared/packages
```

### 문제: 타입 정의가 없음 (d.ts 파일 누락)
```bash
# 1. tsconfig.json에서 declaration: true 확인
cat tsconfig.json | grep declaration

# 2. 빌드 재실행
rm -rf dist
npm run build

# 3. dist/ 확인
ls dist/*.d.ts
```

### 문제: import 오류
```typescript
// 잘못된 import
import { User } from 'ops-shared';  // ❌

// 올바른 import
import { User } from '@namanmoo/ops-shared';  // ✅
```

### 문제: 버전 충돌
```bash
# 의존하는 서비스들이 서로 다른 버전 사용 시

# 해결: 모든 서비스에서 동일 버전 사용
# ops-api/package.json
"@namanmoo/ops-shared": "^1.2.0"

# ops-admin-api/package.json
"@namanmoo/ops-shared": "^1.2.0"
```

### 문제: 로컬 개발 시 변경사항 반영 안됨
```bash
# npm link 사용 시
cd ops-shared
npm run build  # 빌드 필수!

# 또는 watch 모드
npm run build -- --watch
```

---

## 타입 추가 시 체크리스트

- [ ] 타입 파일 생성 (`src/types/xxx.types.ts`)
- [ ] index.ts에 export 추가
- [ ] 빌드 확인 (`npm run build`)
- [ ] 버전 업데이트 (`npm version patch/minor`)
- [ ] 배포 (`git push origin main --tags`)
- [ ] 사용 서비스에서 버전 업데이트

---

## 연락처

문제가 있으면 팀 Slack 채널 `#ops-backend`에 문의하세요.
