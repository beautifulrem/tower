#!/bin/sh
# Ships the current branch to main the only way main accepts: a pull request
# that merges itself (rebased, commits kept) once CI passes.
#   git switch -c some-change && …commits… && tools/ship.sh
set -e
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = main ]; then
  echo "ship from a branch: main only takes pull requests" >&2
  exit 1
fi
git push -u origin "$branch"
if ! gh pr view "$branch" >/dev/null 2>&1; then
  title=$(git log -1 --format=%s)
  body=$(git log --reverse --format='- %s' origin/main.."$branch")
  gh pr create --base main --head "$branch" --title "$title" --body "$body

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
fi
gh pr merge "$branch" --rebase --auto --delete-branch
