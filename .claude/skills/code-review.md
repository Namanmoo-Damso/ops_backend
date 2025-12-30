---
description: 현재 PR의 코드 리뷰 수행 - 치명적/경고/제안 분류
---

# /code-review 워크플로우

> **사용법:** `/code-review` 또는 `/code-review <PR번호>`
> **언어:** 모든 리뷰 결과는 **한글**로 작성합니다.

---

## 1. PR 정보 확인

```bash
# PR 번호가 주어지지 않으면 현재 브랜치의 PR 확인
if [ -z "$PR_NUM" ]; then
  PR_NUM=$(gh pr view --json number --jq '.number' 2>/dev/null)
fi

# PR 정보 조회
PR_INFO=$(gh pr view $PR_NUM --json title,body,files,additions,deletions,changedFiles)
```

**PR이 없는 경우:** "현재 브랜치에 열린 PR이 없습니다." 안내 후 중단

---

## 2. 변경된 파일 목록 조회

```bash
gh pr diff $PR_NUM --name-only
```

---

## 3. 코드 변경사항 분석

```bash
gh pr diff $PR_NUM
```

**분석 관점:**

### 🔴 치명적 (즉시 수정 필요)
- SQL Injection 취약점
- 인증/인가 우회 가능성
- 민감 정보 노출 (토큰, 비밀번호, API 키)
- 무한 루프 / 메모리 누수
- APNs 토큰 검증 누락
- 런타임 에러 가능성

### ⚠️ 경고 (권장 수정)
- `any` 타입 사용
- 에러 처리 누락
- 비효율적 쿼리 (N+1, SELECT * 등)
- 하드코딩된 값
- 테스트 누락
- console.log 사용 (Logger 대신)

### 💡 제안 (선택사항)
- 코드 스타일 개선
- 더 나은 네이밍
- 리팩토링 기회
- 성능 최적화 포인트

---

## 4. 리뷰 결과 출력

### 결과 형식

```markdown
# 코드 리뷰 결과

**PR:** #<PR번호> <PR제목>
**변경:** +<additions> -<deletions> (<changedFiles>개 파일)

---

### 🔴 치명적 (N건)

**파일:라인** - 이슈 제목
- 문제: 설명
- 개선: 코드 예시

---

### ⚠️ 경고 (N건)

**파일:라인** - 이슈 제목
> 설명

---

### 💡 제안 (선택사항)

- 제안 내용

---

## 최종 판정

✅ 승인 가능 / ⚠️ 수정 후 승인 / ❌ 수정 필수
```

---

## 5. PR에 리뷰 코멘트 작성 (선택)

```bash
gh pr review $PR_NUM --comment --body "코드 리뷰 완료

$REVIEW_RESULT"
```

---

## 6. 최종 보고

| 항목 | 값 |
|------|-----|
| PR | #$PR_NUM |
| 치명적 | N건 |
| 경고 | N건 |
| 제안 | N건 |
| 판정 | 승인 가능 / 수정 후 승인 / 수정 필수 |

---

## 판정 기준

| 조건 | 판정 |
|------|------|
| 🔴 0건, ⚠️ 0건 | ✅ 승인 가능 |
| 🔴 0건, ⚠️ 1건 이상 | ⚠️ 수정 후 승인 |
| 🔴 1건 이상 | ❌ 수정 필수 |

---

## 체크리스트

### TypeScript/NestJS
- [ ] `any` 타입 사용하지 않음
- [ ] Logger 사용 (console.log 아님)
- [ ] 에러 처리 적절함
- [ ] DTO 타입 정의됨
- [ ] 환경변수 하드코딩 없음
- [ ] 모듈 분리 준수 (Controller → Service → Repository)
- [ ] Guard/Decorator는 common/ 모듈에서 import

### Database
- [ ] SQL Injection 방지 (파라미터 바인딩)
- [ ] SELECT * 미사용
- [ ] 인덱스 고려됨
- [ ] 트랜잭션 범위 적절함

### Security
- [ ] 인증/인가 확인
- [ ] 민감 정보 노출 없음
- [ ] 토큰 검증 적절함

### Testing
- [ ] 단위 테스트 포함
- [ ] 테스트 통과 확인

---

## 예시 출력

```markdown
# 코드 리뷰 결과

**PR:** #3 feat(auth): 카카오 로그인 API 추가
**변경:** +245 -12 (5개 파일)

---

### 🔴 치명적 (1건)

**api/src/auth.service.ts:45** - SQL Injection 취약점
- 문제: 문자열 연결로 쿼리 생성
- 개선:
```typescript
// Before
const query = `SELECT * FROM users WHERE id = '${userId}'`;

// After
const result = await this.pool.query(
  'SELECT id, name FROM users WHERE id = $1',
  [userId]
);
```

---

### ⚠️ 경고 (2건)

**api/src/auth.controller.ts:23** - any 타입 사용
> `body: any` 대신 DTO 타입 정의 필요

**api/src/auth.service.ts:78** - 에러 처리 누락
> 카카오 API 호출 실패 시 예외 처리 필요

---

### 💡 제안 (선택사항)

- `validateKakaoToken` 함수를 별도 유틸로 분리하면 재사용성 향상

---

## 최종 판정

❌ 수정 필수 - SQL Injection 취약점 해결 필요
```

---

## 흐름도

```
/code-review
  │
  ▼
PR 정보 확인
  │
  ├─ PR 없음 ──▶ 에러 & 중단
  │
  ▼
변경 파일 목록
  │
  ▼
diff 분석
  │
  ├─ 치명적 이슈 ──▶ 🔴 기록
  ├─ 경고 이슈 ──▶ ⚠️ 기록
  └─ 제안 사항 ──▶ 💡 기록
  │
  ▼
최종 판정
  │
  ▼
결과 보고
```
