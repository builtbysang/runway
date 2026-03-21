#!/bin/bash
# Run Runway via Claude Code — no Anthropic API credits needed
# Uses: Linear MCP, gh CLI, local file system
#
# Usage:
#   ./scripts/run-sprint.sh                  # all Todo issues in current sprint
#   ./scripts/run-sprint.sh BUI-32 BUI-33    # specific issues

set -e

PROJECT_DIR="${WEALTH_NEXT_DIR:-/Users/Sang/Claude Code/wealth-next}"
LINEAR_API_KEY="lin_api_hyBv3NY7FTdypvNEnYFDS5iDFVt5Bn2sQjuKrf6T"
SPRINT2_CYCLE="234464c2-fba4-47a5-872f-7c342a7c8287"

gql() {
  curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$1\"}"
}

if [ "$#" -gt 0 ]; then
  IDENTIFIERS=("$@")
else
  echo "Fetching Todo issues from Sprint 2..."
  IDENTIFIERS=($(gql "query { cycle(id: \\\"$SPRINT2_CYCLE\\\") { issues(filter: { state: { name: { eq: \\\"Todo\\\" } } }, first: 20) { nodes { identifier } } } }" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); [print(n['identifier']) for n in d['data']['cycle']['issues']['nodes']]"))
fi

echo "Issues to implement: ${IDENTIFIERS[*]}"
echo ""

for ID in "${IDENTIFIERS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "▶ $ID"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  cd "$PROJECT_DIR"
  git checkout main 2>/dev/null || true
  git pull origin main --rebase 2>/dev/null || true

  claude --print "/implement-issue $ID"

  echo "✓ Done: $ID"
  echo ""
done

echo "All done. Check Linear + GitHub."
