#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install

if [ -n "${GITHUB_TOKEN:-}" ]; then
  git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/InglesinaItaliana/preventivatoreb2b-ii.git"
  echo "Git remote configured with GITHUB_TOKEN."
else
  echo "Warning: GITHUB_TOKEN not set."
fi
