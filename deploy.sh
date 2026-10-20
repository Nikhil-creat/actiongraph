#!/usr/bin/env bash
# One-shot deploy from Termux. Usage: bash deploy.sh [repo-name]
set -e
REPO="${1:-actiongraph}"; OWNER="Nikhil-creat"
git init -q 2>/dev/null || true
git add .
git commit -qm "ActionGraph: agentic meeting-to-action platform" || true
git branch -M main
gh repo create "$REPO" --public --source=. --push
gh api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" || true
echo "Done. Live in about a minute at: https://${OWNER,,}.github.io/$REPO/"
