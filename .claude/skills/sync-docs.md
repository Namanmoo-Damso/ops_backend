---
description: 문서와 실제 코드 동기화 확인 및 업데이트
---

# /sync-docs 워크플로우

> **사용법:** `/sync-docs`
> **언어:** 모든 결과 보고는 **한글**로 작성합니다.

---

## 1. 문서 목록 스캔

```bash
find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*"
```

**주요 문서:**
- `CLAUDE.md` - 프로젝트 헌법
- `README.md` - 프로젝트 개요
- `docs/` - 추가 문서 (있는 경우)

---

## 2. 코드베이스 현황 파악

### API 구조
```bash
ls -la api/src/
```

### Web 구조
```bash
ls -la web/app/
```

### DB 스키마
```bash
cat db/init.sql
```

### Docker 서비스
```bash
cat docker-compose.yml
```

---

## 3. 격차 분석 수행

각 문서에 대해 다음을 확인:

### CLAUDE.md 검증
- [ ] `<tech_stack>` - 실제 package.json 버전과 일치?
- [ ] `<core_entities>` - db/init.sql 테이블과 일치?
- [ ] `<file_structure>` - 실제 디렉토리 구조와 일치?
- [ ] `<api_endpoints>` - 모듈별 컨트롤러 엔드포인트와 일치?
- [ ] `<github_issues>` - 현재 이슈 목록과 일치?

### README.md 검증 (있는 경우)
- [ ] 설치 방법 정확한가?
- [ ] 실행 명령어 정확한가?
- [ ] 환경변수 목록 최신인가?

---

## 4. 불일치 항목 보고

```markdown
# 문서 동기화 분석 결과

## 불일치 항목

### CLAUDE.md

| 섹션 | 문서 내용 | 실제 코드 | 조치 |
|------|-----------|-----------|------|
| tech_stack | NestJS 10.x | NestJS 11.x | 업데이트 필요 |
| core_entities | users, devices, ... | + guardians 추가됨 | 업데이트 필요 |

### README.md

| 섹션 | 문서 내용 | 실제 상태 | 조치 |
|------|-----------|-----------|------|
| 설치 방법 | npm install | 정확함 | 없음 |
```

---

## 5. 자동 업데이트 (승인 시)

### tech_stack 업데이트
```bash
# package.json에서 버전 추출
API_NEST_VERSION=$(cat api/package.json | jq -r '.dependencies["@nestjs/common"]')
WEB_NEXT_VERSION=$(cat web/package.json | jq -r '.dependencies["next"]')
```

### github_issues 업데이트
```bash
# 현재 이슈 목록 가져오기
gh issue list --state open --json number,title --limit 30
```

### api_endpoints 업데이트
```bash
# 모듈별 Controller에서 엔드포인트 추출
find api/src -name "*.controller.ts" -exec grep -l "@(Get|Post|Put|Delete|Patch)" {} \;

# 각 모듈별 엔드포인트 확인
grep -rE "@(Get|Post|Put|Delete|Patch)" api/src/*/
```

---

## 6. 업데이트 실행

사용자 승인 후:

```bash
# CLAUDE.md 백업
cp CLAUDE.md CLAUDE.md.bak

# 수정 사항 적용
# (Claude가 Edit 도구로 직접 수정)

# 변경 확인
git diff CLAUDE.md
```

---

## 7. 최종 보고

| 항목 | 상태 |
|------|------|
| 검사한 문서 | N개 |
| 불일치 항목 | N개 |
| 업데이트 항목 | N개 |
| 결과 | 동기화 완료 / 수동 확인 필요 |

---

## 자동 검사 항목

### 버전 정보
| 파일 | 검사 대상 | 문서 위치 |
|------|-----------|-----------|
| api/package.json | @nestjs/* 버전 | CLAUDE.md tech_stack |
| web/package.json | next, react 버전 | CLAUDE.md tech_stack |
| docker-compose.yml | postgres, redis 버전 | CLAUDE.md tech_stack |

### 구조 정보
| 소스 | 문서 위치 |
|------|-----------|
| api/src/*/ (모듈 디렉토리) | CLAUDE.md file_structure |
| api/src/*/*.controller.ts | CLAUDE.md api_endpoints |
| web/app/*.tsx | CLAUDE.md file_structure |
| web/components/*.tsx | CLAUDE.md file_structure |
| web/hooks/*.ts | CLAUDE.md file_structure |
| db/init.sql | CLAUDE.md core_entities |

### 이슈 정보
| 소스 | 문서 위치 |
|------|-----------|
| gh issue list | CLAUDE.md github_issues |

---

## 흐름도

```
/sync-docs
  │
  ▼
문서 목록 스캔
  │
  ▼
코드베이스 현황 파악
  │
  ▼
격차 분석
  │
  ├─ 불일치 없음 ──▶ "문서가 최신 상태입니다" 보고
  │
  ▼ 불일치 있음
불일치 항목 보고
  │
  ▼
업데이트 승인 요청
  │
  ├─ 거부 ──▶ 종료
  │
  ▼ 승인
자동 업데이트 실행
  │
  ▼
최종 보고
```

---

## 예시 출력

```markdown
# 문서 동기화 분석 결과

**검사 일시:** 2025-12-29 15:30 KST
**검사 문서:** 2개

---

## 불일치 항목 (3건)

### CLAUDE.md

1. **tech_stack - NestJS 버전**
   - 문서: NestJS 10.x
   - 실제: NestJS 11.0.1
   - 조치: 업데이트 필요

2. **github_issues - 이슈 목록**
   - 문서: 15개 이슈
   - 실제: 19개 이슈
   - 조치: 업데이트 필요

3. **api_endpoints - 새 엔드포인트**
   - 문서에 누락: POST /auth/kakao
   - 조치: 추가 필요

---

## 권장 조치

위 3개 항목을 업데이트하시겠습니까? (y/n)

---

## 업데이트 완료

| 항목 | 상태 |
|------|------|
| tech_stack | ✅ 업데이트됨 |
| github_issues | ✅ 업데이트됨 |
| api_endpoints | ✅ 업데이트됨 |

변경 파일: CLAUDE.md
```

---

## 주의사항

1. **백업 필수** - 수정 전 항상 백업 생성
2. **수동 검토** - 자동 업데이트 후 내용 확인
3. **버전 형식** - semver 형식 유지 (예: 11.x, 16.x)
4. **이슈 순서** - 번호순 정렬 유지
