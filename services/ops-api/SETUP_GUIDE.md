# ops-api 레포지토리 설정 가이드

> 클라이언트(iOS/Android) 앱을 위한 API 서버

## 목차

1. [개요](#1-개요)
2. [레포지토리 생성](#2-레포지토리-생성)
3. [로컬 개발 환경 설정](#3-로컬-개발-환경-설정)
4. [환경 변수 설정](#4-환경-변수-설정)
5. [데이터베이스 설정](#5-데이터베이스-설정)
6. [빌드 및 실행](#6-빌드-및-실행)
7. [Docker 설정](#7-docker-설정)
8. [CI/CD 설정 (GitHub Actions)](#8-cicd-설정-github-actions)
9. [ECS Fargate 배포](#9-ecs-fargate-배포)
10. [다른 서비스와의 연동](#10-다른-서비스와의-연동)
11. [트러블슈팅](#11-트러블슈팅)

---

## 1. 개요

### 기술 스택
- **Runtime**: Node.js 20 LTS
- **Framework**: NestJS 11.x
- **Language**: TypeScript (strict mode)
- **ORM**: Prisma 6.x
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **Push**: APNs (VoIP + Alert)

### 포트
- **8080** (HTTP)

### 주요 기능
- 카카오 로그인 / JWT 인증
- 사용자/보호자/피보호자 관리
- LiveKit RTC 토큰 발급
- 통화 초대/응답/종료
- APNs 푸시 알림
- Redis Event Bus (서버간 통신)

### 폴더 구조
```
ops-api/
├── src/
│   ├── main.ts                 # 엔트리포인트
│   ├── app.module.ts           # 루트 모듈
│   ├── app.controller.ts       # 헬스체크, 웹훅
│   ├── common/                 # 공용 (Guards, Filters, Decorators)
│   ├── prisma/                 # Prisma 모듈
│   ├── database/               # DB 서비스, Repository
│   ├── infrastructure/         # Event Bus
│   ├── internal/               # 내부 API (서버간 통신)
│   ├── auth/                   # 인증 모듈
│   ├── users/                  # 사용자 모듈
│   ├── guardians/              # 보호자 모듈
│   ├── wards/                  # 피보호자 모듈
│   ├── calls/                  # 통화 모듈
│   ├── rooms/                  # 방 모듈
│   ├── rtc/                    # RTC 토큰 모듈
│   ├── devices/                # 디바이스 모듈
│   ├── push/                   # 푸시 모듈
│   ├── events/                 # SSE 이벤트 모듈
│   ├── ai/                     # AI 분석 모듈
│   └── scheduler/              # 스케줄러 모듈
├── prisma/
│   ├── schema.prisma           # Prisma 스키마
│   └── migrations/             # 마이그레이션 파일
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## 2. 레포지토리 생성

### Step 1: GitHub 레포 생성
```bash
# GitHub CLI 사용
gh repo create Namanmoo-Damso/ops-api --private --description "OPS 클라이언트 API 서버"

# 또는 GitHub 웹에서 직접 생성
# https://github.com/new
```

### Step 2: 로컬에서 폴더 복사 및 초기화
```bash
# ops_backend에서 ops-api 폴더 복사
cp -r /path/to/ops_backend/services/ops-api ~/projects/ops-api
cd ~/projects/ops-api

# Git 초기화
git init
git remote add origin git@github.com:Namanmoo-Damso/ops-api.git

# .gitignore 생성
cat > .gitignore << 'EOF'
# Dependencies
node_modules/

# Build
dist/

# Environment
.env
.env.*
!.env.example

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Prisma
src/generated/

# Secrets
secrets/
*.p8
*.pem

# Test
coverage/
EOF

# 초기 커밋
git add .
git commit -m "chore: 레포지토리 초기화"
git branch -M main
git push -u origin main
```

### Step 3: 브랜치 보호 규칙 설정
```bash
# GitHub CLI로 브랜치 보호 설정
gh api repos/Namanmoo-Damso/ops-api/branches/main/protection -X PUT \
  -f required_status_checks='{"strict":true,"contexts":["build"]}' \
  -f enforce_admins=false \
  -f required_pull_request_reviews='{"required_approving_review_count":1}'
```

---

## 3. 로컬 개발 환경 설정

### 필수 소프트웨어
```bash
# Node.js 20 설치 (nvm 사용 권장)
nvm install 20
nvm use 20

# 버전 확인
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 의존성 설치
```bash
cd ops-api
npm install
```

### Prisma Client 생성
```bash
npx prisma generate
```

### VS Code 권장 확장
```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "ms-azuretools.vscode-docker"
  ]
}
```

### VS Code 설정
```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true
  }
}
```

---

## 4. 환경 변수 설정

### .env.example 생성
```bash
cat > .env.example << 'EOF'
# Server
PORT=8080
NODE_ENV=development

# Database
DATABASE_URL=postgresql://damso:damso@localhost:5432/damso

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret-at-least-32-characters
JWT_EXPIRES_IN=7d

# Kakao OAuth
KAKAO_CLIENT_ID=your-kakao-client-id
KAKAO_CLIENT_SECRET=your-kakao-client-secret

# LiveKit
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# APNs (iOS Push)
APNS_KEY_ID=your-key-id
APNS_TEAM_ID=your-team-id
APNS_BUNDLE_ID=com.your.app
APNS_KEY_PATH=/secrets/AuthKey.p8

# Internal API (서버간 통신)
INTERNAL_API_SECRET=shared-secret-with-ops-admin-api

# OpenAI (AI 분석용, 선택)
OPENAI_API_KEY=sk-your-openai-key

# CORS
CORS_ORIGIN=*
EOF
```

### 로컬 .env 파일 생성
```bash
cp .env.example .env
# .env 파일을 열어 실제 값으로 수정
```

### 환경 변수 설명

| 변수 | 필수 | 설명 |
|------|------|------|
| `PORT` | O | 서버 포트 (기본: 8080) |
| `NODE_ENV` | O | 환경 (development/production) |
| `DATABASE_URL` | O | PostgreSQL 연결 URL |
| `REDIS_URL` | O | Redis 연결 URL |
| `JWT_SECRET` | O | JWT 서명 키 (32자 이상) |
| `LIVEKIT_API_KEY` | O | LiveKit API 키 |
| `LIVEKIT_API_SECRET` | O | LiveKit API 시크릿 |
| `APNS_KEY_PATH` | O | APNs .p8 키 파일 경로 |
| `INTERNAL_API_SECRET` | O | ops-admin-api와 공유하는 시크릿 |

---

## 5. 데이터베이스 설정

### 로컬 PostgreSQL 실행 (Docker)
```bash
docker run -d \
  --name ops-postgres \
  -e POSTGRES_USER=damso \
  -e POSTGRES_PASSWORD=damso \
  -e POSTGRES_DB=damso \
  -p 5432:5432 \
  postgres:16
```

### 로컬 Redis 실행 (Docker)
```bash
docker run -d \
  --name ops-redis \
  -p 6379:6379 \
  redis:7-alpine
```

### Prisma 마이그레이션
```bash
# 개발 환경 - 마이그레이션 생성 및 적용
npx prisma migrate dev --name init

# 프로덕션 환경 - 마이그레이션만 적용
npx prisma migrate deploy
```

### Prisma Studio (DB GUI)
```bash
npx prisma studio
# http://localhost:5555 에서 확인
```

---

## 6. 빌드 및 실행

### 개발 모드 (Hot Reload)
```bash
npm run start:dev
```

### 프로덕션 빌드
```bash
npm run build
```

### 프로덕션 실행
```bash
npm run start:prod
# 또는
node dist/main.js
```

### 헬스 체크
```bash
curl http://localhost:8080/healthz
# 응답: {"status":"ok","timestamp":"..."}
```

### 테스트
```bash
# 단위 테스트
npm test

# E2E 테스트
npm run test:e2e

# 커버리지
npm run test:cov
```

---

## 7. Docker 설정

### Dockerfile (이미 제공됨)
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src/generated ./dist/generated
COPY --from=build /app/prisma ./prisma
COPY package*.json ./

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/main.js"]
```

### 로컬 Docker 빌드 및 실행
```bash
# 빌드
docker build -t ops-api .

# 실행 (환경변수는 --env-file 또는 -e로 전달)
docker run -d \
  --name ops-api \
  -p 8080:8080 \
  --env-file .env \
  -v $(pwd)/secrets:/secrets:ro \
  ops-api
```

### docker-compose.yml (로컬 개발용)
```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://damso:damso@db:5432/damso
      - REDIS_URL=redis://redis:6379
    env_file:
      - .env
    volumes:
      - ./secrets:/secrets:ro
    depends_on:
      - db
      - redis

  db:
    image: postgres:16
    environment:
      - POSTGRES_USER=damso
      - POSTGRES_PASSWORD=damso
      - POSTGRES_DB=damso
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
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

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: damso
          POSTGRES_PASSWORD: damso
          POSTGRES_DB: damso
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate

      - name: Run lint
        run: npm run lint

      - name: Run build
        run: npm run build

      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://damso:damso@localhost:5432/damso
          JWT_SECRET: test-jwt-secret-for-ci-testing

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
          ECR_REPOSITORY: ops-api
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:latest .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
```

### GitHub Secrets 설정
Repository Settings > Secrets and variables > Actions에서 추가:

| Secret | 설명 |
|--------|------|
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Key |

---

## 9. ECS Fargate 배포

### ECR 레포지토리 생성
```bash
aws ecr create-repository \
  --repository-name ops-api \
  --region ap-northeast-2
```

### ECS Task Definition (task-definition.json)
```json
{
  "family": "ops-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "ops-api",
      "image": "ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ops-api:latest",
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "8080"}
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/api/DATABASE_URL"
        },
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/api/JWT_SECRET"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ops-api",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/healthz || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

### ECS 서비스 생성
```bash
# Task Definition 등록
aws ecs register-task-definition --cli-input-json file://task-definition.json

# 서비스 생성
aws ecs create-service \
  --cluster ops-cluster \
  --service-name ops-api \
  --task-definition ops-api \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

---

## 10. 다른 서비스와의 연동

### ops-admin-api와의 통신

ops-api는 Internal API를 통해 ops-admin-api와 통신합니다.

#### 인바운드 (ops-admin-api → ops-api)
```
GET /internal/users/:id     # 사용자 정보 조회
GET /internal/wards/:id     # 피보호자 정보 조회
GET /internal/devices/user/:userId  # 디바이스 목록 조회
```

인증: `X-Internal-Secret` 헤더에 `INTERNAL_API_SECRET` 값 전달

#### 아웃바운드 (ops-api → ops-admin-api)
환경 변수 `OPS_ADMIN_API_URL` 설정 필요 (선택)

### ops-shared 패키지 사용

공유 타입이 필요한 경우:
```bash
# ops-shared가 npm에 배포된 경우
npm install @namanmoo/ops-shared

# 또는 로컬 링크 (monorepo)
npm link ../ops-shared
```

### Redis Event Bus

서버간 이벤트 통신:
```typescript
// 이벤트 발행
await eventBus.publish('call:started', { callId, roomName });

// 이벤트 구독
eventBus.subscribe('call:ended', (event) => {
  console.log('Call ended:', event);
});
```

---

## 11. 트러블슈팅

### 문제: Prisma Client 생성 오류
```bash
# 해결
rm -rf node_modules/.prisma
rm -rf src/generated
npx prisma generate
```

### 문제: APNs 푸시 실패
```bash
# 1. .p8 키 파일 경로 확인
ls -la /secrets/AuthKey.p8

# 2. 환경변수 확인
echo $APNS_KEY_ID
echo $APNS_TEAM_ID
echo $APNS_BUNDLE_ID

# 3. 인증서 권한 확인
chmod 600 /secrets/AuthKey.p8
```

### 문제: Redis 연결 실패
```bash
# Redis 연결 테스트
redis-cli -h localhost -p 6379 ping
# 응답: PONG
```

### 문제: LiveKit 토큰 발급 실패
```bash
# 환경변수 확인
echo $LIVEKIT_API_KEY
echo $LIVEKIT_API_SECRET

# LiveKit 서버 연결 확인
curl https://your-livekit-server.com/healthz
```

### 문제: Docker 빌드 시 메모리 부족
```bash
# Docker 빌드 시 메모리 제한 늘리기
docker build --memory=4g -t ops-api .
```

---

## 연락처

문제가 있으면 팀 Slack 채널 `#ops-backend`에 문의하세요.
