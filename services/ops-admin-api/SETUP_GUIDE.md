# ops-admin-api 레포지토리 설정 가이드

> 관제 웹(ops-admin-web)을 위한 API 서버

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

### 포트
- **8081** (HTTP)

### 주요 기능
- 관제자 OAuth 로그인 (카카오, 구글)
- 대시보드 통계 API
- 피보호자 관리 (CRUD, CSV 일괄 등록)
- 위치 정보 조회
- 비상 연락 시스템
- SSE 실시간 데이터 스트림

### 폴더 구조
```
ops-admin-api/
├── src/
│   ├── main.ts                 # 엔트리포인트 (포트 8081)
│   ├── app.module.ts           # 루트 모듈
│   ├── common/                 # 공용 (Guards, Filters, Decorators)
│   ├── prisma/                 # Prisma 모듈
│   ├── database/               # DB 서비스, Repository
│   ├── infrastructure/         # Event Bus
│   ├── internal/               # 내부 API Client (ops-api 호출)
│   ├── auth/                   # 공용 인증 서비스
│   ├── admin-auth/             # 관제자 인증 (OAuth)
│   ├── dashboard/              # 대시보드 통계
│   ├── wards-management/       # 피보호자 관리
│   ├── locations/              # 위치 정보
│   ├── emergencies/            # 비상 연락
│   ├── users/                  # 사용자 서비스
│   ├── wards/                  # 피보호자 서비스
│   ├── devices/                # 디바이스 서비스
│   └── push/                   # 푸시 서비스
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── Dockerfile
├── package.json
└── tsconfig.json
```

### ops-api와의 차이점

| 구분 | ops-api | ops-admin-api |
|------|---------|---------------|
| 대상 | iOS/Android 앱 | 관제 웹 |
| 포트 | 8080 | 8081 |
| 인증 | JWT (앱 사용자) | JWT (관제자) |
| 주요 기능 | 통화, 푸시, RTC | 대시보드, 관리 |

---

## 2. 레포지토리 생성

### Step 1: GitHub 레포 생성
```bash
gh repo create Namanmoo-Damso/ops-admin-api --private --description "OPS 관제 API 서버"
```

### Step 2: 로컬에서 폴더 복사 및 초기화
```bash
# ops_backend에서 ops-admin-api 폴더 복사
cp -r /path/to/ops_backend/services/ops-admin-api ~/projects/ops-admin-api
cd ~/projects/ops-admin-api

# Git 초기화
git init
git remote add origin git@github.com:Namanmoo-Damso/ops-admin-api.git

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

# Uploads (임시 파일)
uploads/
*.csv

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
gh api repos/Namanmoo-Damso/ops-admin-api/branches/main/protection -X PUT \
  -f required_status_checks='{"strict":true,"contexts":["build"]}' \
  -f enforce_admins=false \
  -f required_pull_request_reviews='{"required_approving_review_count":1}'
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
cd ops-admin-api
npm install
```

### Prisma Client 생성
```bash
npx prisma generate
```

---

## 4. 환경 변수 설정

### .env.example 생성
```bash
cat > .env.example << 'EOF'
# Server
PORT=8081
NODE_ENV=development

# Database (ops-api와 동일한 DB 사용)
DATABASE_URL=postgresql://damso:damso@localhost:5432/damso

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret-at-least-32-characters
JWT_EXPIRES_IN=7d

# Admin JWT (관제자 전용)
ADMIN_JWT_SECRET=admin-jwt-secret-different-from-app
ADMIN_JWT_EXPIRES_IN=8h

# Kakao OAuth (관제자용)
KAKAO_ADMIN_CLIENT_ID=your-kakao-admin-client-id
KAKAO_ADMIN_CLIENT_SECRET=your-kakao-admin-client-secret
KAKAO_ADMIN_REDIRECT_URI=http://localhost:3000/login/callback

# Google OAuth (관제자용)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/login/callback

# Internal API (ops-api와 통신)
INTERNAL_API_SECRET=shared-secret-with-ops-api
OPS_API_URL=http://localhost:8080

# CORS
CORS_ORIGIN=http://localhost:3000
EOF
```

### 로컬 .env 파일 생성
```bash
cp .env.example .env
```

### 환경 변수 설명

| 변수 | 필수 | 설명 |
|------|------|------|
| `PORT` | O | 서버 포트 (기본: 8081) |
| `DATABASE_URL` | O | PostgreSQL 연결 URL |
| `REDIS_URL` | O | Redis 연결 URL |
| `ADMIN_JWT_SECRET` | O | 관제자 JWT 서명 키 |
| `INTERNAL_API_SECRET` | O | ops-api와 공유하는 시크릿 |
| `OPS_API_URL` | O | ops-api 서버 URL |
| `KAKAO_ADMIN_CLIENT_ID` | △ | 카카오 OAuth (선택) |
| `GOOGLE_CLIENT_ID` | △ | 구글 OAuth (선택) |

---

## 5. 데이터베이스 설정

### 중요: ops-api와 동일한 DB 사용

ops-admin-api는 ops-api와 **동일한 PostgreSQL 데이터베이스**를 사용합니다.
- 스키마는 ops-api에서 관리
- ops-admin-api는 마이그레이션 실행 **금지**
- Prisma Client만 생성하여 사용

### 로컬 개발 시
```bash
# ops-api의 DB 컨테이너가 이미 실행 중이라고 가정
# 별도 DB 컨테이너 실행 불필요

# Prisma Client 생성만 수행
npx prisma generate

# (선택) DB 스키마 확인
npx prisma studio
```

### 프로덕션 환경
- ops-api와 동일한 RDS 엔드포인트 사용
- `DATABASE_URL` 환경변수 동일하게 설정

