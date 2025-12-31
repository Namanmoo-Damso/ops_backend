# ops-admin-web 레포지토리 설정 가이드

> 관제 대시보드 웹 프론트엔드 (LiveKit 화상통화 포함)

## 목차

1. [개요](#1-개요)
2. [레포지토리 생성](#2-레포지토리-생성)
3. [로컬 개발 환경 설정](#3-로컬-개발-환경-설정)
4. [환경 변수 설정](#4-환경-변수-설정)
5. [개발 서버 실행](#5-개발-서버-실행)
6. [빌드 및 배포](#6-빌드-및-배포)
7. [Docker 설정](#7-docker-설정)
8. [CI/CD 설정 (GitHub Actions)](#8-cicd-설정-github-actions)
9. [Vercel / Amplify 배포](#9-vercel--amplify-배포)
10. [주요 기능 설명](#10-주요-기능-설명)
11. [트러블슈팅](#11-트러블슈팅)

---

## 1. 개요

### 기술 스택
- **Framework**: Next.js 16 (App Router)
- **React**: 19.x
- **Language**: TypeScript
- **Styling**: CSS Modules
- **LiveKit**: @livekit/components-react
- **지도**: Naver Maps API
- **차트**: Chart.js (react-chartjs-2)

### 포트
- **3000** (Development / Production)

### 주요 페이지

| 경로 | 설명 |
|------|------|
| `/` | 화상통화 페이지 (메인) |
| `/login` | 로그인 |
| `/login/callback` | OAuth 콜백 |
| `/select-organization` | 기관 선택 |
| `/dashboard` | 대시보드 (통계) |
| `/my-wards` | 피보호자 관리 |
| `/wards/bulk-upload` | CSV 일괄 등록 |
| `/locations` | 위치 정보 |
| `/emergencies` | 비상 연락 |

### 폴더 구조
```
ops-admin-web/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # 루트 레이아웃
│   ├── page.tsx                # 화상통화 페이지
│   ├── page.module.css
│   ├── globals.css
│   ├── login/
│   │   ├── page.tsx            # 로그인
│   │   └── callback/page.tsx   # OAuth 콜백
│   ├── dashboard/page.tsx
│   ├── my-wards/page.tsx
│   ├── wards/bulk-upload/page.tsx
│   ├── locations/page.tsx
│   ├── emergencies/page.tsx
│   └── select-organization/
│       ├── page.tsx
│       └── korea-regions.ts
├── components/                 # React 컴포넌트
│   ├── Icons.tsx               # SVG 아이콘
│   ├── AuthGuard.tsx           # 인증 가드
│   ├── SidebarLayout.tsx       # 사이드바 레이아웃
│   ├── DashboardCharts.tsx     # 대시보드 차트
│   ├── LocationMap.tsx         # 네이버 지도
│   └── video/                  # 화상통화 컴포넌트
│       ├── VideoTiles.tsx
│       ├── JoinBanner.tsx
│       ├── ControlBar.tsx
│       ├── ParticipantSidebar.tsx
│       └── index.ts
├── hooks/                      # React 훅
│   ├── useLiveKitSession.ts    # LiveKit 세션 관리
│   ├── useSessionMonitor.ts    # 세션 모니터링
│   └── index.ts
├── public/                     # 정적 파일
├── Dockerfile
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 2. 레포지토리 생성

### Step 1: GitHub 레포 생성
```bash
gh repo create Namanmoo-Damso/ops-admin-web --private --description "OPS 관제 웹 프론트엔드"
```

### Step 2: 로컬에서 폴더 복사 및 초기화
```bash
# ops_backend에서 ops-admin-web 폴더 복사
cp -r /path/to/ops_backend/services/ops-admin-web ~/projects/ops-admin-web
cd ~/projects/ops-admin-web

# Git 초기화
git init
git remote add origin git@github.com:Namanmoo-Damso/ops-admin-web.git

# .gitignore 생성 (Next.js 표준)
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp/
.pnp.js

# Build
.next/
out/
build/
dist/

# Environment
.env
.env.*
!.env.example
!.env.local.example

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Testing
coverage/
.nyc_output/

# Misc
*.tsbuildinfo
next-env.d.ts

# Vercel
.vercel
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
# Node.js 20 설치
nvm install 20
nvm use 20

node --version  # v20.x.x
npm --version   # 10.x.x
```

### 의존성 설치
```bash
cd ops-admin-web
npm install
```

### VS Code 권장 확장
```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "dsznajder.es7-react-js-snippets"
  ]
}
```

---

## 4. 환경 변수 설정

### .env.local.example 생성
```bash
cat > .env.local.example << 'EOF'
# API URLs
NEXT_PUBLIC_API_BASE=http://localhost:8081
NEXT_PUBLIC_API_URL=http://localhost:8081
NEXT_PUBLIC_OPS_API_URL=http://localhost:8080

# LiveKit
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-server.com
NEXT_PUBLIC_ROOM_NAME=demo-room

# Naver Maps
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your-naver-map-client-id

# OAuth
NEXT_PUBLIC_KAKAO_CLIENT_ID=your-kakao-client-id
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
EOF
```

### 로컬 .env.local 파일 생성
```bash
cp .env.local.example .env.local
# .env.local 파일을 열어 실제 값으로 수정
```

### 환경 변수 설명

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_API_BASE` | O | ops-admin-api URL |
| `NEXT_PUBLIC_API_URL` | O | ops-admin-api URL (레거시 호환) |
| `NEXT_PUBLIC_OPS_API_URL` | △ | ops-api URL (일부 기능) |
| `NEXT_PUBLIC_LIVEKIT_URL` | O | LiveKit WebSocket URL |
| `NEXT_PUBLIC_ROOM_NAME` | O | 기본 방 이름 |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | O | 네이버 지도 Client ID |
| `NEXT_PUBLIC_KAKAO_CLIENT_ID` | O | 카카오 OAuth Client ID |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | △ | 구글 OAuth Client ID |

### 주의사항
- `NEXT_PUBLIC_` 접두사가 있는 변수만 클라이언트에서 접근 가능
- 민감한 정보는 `NEXT_PUBLIC_` 접두사 사용 금지

---

## 5. 개발 서버 실행

### 개발 모드
```bash
npm run dev

# 또는 특정 포트로 실행
npm run dev -- -p 3001
```

브라우저에서 http://localhost:3000 접속

### 타입 체크
```bash
npm run type-check
# 또는
npx tsc --noEmit
```

### 린트
```bash
npm run lint
```

---

## 6. 빌드 및 배포

### 프로덕션 빌드
```bash
npm run build
```

### 프로덕션 실행
```bash
npm run start
```

### 정적 내보내기 (선택)
```bash
# next.config.ts에서 output: 'export' 설정 필요
npm run build
# out/ 폴더에 정적 파일 생성
```

---

## 7. Docker 설정

### Dockerfile (이미 제공됨)
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_LIVEKIT_URL
ARG NEXT_PUBLIC_ROOM_NAME
ARG NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
ARG NEXT_PUBLIC_KAKAO_CLIENT_ID
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID

ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_ROOM_NAME=$NEXT_PUBLIC_ROOM_NAME
ENV NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=$NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
ENV NEXT_PUBLIC_KAKAO_CLIENT_ID=$NEXT_PUBLIC_KAKAO_CLIENT_ID
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### next.config.ts 수정 (standalone 모드)
```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',  // Docker 최적화를 위해 필수
  // ... 기타 설정
};

export default nextConfig;
```

### 로컬 Docker 빌드 및 실행
```bash
# 빌드 (build args 전달)
docker build \
  --build-arg NEXT_PUBLIC_API_BASE=https://admin-api.your-domain.com \
  --build-arg NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.your-domain.com \
  --build-arg NEXT_PUBLIC_ROOM_NAME=demo-room \
  --build-arg NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your-id \
  --build-arg NEXT_PUBLIC_KAKAO_CLIENT_ID=your-id \
  -t ops-admin-web .

# 실행
docker run -d \
  --name ops-admin-web \
  -p 3000:3000 \
  ops-admin-web
```

---

## 8. CI/CD 설정 (GitHub Actions)

### .github/workflows/ci.yml
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_API_BASE: https://api.example.com
          NEXT_PUBLIC_LIVEKIT_URL: wss://livekit.example.com
          NEXT_PUBLIC_ROOM_NAME: demo-room
          NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: dummy
          NEXT_PUBLIC_KAKAO_CLIENT_ID: dummy

  docker:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: ops-admin-web
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build \
            --build-arg NEXT_PUBLIC_API_BASE=${{ secrets.NEXT_PUBLIC_API_BASE }} \
            --build-arg NEXT_PUBLIC_LIVEKIT_URL=${{ secrets.NEXT_PUBLIC_LIVEKIT_URL }} \
            --build-arg NEXT_PUBLIC_ROOM_NAME=${{ secrets.NEXT_PUBLIC_ROOM_NAME }} \
            --build-arg NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=${{ secrets.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID }} \
            --build-arg NEXT_PUBLIC_KAKAO_CLIENT_ID=${{ secrets.NEXT_PUBLIC_KAKAO_CLIENT_ID }} \
            --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=${{ secrets.NEXT_PUBLIC_GOOGLE_CLIENT_ID }} \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
            -t $ECR_REGISTRY/$ECR_REPOSITORY:latest \
            .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
```

### GitHub Secrets 설정

| Secret | 설명 |
|--------|------|
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Key |
| `NEXT_PUBLIC_API_BASE` | 프로덕션 API URL |
| `NEXT_PUBLIC_LIVEKIT_URL` | 프로덕션 LiveKit URL |
| `NEXT_PUBLIC_ROOM_NAME` | 프로덕션 방 이름 |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 네이버 지도 Client ID |
| `NEXT_PUBLIC_KAKAO_CLIENT_ID` | 카카오 OAuth Client ID |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | 구글 OAuth Client ID |

---

## 9. Vercel / Amplify 배포

### Vercel 배포 (권장)

#### 1. Vercel CLI 설치
```bash
npm i -g vercel
```

#### 2. 프로젝트 연결
```bash
vercel link
```

#### 3. 환경 변수 설정
```bash
# Vercel 대시보드에서 설정하거나 CLI로 추가
vercel env add NEXT_PUBLIC_API_BASE
vercel env add NEXT_PUBLIC_LIVEKIT_URL
# ... 나머지 환경변수
```

#### 4. 배포
```bash
# 프리뷰 배포
vercel

# 프로덕션 배포
vercel --prod
```

### AWS Amplify 배포

#### 1. amplify.yml 생성
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

#### 2. Amplify 콘솔에서 환경 변수 설정
- Environment variables 섹션에서 `NEXT_PUBLIC_*` 변수들 추가

---

## 10. 주요 기능 설명

### 화상통화 (LiveKit)

#### 구조
```
components/video/
├── VideoTiles.tsx        # 비디오 그리드 렌더링
├── JoinBanner.tsx        # 참가자 초대 배너
├── ControlBar.tsx        # 마이크/카메라/화면공유 컨트롤
├── ParticipantSidebar.tsx # 참가자 목록 사이드바
└── index.ts              # barrel export
```

#### 사용법
```tsx
import { useLiveKitSession } from '@/hooks';

function VideoPage() {
  const { token, roomName, connect, disconnect } = useLiveKitSession();

  // ...
}
```

### 인증 플로우

```
1. /login 접속
2. 카카오/구글 OAuth 버튼 클릭
3. OAuth 프로바이더로 리다이렉트
4. /login/callback으로 돌아옴
5. 토큰 저장 (localStorage)
6. /select-organization으로 이동
7. 기관 선택 후 /dashboard로 이동
```

#### AuthGuard 사용
```tsx
import { AuthGuard } from '@/components/AuthGuard';

export default function ProtectedPage() {
  return (
    <AuthGuard>
      <YourComponent />
    </AuthGuard>
  );
}
```

### 네이버 지도

```tsx
import { LocationMap } from '@/components/LocationMap';

<LocationMap
  locations={[
    { lat: 37.5665, lng: 126.9780, name: '서울' }
  ]}
/>
```

---

## 11. 트러블슈팅

### 문제: LiveKit 연결 실패
```bash
# 1. LiveKit URL 확인
echo $NEXT_PUBLIC_LIVEKIT_URL
# wss:// 프로토콜인지 확인

# 2. 브라우저 콘솔에서 WebSocket 오류 확인
# - Mixed Content 오류: HTTPS 페이지에서 ws:// 사용 불가
# - CORS 오류: LiveKit 서버 CORS 설정 확인

# 3. LiveKit 서버 상태 확인
curl https://your-livekit-server.com/healthz
```

### 문제: OAuth 로그인 실패
```bash
# 1. 리다이렉트 URI 확인
# - 카카오: https://developers.kakao.com
# - 구글: https://console.cloud.google.com

# 2. Client ID 확인
echo $NEXT_PUBLIC_KAKAO_CLIENT_ID
echo $NEXT_PUBLIC_GOOGLE_CLIENT_ID

# 3. 콜백 페이지 URL 확인
# 개발: http://localhost:3000/login/callback
# 프로덕션: https://your-domain.com/login/callback
```

### 문제: 네이버 지도 로드 실패
```bash
# 1. Client ID 확인
echo $NEXT_PUBLIC_NAVER_MAP_CLIENT_ID

# 2. 네이버 클라우드 플랫폼에서 서비스 URL 등록 확인
# https://console.ncloud.com/naver-service/application

# 3. 브라우저 콘솔에서 오류 확인
# "Quota exceeded" - 사용량 초과
# "Invalid client" - Client ID 오류
```

### 문제: API 호출 CORS 오류
```bash
# 1. ops-admin-api의 CORS 설정 확인
# CORS_ORIGIN에 프론트엔드 URL이 포함되어 있는지

# 2. 프록시 설정 (개발 환경)
# next.config.ts에서 rewrites 설정
```

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8081/:path*',
      },
    ];
  },
};
```

### 문제: 빌드 시 타입 오류
```bash
# 1. 타입 체크
npx tsc --noEmit

# 2. 의존성 버전 확인
npm ls @types/react

# 3. node_modules 재설치
rm -rf node_modules package-lock.json
npm install
```

### 문제: Docker 빌드 시 환경변수 누락
```bash
# Next.js는 빌드 타임에 NEXT_PUBLIC_* 변수를 인라인함
# 런타임에 변경 불가

# 해결: 빌드 시 --build-arg로 전달
docker build \
  --build-arg NEXT_PUBLIC_API_BASE=https://api.example.com \
  -t ops-admin-web .
```

---

## 연락처

문제가 있으면 팀 Slack 채널 `#ops-frontend`에 문의하세요.
