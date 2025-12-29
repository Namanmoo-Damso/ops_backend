---
description: 이슈 기반 작업 시작 - feature 브랜치 생성 및 프로젝트 상태 업데이트
---

# /start-work 워크플로우

> **사용법:** `/start-work <이슈번호>` 또는 `/start-work <이슈번호> <브랜치설명>`

---

## 1. 인자 확인

```bash
ISSUE_NUM=$1
BRANCH_SUFFIX=$2  # 선택사항
```

**인자가 없는 경우:** 열린 이슈 목록 표시

```bash
gh issue list --state open --limit 20
```

---

## 2. 이슈 정보 조회

```bash
ISSUE_TITLE=$(gh issue view $ISSUE_NUM --json title --jq '.title')
ISSUE_LABELS=$(gh issue view $ISSUE_NUM --json labels --jq '.labels[].name')
```

**이슈가 없는 경우:** "이슈 #$ISSUE_NUM을 찾을 수 없습니다." 안내 후 중단

---

## 3. 브랜치 타입 결정

| 레이블 | 브랜치 타입 |
|--------|-------------|
| `bug`, `fix` | `fix/` |
| `enhancement`, `feature` | `feature/` |
| `hotfix`, `urgent` | `hotfix/` |
| 기타 | `feature/` (기본값) |

---

## 4. 브랜치명 생성

```bash
# 브랜치 설명이 없으면 이슈 제목에서 생성
if [ -z "$BRANCH_SUFFIX" ]; then
  # 이슈 제목에서 특수문자 제거, 공백을 하이픈으로
  BRANCH_SUFFIX=$(echo "$ISSUE_TITLE" | \
    sed 's/\[.*\]//g' | \
    tr '[:upper:]' '[:lower:]' | \
    tr ' ' '-' | \
    tr -cd '[:alnum:]-' | \
    head -c 30)
fi

BRANCH_NAME="${BRANCH_TYPE}${ISSUE_NUM}-${BRANCH_SUFFIX}"
```

**예시:**
- Issue #1 "DB 스키마 확장" → `feature/1-db-schema-extension`
- Issue #5 "매칭 버그 수정" → `fix/5-matching-bug`

---

## 5. 현재 브랜치 상태 확인

```bash
git status --porcelain
```

**변경사항이 있는 경우:**
```
현재 브랜치에 커밋되지 않은 변경사항이 있습니다.
- stash: 변경사항 임시 저장 후 진행
- commit: 현재 변경사항 커밋 후 진행
- abort: 작업 중단

어떻게 진행할까요?
```

---

## 6. develop 브랜치 최신화

```bash
git fetch origin develop
git checkout develop
git pull origin develop
```

---

## 7. 새 브랜치 생성 및 체크아웃

```bash
git checkout -b $BRANCH_NAME
git push -u origin $BRANCH_NAME
```

---

## 8. 이슈 상태 업데이트 (선택)

```bash
# 이슈에 작업 시작 코멘트 추가
gh issue comment $ISSUE_NUM --body "작업 시작: \`$BRANCH_NAME\` 브랜치에서 진행 중"

# 이슈에 assignee 추가 (현재 사용자)
gh issue edit $ISSUE_NUM --add-assignee @me
```

---

## 9. 최종 보고

| 항목 | 값 |
|------|-----|
| 이슈 | #$ISSUE_NUM |
| 제목 | $ISSUE_TITLE |
| 브랜치 | `$BRANCH_NAME` |
| Base | `develop` |
| 상태 | 작업 준비 완료 |

**다음 단계:**
1. 기능 구현
2. 테스트 작성 (`cd api && npm test`)
3. `/smart-commit` 으로 커밋 & PR 생성

---

## 전체 흐름도

```
/start-work <이슈번호>
  │
  ▼
이슈 존재 확인
  │
  ├─ No ──▶ 에러 출력 & 중단
  │
  ▼ Yes
브랜치 타입 결정 (feature/fix/hotfix)
  │
  ▼
브랜치명 생성
  │
  ▼
현재 변경사항 확인
  │
  ├─ 있음 ──▶ stash/commit/abort 선택
  │
  ▼ 없음
develop 최신화
  │
  ▼
새 브랜치 생성 & 푸시
  │
  ▼
이슈 상태 업데이트
  │
  ▼
작업 준비 완료 보고
```

---

## 예시

### 기본 사용

```
/start-work 1
```

**출력:**
```
이슈 #1: [Feature] 1. DB 스키마 확장 (보호자/어르신 시스템)

브랜치 생성: feature/1-db-schema-extension
Base: develop

작업 준비가 완료되었습니다.

다음 단계:
1. db/init.sql 수정
2. cd api && npm run build
3. /smart-commit
```

### 커스텀 브랜치 설명

```
/start-work 2 kakao-oauth
```

**출력:**
```
이슈 #2: [Feature] 2. 카카오 로그인 API

브랜치 생성: feature/2-kakao-oauth
Base: develop

작업 준비가 완료되었습니다.
```

---

## 주의사항

1. **이슈 번호 필수** - 이슈 없이 브랜치 생성 불가
2. **develop 기반** - 모든 feature/fix 브랜치는 develop에서 분기
3. **hotfix만 예외** - hotfix/*는 master에서 분기
4. **원격 푸시** - 브랜치 생성 시 자동으로 원격에 푸시
