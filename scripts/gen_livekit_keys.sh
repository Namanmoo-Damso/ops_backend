#!/usr/bin/env bash
set -euo pipefail

if command -v openssl >/dev/null 2>&1; then
  key="LK_$(openssl rand -hex 8)"
  secret="$(openssl rand -hex 32)"
else
  key="LK_$(python3 - <<'PY'
import secrets
print(secrets.token_hex(8))
PY
)"
  secret="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"
fi

cat <<EOF
LIVEKIT_API_KEY=${key}
LIVEKIT_API_SECRET=${secret}
EOF

if [[ "${1:-}" == "--apply" ]]; then
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  sed -i "s/LK_API_KEY/${key}/" "${repo_root}/livekit.yaml"
  sed -i "s/LK_API_SECRET/${secret}/" "${repo_root}/livekit.yaml"
  echo "Applied to ${repo_root}/livekit.yaml"
fi