---

## 6. 빌드 및 실행

### 개발 모드
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
curl http://localhost:8081/healthz
```

### API 테스트 예시

#### 관제자 로그인
```bash
# 카카오 OAuth 시작
curl http://localhost:8081/admin/auth/oauth/kakao?code=AUTH_CODE

# 토큰 갱신
curl -X POST http://localhost:8081/admin/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "..."}'
```

#### 대시보드 통계
```bash
curl http://localhost:8081/admin/dashboard/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### 피보호자 목록
```bash
curl http://localhost:8081/admin/my-wards \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
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
EXPOSE 8081
CMD ["node", "dist/main.js"]
```

### 로컬 Docker 실행
```bash
# 빌드
docker build -t ops-admin-api .

# 실행
docker run -d \
  --name ops-admin-api \
  -p 8081:8081 \
  --env-file .env \
  ops-admin-api
```

### docker-compose.yml (로컬 개발용)
```yaml
services:
  admin-api:
    build: .
    ports:
      - "8081:8081"
    environment:
      - DATABASE_URL=postgresql://damso:damso@db:5432/damso
      - REDIS_URL=redis://redis:6379
      - OPS_API_URL=http://ops-api:8080
    env_file:
      - .env
    depends_on:
      - db
      - redis

  # DB와 Redis는 ops-api와 공유하거나 별도 실행
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
          ADMIN_JWT_SECRET: test-admin-jwt-secret

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
          ECR_REPOSITORY: ops-admin-api
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:latest .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
```

### GitHub Secrets 설정

| Secret | 설명 |
|--------|------|
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Key |

---

## 9. ECS Fargate 배포

### ECR 레포지토리 생성
```bash
aws ecr create-repository \
  --repository-name ops-admin-api \
  --region ap-northeast-2
```

### ECS Task Definition
```json
{
  "family": "ops-admin-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "ops-admin-api",
      "image": "ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ops-admin-api:latest",
      "portMappings": [
        {
          "containerPort": 8081,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "8081"},
        {"name": "OPS_API_URL", "value": "http://ops-api.internal:8080"}
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/admin-api/DATABASE_URL"
        },
        {
          "name": "ADMIN_JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/admin-api/ADMIN_JWT_SECRET"
        },
        {
          "name": "INTERNAL_API_SECRET",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/INTERNAL_API_SECRET"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ops-admin-api",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8081/healthz || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

---

## 10. 다른 서비스와의 연동

### ops-api 호출 (Internal API Client)

ops-admin-api는 `InternalApiClient`를 통해 ops-api를 호출합니다.

```typescript
// 사용 예시
@Injectable()
export class SomeService {
  constructor(private readonly internalApi: InternalApiClient) {}

  async getUserInfo(userId: string) {
    return this.internalApi.getUser(userId);
  }

  async getWardInfo(wardId: string) {
    return this.internalApi.getWard(wardId);
  }
}
```

#### 설정
```env
OPS_API_URL=http://ops-api:8080  # 또는 http://localhost:8080
INTERNAL_API_SECRET=shared-secret
```

### ops-admin-web과의 연동

ops-admin-web은 이 API의 클라이언트입니다.

#### CORS 설정
```env
CORS_ORIGIN=http://localhost:3000,https://admin.your-domain.com
```

#### API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/admin/auth/oauth/:provider` | OAuth 로그인 |
| POST | `/admin/auth/refresh` | 토큰 갱신 |
| POST | `/admin/auth/logout` | 로그아웃 |
| GET | `/admin/auth/me` | 내 정보 |
| GET | `/admin/dashboard/stats` | 대시보드 통계 |
| GET | `/admin/my-wards` | 피보호자 목록 |
| POST | `/admin/wards/bulk-upload` | CSV 일괄 등록 |
| GET | `/admin/locations` | 위치 목록 |
| POST | `/admin/emergency` | 비상 연락 |

---

## 11. 트러블슈팅

### 문제: ops-api 연결 실패
```bash
# 1. ops-api가 실행 중인지 확인
curl http://localhost:8080/healthz

# 2. 환경변수 확인
echo $OPS_API_URL
echo $INTERNAL_API_SECRET

# 3. 네트워크 확인 (Docker 환경)
docker network ls
docker network inspect bridge
```

### 문제: OAuth 콜백 오류
```bash
# 리다이렉트 URI 확인
# 카카오 개발자 콘솔에서 등록된 URI와 환경변수가 일치해야 함

# 1. 환경변수
echo $KAKAO_ADMIN_REDIRECT_URI

# 2. 카카오 개발자 콘솔
# https://developers.kakao.com/console/app/YOUR_APP_ID/config/platform
```

### 문제: CORS 오류
```bash
# CORS_ORIGIN 환경변수 확인
echo $CORS_ORIGIN

# 여러 origin은 쉼표로 구분
# CORS_ORIGIN=http://localhost:3000,https://admin.domain.com
```

### 문제: CSV 업로드 실패
```bash
# 1. 파일 크기 확인 (기본 10MB 제한)
ls -lh upload.csv

# 2. CSV 형식 확인 (UTF-8, 헤더 필수)
head -3 upload.csv

# 3. 필수 컬럼 확인
# name, phone, address, emergency_contact
```

### 문제: Prisma 스키마 불일치
```bash
# ops-api의 최신 스키마를 가져와야 함
# ops-admin-api에서 직접 migrate 하지 말 것!

# 1. ops-api에서 최신 schema.prisma 복사
cp ../ops-api/prisma/schema.prisma ./prisma/

# 2. Prisma Client 재생성
npx prisma generate
```

---

## 연락처

문제가 있으면 팀 Slack 채널 `#ops-backend`에 문의하세요.
