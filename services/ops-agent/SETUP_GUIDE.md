# ops-agent 레포지토리 설정 가이드

> 어르신 케어 AI 어시스턴트 (LiveKit Agents + AWS Bedrock)

## 목차

1. [개요](#1-개요)
2. [레포지토리 생성](#2-레포지토리-생성)
3. [로컬 개발 환경 설정](#3-로컬-개발-환경-설정)
4. [AWS 설정](#4-aws-설정)
5. [환경 변수 설정](#5-환경-변수-설정)
6. [실행](#6-실행)
7. [Docker 설정](#7-docker-설정)
8. [CI/CD 설정](#8-cicd-설정)
9. [ECS Fargate 배포](#9-ecs-fargate-배포)
10. [에이전트 커스터마이징](#10-에이전트-커스터마이징)
11. [트러블슈팅](#11-트러블슈팅)

---

## 1. 개요

### 역할
- LiveKit 방에 자동 참가하는 AI 어시스턴트
- 어르신과 음성 대화
- 음성 인식 (STT) → LLM 응답 → 음성 합성 (TTS)

### 기술 스택
- **Language**: Python 3.11+
- **Framework**: LiveKit Agents SDK
- **STT**: AWS Transcribe (한국어)
- **LLM**: AWS Bedrock (Claude 3 Haiku)
- **TTS**: AWS Polly (Seoyeon 음성, 한국어)

### 아키텍처
```
┌─────────────────────────────────────────────────────────────┐
│                      LiveKit Server                         │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │   어르신    │◄──►│   관제자    │◄──►│  ops-agent  │    │
│  │  (iOS 앱)   │    │   (Web)     │    │  (Python)   │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
│                                                │            │
└────────────────────────────────────────────────┼────────────┘
                                                 │
                           ┌─────────────────────┼─────────────────────┐
                           │                     ▼                     │
                           │            ┌───────────────┐              │
                           │            │  AWS Bedrock  │              │
                           │            │  (Claude LLM) │              │
                           │            └───────────────┘              │
                           │                                           │
                           │  ┌───────────────┐    ┌───────────────┐  │
                           │  │ AWS Transcribe│    │  AWS Polly    │  │
                           │  │    (STT)      │    │    (TTS)      │  │
                           │  └───────────────┘    └───────────────┘  │
                           │                                           │
                           │                  AWS                      │
                           └───────────────────────────────────────────┘
```

### 폴더 구조
```
ops-agent/
├── main.py             # 메인 에이전트 코드
├── requirements.txt    # Python 의존성
├── Dockerfile          # 컨테이너 빌드
├── .env.example        # 환경 변수 예시
└── SETUP_GUIDE.md      # 이 문서
```

---

## 2. 레포지토리 생성

### Step 1: GitHub 레포 생성
```bash
gh repo create Namanmoo-Damso/ops-agent --private --description "OPS AI 어시스턴트 (LiveKit Agent)"
```

### Step 2: 로컬에서 폴더 복사 및 초기화
```bash
# ops_backend에서 ops-agent 폴더 복사
cp -r /path/to/ops_backend/services/ops-agent ~/projects/ops-agent
cd ~/projects/ops-agent

# Git 초기화
git init
git remote add origin git@github.com:Namanmoo-Damso/ops-agent.git

# .gitignore 생성
cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Virtual Environment
venv/
.venv/
ENV/
env/
.env

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Local config
.env
.env.local
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

#### Python 3.11+ 설치
```bash
# macOS (Homebrew)
brew install python@3.11

# Ubuntu
sudo apt update
sudo apt install python3.11 python3.11-venv

# pyenv 사용 (권장)
pyenv install 3.11
pyenv local 3.11
```

#### 버전 확인
```bash
python3 --version  # Python 3.11.x
pip3 --version
```

### 가상 환경 설정

```bash
cd ops-agent

# 가상 환경 생성
python3 -m venv venv

# 가상 환경 활성화
# macOS/Linux:
source venv/bin/activate

# Windows:
.\venv\Scripts\activate

# 프롬프트가 (venv)로 시작하면 성공
```

### 의존성 설치

```bash
pip install -r requirements.txt
```

### requirements.txt 내용
```
livekit-agents>=0.12.0
livekit-plugins-aws>=0.2.0
python-dotenv>=1.0.0
```

### VS Code 설정 (권장)

```json
// .vscode/settings.json
{
  "python.defaultInterpreterPath": "./venv/bin/python",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "python.formatting.provider": "black",
  "editor.formatOnSave": true
}
```

---

## 4. AWS 설정

### 필요한 AWS 서비스
1. **AWS Bedrock** - Claude 3 Haiku 모델
2. **AWS Transcribe** - 음성 인식 (STT)
3. **AWS Polly** - 음성 합성 (TTS)

### IAM 정책 설정

#### Bedrock 권한
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
      ]
    }
  ]
}
```

#### Transcribe 권한
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartStreamTranscription"
      ],
      "Resource": "*"
    }
  ]
}
```

#### Polly 권한
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "polly:SynthesizeSpeech"
      ],
      "Resource": "*"
    }
  ]
}
```

### Bedrock 모델 접근 권한 요청

1. AWS Console > Bedrock > Model access
2. "Manage model access" 클릭
3. `anthropic.claude-3-haiku-20240307-v1:0` 또는 `anthropic.claude-haiku-4-5-v1:0` 선택
4. Request access → 승인 대기 (보통 즉시 승인)

### IAM 사용자 생성

```bash
# AWS CLI로 사용자 생성
aws iam create-user --user-name ops-agent

# 정책 연결
aws iam attach-user-policy --user-name ops-agent \
  --policy-arn arn:aws:iam::aws:policy/AmazonTranscribeFullAccess

aws iam attach-user-policy --user-name ops-agent \
  --policy-arn arn:aws:iam::aws:policy/AmazonPollyFullAccess

# Bedrock은 인라인 정책으로 추가
aws iam put-user-policy --user-name ops-agent \
  --policy-name BedrockInvokeModel \
  --policy-document file://bedrock-policy.json

# Access Key 생성
aws iam create-access-key --user-name ops-agent
# → AccessKeyId와 SecretAccessKey 저장
```

---

## 5. 환경 변수 설정

### .env 파일 생성
```bash
cp .env.example .env
```

### .env 내용
```bash
# LiveKit 서버
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# AWS 인증
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_DEFAULT_REGION=ap-northeast-2

# (선택) 로그 레벨
LOG_LEVEL=INFO
```

### 환경 변수 설명

| 변수 | 필수 | 설명 |
|------|------|------|
| `LIVEKIT_URL` | O | LiveKit 서버 WebSocket URL |
| `LIVEKIT_API_KEY` | O | LiveKit API Key |
| `LIVEKIT_API_SECRET` | O | LiveKit API Secret |
| `AWS_ACCESS_KEY_ID` | O | AWS IAM Access Key |
| `AWS_SECRET_ACCESS_KEY` | O | AWS IAM Secret Key |
| `AWS_DEFAULT_REGION` | O | AWS 리전 (ap-northeast-2 권장) |

---

## 6. 실행

### 개발 모드 (단일 실행)
```bash
# 가상 환경 활성화
source venv/bin/activate

# 에이전트 실행
python main.py dev
```

### 프로덕션 모드 (Worker)
```bash
python main.py start
```

### 실행 모드 설명

| 모드 | 명령어 | 설명 |
|------|--------|------|
| `dev` | `python main.py dev` | 개발용, 단일 방 테스트 |
| `start` | `python main.py start` | Worker 모드, 자동 방 할당 |
| `connect` | `python main.py connect --room <name>` | 특정 방에 직접 연결 |

### 테스트

1. LiveKit 서버 실행 확인
2. ops-admin-web에서 방 생성
3. ops-agent 실행
4. 방에 AI가 자동 참가하는지 확인

```bash
# 특정 방 테스트
python main.py connect --room demo-room
```

---

## 7. Docker 설정

### Dockerfile (이미 제공됨)
```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py", "start"]
```

### 로컬 Docker 빌드 및 실행
```bash
# 빌드
docker build -t ops-agent .

# 실행
docker run -d \
  --name ops-agent \
  -e LIVEKIT_URL=wss://your-livekit-server.com \
  -e LIVEKIT_API_KEY=your-api-key \
  -e LIVEKIT_API_SECRET=your-api-secret \
  -e AWS_ACCESS_KEY_ID=your-access-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret-key \
  -e AWS_DEFAULT_REGION=ap-northeast-2 \
  ops-agent

# 로그 확인
docker logs -f ops-agent
```

### docker-compose.yml (로컬 개발용)
```yaml
services:
  agent:
    build: .
    environment:
      - LIVEKIT_URL=${LIVEKIT_URL}
      - LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
      - LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION}
    restart: unless-stopped
```

```bash
# 실행
docker compose up -d
```

---

## 8. CI/CD 설정

### .github/workflows/ci.yml
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install pytest pylint black

      - name: Lint with pylint
        run: pylint main.py --disable=all --enable=E

      - name: Check formatting with black
        run: black --check main.py

  docker:
    needs: test
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
          ECR_REPOSITORY: ops-agent
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
| `AWS_ACCESS_KEY_ID` | ECR 푸시용 AWS Access Key |
| `AWS_SECRET_ACCESS_KEY` | ECR 푸시용 AWS Secret Key |

---

## 9. ECS Fargate 배포

### ECR 레포지토리 생성
```bash
aws ecr create-repository \
  --repository-name ops-agent \
  --region ap-northeast-2
```

### ECS Task Definition
```json
{
  "family": "ops-agent",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ops-agent-task-role",
  "containerDefinitions": [
    {
      "name": "ops-agent",
      "image": "ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ops-agent:latest",
      "environment": [
        {"name": "PYTHONUNBUFFERED", "value": "1"}
      ],
      "secrets": [
        {
          "name": "LIVEKIT_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/agent/LIVEKIT_URL"
        },
        {
          "name": "LIVEKIT_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/agent/LIVEKIT_API_KEY"
        },
        {
          "name": "LIVEKIT_API_SECRET",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/agent/LIVEKIT_API_SECRET"
        },
        {
          "name": "AWS_ACCESS_KEY_ID",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/agent/AWS_ACCESS_KEY_ID"
        },
        {
          "name": "AWS_SECRET_ACCESS_KEY",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:ACCOUNT_ID:secret:ops/agent/AWS_SECRET_ACCESS_KEY"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ops-agent",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### Task Role 생성

Task Role에는 Bedrock, Transcribe, Polly 접근 권한 필요:

```bash
# Trust Policy
cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Role 생성
aws iam create-role \
  --role-name ops-agent-task-role \
  --assume-role-policy-document file://trust-policy.json

# 정책 연결
aws iam attach-role-policy \
  --role-name ops-agent-task-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonTranscribeFullAccess

aws iam attach-role-policy \
  --role-name ops-agent-task-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonPollyFullAccess

# Bedrock 인라인 정책 추가
aws iam put-role-policy \
  --role-name ops-agent-task-role \
  --policy-name BedrockInvokeModel \
  --policy-document file://bedrock-policy.json
```

---

## 10. 에이전트 커스터마이징

### 프롬프트 수정

```python
# main.py

class OpsAssistant(Agent):
    def __init__(self):
        super().__init__(
            instructions="""
당신은 어르신들을 돌보는 친절한 AI 어시스턴트입니다.

## 역할
- 어르신의 안부를 물어봅니다
- 건강 상태를 확인합니다
- 필요시 보호자에게 연락할 수 있도록 안내합니다

## 말투
- 항상 존댓말을 사용하세요
- 천천히, 명확하게 말씀해 주세요
- 따뜻하고 친근한 말투를 사용하세요

## 대화 예시
- "안녕하세요, 어르신. 오늘 기분은 어떠세요?"
- "식사는 잘 하셨나요?"
- "혹시 불편한 곳은 없으신가요?"

## 주의사항
- 의료 조언은 하지 않습니다
- 긴급 상황 시 즉시 보호자 연락을 안내합니다
"""
        )
```

### 음성 설정 변경

```python
# 다른 한국어 음성으로 변경
tts=aws.TTS(voice="Seoyeon"),    # 여성 (기본)
# tts=aws.TTS(voice="Zhiyu"),   # 다른 옵션

# 음성 속도 조절
tts=aws.TTS(voice="Seoyeon", speech_rate="slow"),
```

### LLM 모델 변경

```python
# Claude 3 Haiku (기본, 빠름)
llm=aws.LLM(model="anthropic.claude-3-haiku-20240307-v1:0"),

# Claude 3 Sonnet (더 정확)
llm=aws.LLM(model="anthropic.claude-3-sonnet-20240229-v1:0"),

# Claude 3.5 Sonnet (최신)
llm=aws.LLM(model="anthropic.claude-3-5-sonnet-20241022-v2:0"),
```

### 고급: 함수 호출 (Tool Use)

```python
from livekit.agents import function_tool

class OpsAssistant(Agent):
    def __init__(self):
        super().__init__(
            instructions="...",
            tools=[self.notify_guardian, self.get_weather],
        )

    @function_tool
    async def notify_guardian(self, message: str) -> str:
        """보호자에게 알림을 보냅니다."""
        # ops-api 호출하여 푸시 알림 발송
        # ...
        return "보호자에게 알림을 보냈습니다."

    @function_tool
    async def get_weather(self, location: str) -> str:
        """날씨 정보를 조회합니다."""
        # 날씨 API 호출
        # ...
        return f"{location}의 오늘 날씨는 맑음입니다."
```

---

## 11. 트러블슈팅

### 문제: LiveKit 연결 실패
```bash
# 1. LiveKit URL 확인 (wss:// 프로토콜)
echo $LIVEKIT_URL

# 2. API Key/Secret 확인
echo $LIVEKIT_API_KEY

# 3. LiveKit 서버 상태 확인
curl https://your-livekit-server.com/healthz

# 4. 방 존재 여부 확인
# LiveKit CLI 사용
lk room list --url wss://your-livekit-server.com \
  --api-key $LIVEKIT_API_KEY \
  --api-secret $LIVEKIT_API_SECRET
```

### 문제: AWS Bedrock 접근 오류
```bash
# 1. 모델 접근 권한 확인
# AWS Console > Bedrock > Model access

# 2. IAM 정책 확인
aws iam list-attached-user-policies --user-name ops-agent

# 3. 리전 확인 (Bedrock 지원 리전인지)
echo $AWS_DEFAULT_REGION
# ap-northeast-2 (서울) 또는 us-east-1, us-west-2
```

### 문제: Transcribe 오류 (STT)
```bash
# 1. 언어 설정 확인
# ko-KR 인지 확인

# 2. 오디오 형식 확인
# LiveKit에서 PCM 16bit, 16kHz 사용

# 3. 리전별 서비스 가용성 확인
```

### 문제: Polly 오류 (TTS)
```bash
# 1. 음성 이름 확인
# 한국어: Seoyeon

# 2. SSML 오류 시
# 특수문자 escape 필요

# 3. 텍스트 길이 제한
# 최대 3000자
```

### 문제: 에이전트가 방에 참가하지 않음
```bash
# 1. Worker 모드로 실행 중인지 확인
python main.py start  # dev가 아닌 start

# 2. 방 이름 규칙 확인
# 에이전트 디스패치 설정 확인

# 3. 로그 확인
docker logs ops-agent 2>&1 | grep -i error
```

### 문제: 음성이 끊김
```bash
# 1. 네트워크 대역폭 확인
# 최소 1Mbps 권장

# 2. CPU/메모리 사용량 확인
# ECS에서 512 CPU / 1024 MB 이상 권장

# 3. LiveKit 서버 위치
# 사용자와 가까운 리전 사용
```

### 로그 디버깅

```python
# main.py에 로깅 추가
import logging

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 사용
logger.debug(f"Room joined: {ctx.room.name}")
logger.info(f"Participant: {ctx.room.local_participant}")
```

---

## 참고 자료

- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS Transcribe Streaming](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)
- [AWS Polly Voices](https://docs.aws.amazon.com/polly/latest/dg/voicelist.html)

---

## 연락처

문제가 있으면 팀 Slack 채널 `#ops-ai`에 문의하세요.
