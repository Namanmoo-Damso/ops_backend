#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# start-work.sh - 이슈 기반 작업 시작 스크립트
#
# 사용법:
#   ./scripts/start-work.sh                    # 열린 이슈 목록 표시
#   ./scripts/start-work.sh <ISSUE_NUM>        # 이슈 번호로 브랜치 생성
#   ./scripts/start-work.sh <ISSUE_NUM> <DESC> # 커스텀 브랜치 설명
#
# 예시:
#   ./scripts/start-work.sh 1                  # feature/1-db-schema-extension
#   ./scripts/start-work.sh 2 kakao-oauth      # feature/2-kakao-oauth
# =============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 함수: 에러 출력
error() {
    echo -e "${RED}Error: $1${NC}" >&2
    exit 1
}

# 함수: 정보 출력
info() {
    echo -e "${BLUE}$1${NC}"
}

# 함수: 성공 출력
success() {
    echo -e "${GREEN}$1${NC}"
}

# 함수: 경고 출력
warn() {
    echo -e "${YELLOW}$1${NC}"
}

# gh CLI 확인
if ! command -v gh >/dev/null 2>&1; then
    error "GitHub CLI (gh)가 설치되어 있지 않습니다. https://cli.github.com/ 에서 설치하세요."
fi

# gh 인증 확인
if ! gh auth status >/dev/null 2>&1; then
    error "GitHub CLI 인증이 필요합니다. 'gh auth login'을 실행하세요."
fi

# 인자 확인
ISSUE_NUM="${1:-}"
BRANCH_SUFFIX="${2:-}"

# 인자가 없으면 이슈 목록 표시
if [ -z "$ISSUE_NUM" ]; then
    info "=== 열린 이슈 목록 ==="
    echo ""
    gh issue list --state open --limit 20
    echo ""
    info "사용법: ./scripts/start-work.sh <이슈번호> [브랜치설명]"
    exit 0
fi

# 이슈 정보 조회
info "이슈 #$ISSUE_NUM 정보 조회 중..."
ISSUE_JSON=$(gh issue view "$ISSUE_NUM" --json title,labels,state 2>/dev/null || echo "")

if [ -z "$ISSUE_JSON" ]; then
    error "이슈 #$ISSUE_NUM을 찾을 수 없습니다."
fi

ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
ISSUE_STATE=$(echo "$ISSUE_JSON" | jq -r '.state')
ISSUE_LABELS=$(echo "$ISSUE_JSON" | jq -r '.labels[].name' 2>/dev/null | tr '\n' ',' | sed 's/,$//')

if [ "$ISSUE_STATE" != "OPEN" ]; then
    warn "경고: 이슈 #$ISSUE_NUM은 $ISSUE_STATE 상태입니다."
    read -p "계속하시겠습니까? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

echo ""
info "이슈: #$ISSUE_NUM"
info "제목: $ISSUE_TITLE"
[ -n "$ISSUE_LABELS" ] && info "레이블: $ISSUE_LABELS"
echo ""

# 브랜치 타입 결정
BRANCH_TYPE="feature"
if echo "$ISSUE_LABELS" | grep -qiE "bug|fix"; then
    BRANCH_TYPE="fix"
elif echo "$ISSUE_LABELS" | grep -qiE "hotfix|urgent|critical"; then
    BRANCH_TYPE="hotfix"
fi

info "브랜치 타입: $BRANCH_TYPE"

# 브랜치명 생성
if [ -z "$BRANCH_SUFFIX" ]; then
    # 이슈 제목에서 브랜치 설명 생성
    # [Feature] 1. DB 스키마 확장 -> db-schema-extension
    BRANCH_SUFFIX=$(echo "$ISSUE_TITLE" | \
        sed 's/\[.*\]//g' | \
        sed 's/^[0-9]*\.//g' | \
        tr '[:upper:]' '[:lower:]' | \
        tr ' ' '-' | \
        tr -cd '[:alnum:]-' | \
        sed 's/--*/-/g' | \
        sed 's/^-//;s/-$//' | \
        head -c 30)
fi

BRANCH_NAME="${BRANCH_TYPE}/${ISSUE_NUM}-${BRANCH_SUFFIX}"
info "브랜치명: $BRANCH_NAME"
echo ""

# 현재 변경사항 확인
CHANGES=$(git status --porcelain)
if [ -n "$CHANGES" ]; then
    warn "현재 브랜치에 커밋되지 않은 변경사항이 있습니다:"
    git status --short
    echo ""
    echo "옵션:"
    echo "  s) stash - 변경사항 임시 저장 후 진행"
    echo "  c) commit - 변경사항 커밋 안내 후 중단"
    echo "  a) abort - 작업 중단"
    read -p "선택 (s/c/a): " -n 1 -r
    echo
    case $REPLY in
        [Ss])
            info "변경사항을 stash합니다..."
            git stash push -m "WIP: before starting issue #$ISSUE_NUM"
            success "Stash 완료. 나중에 'git stash pop'으로 복원하세요."
            ;;
        [Cc])
            error "먼저 변경사항을 커밋하세요: git add . && git commit -m \"WIP: ...\""
            ;;
        *)
            info "작업을 중단합니다."
            exit 0
            ;;
    esac
fi

# Base 브랜치 결정
BASE_BRANCH="develop"
if [ "$BRANCH_TYPE" == "hotfix" ]; then
    BASE_BRANCH="master"
fi

info "Base 브랜치: $BASE_BRANCH"

# Base 브랜치 최신화
info "$BASE_BRANCH 브랜치 최신화 중..."
git fetch origin "$BASE_BRANCH"
git checkout "$BASE_BRANCH"
git pull origin "$BASE_BRANCH"

# 새 브랜치 생성
info "새 브랜치 생성 중: $BRANCH_NAME"
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    warn "브랜치 $BRANCH_NAME이 이미 존재합니다."
    read -p "기존 브랜치로 체크아웃하시겠습니까? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git checkout "$BRANCH_NAME"
    else
        exit 0
    fi
else
    git checkout -b "$BRANCH_NAME"
fi

# 원격에 푸시
info "원격 저장소에 푸시 중..."
git push -u origin "$BRANCH_NAME"

# 이슈에 코멘트 추가 (선택)
read -p "이슈에 작업 시작 코멘트를 추가하시겠습니까? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    gh issue comment "$ISSUE_NUM" --body "🚀 작업 시작: \`$BRANCH_NAME\` 브랜치에서 진행 중"
    gh issue edit "$ISSUE_NUM" --add-assignee @me 2>/dev/null || true
    success "이슈 코멘트 추가 완료"
fi

echo ""
success "=== 작업 준비 완료 ==="
echo ""
info "이슈: #$ISSUE_NUM - $ISSUE_TITLE"
info "브랜치: $BRANCH_NAME"
info "Base: $BASE_BRANCH"
echo ""
info "다음 단계:"
echo "  1. 기능 구현"
echo "  2. 테스트 작성 (cd api && npm test)"
echo "  3. 커밋 & PR 생성 (Claude Code에서 /smart-commit 사용)"
echo ""
