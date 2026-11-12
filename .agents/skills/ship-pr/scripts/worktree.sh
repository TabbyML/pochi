#!/usr/bin/env bash
# Branches and worktrees for ship-pr runs: create them the way Pochi does, and
# clean them up once their PR is merged or closed.
#
# Usage:
#   worktree.sh mark   <branch>                         record that ship-pr created <branch>
#                                                       (in-place runs; `create` does this itself)
#   worktree.sh create <branch> [--base origin/main] [--no-init]
#                 new worktree at <main checkout>.worktree/<branch with / → ->,
#                 then the same initialization as Pochi's worktrees:
#                   1. copy the gitignored files matching .worktreeinclude from
#                      the main checkout (e.g. packages/vscode/.env)
#                   2. run .pochi/init.sh in the new worktree (bun install)
#                 Prints the worktree path on the last line.
#   worktree.sh prune  [--dry-run]
#                 remove ship-pr branches (and their worktrees) whose PR is merged
#                 or closed, when nothing would be lost.
#
# ship-pr branches are recorded in git config (`branch.<name>.shipPr = true`),
# which git drops when the branch is deleted. No Pochi metadata is written, so
# these worktrees don't show up in Pochi's worktree list.
#
# `prune` only deletes a branch when all of these hold:
#   - it is marked as a ship-pr branch
#   - its PR (looked up by head branch) is MERGED or CLOSED
#   - the local branch tip is the PR's head commit (nothing local that the PR lacks)
#   - it is not checked out in the main checkout
#   - its worktree, if any, has no uncommitted or untracked changes
# Anything else is skipped with the reason.
set -euo pipefail

cmd="${1:-}"; shift || true
usage() { sed -n '2,29p' "$0"; exit 2; }

main_checkout() {
  git worktree list --porcelain | awk '/^worktree / { print substr($0, 10); exit }'
}

case "$cmd" in
  mark)
    branch="${1:-}"; [ -n "$branch" ] || usage
    git config "branch.$branch.shipPr" true
    ;;

  create)
    branch="${1:-}"; [ -n "$branch" ] || usage; shift
    base="origin/main"
    init=1
    while [ $# -gt 0 ]; do
      case "$1" in
        --base) base="$2"; shift 2 ;;
        --no-init) init=0; shift ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
      esac
    done

    main="$(main_checkout)"
    path="${main%/}.worktree/$(printf '%s' "$branch" | tr '/' '-')"
    [ -e "$path" ] && { echo "✗ $path already exists" >&2; exit 1; }
    mkdir -p "$(dirname "$path")"
    git -C "$main" worktree add -q -b "$branch" "$path" "$base"
    git -C "$main" config "branch.$branch.shipPr" true
    echo "✓ worktree $path (branch $branch from $base)" >&2

    if [ "$init" = 1 ]; then
      include="$main/.worktreeinclude"
      if [ -f "$include" ]; then
        git -c core.quotePath=false -C "$main" ls-files --others --ignored --exclude-from="$include" |
          while IFS= read -r rel; do
            [ -n "$rel" ] || continue
            case "/$rel/" in */../*) echo "✗ unsafe .worktreeinclude path: $rel" >&2; exit 1 ;; esac
            case "$rel" in /*) echo "✗ unsafe .worktreeinclude path: $rel" >&2; exit 1 ;; esac
            mkdir -p "$(dirname "$path/$rel")"
            cp "$main/$rel" "$path/$rel"
            echo "  copied $rel" >&2
          done
      fi
      if [ -f "$path/.pochi/init.sh" ]; then
        echo "→ running .pochi/init.sh" >&2
        (cd "$path" && sh ./.pochi/init.sh) >&2 || { echo "✗ .pochi/init.sh failed; the worktree is left in place" >&2; exit 1; }
      fi
      echo "✓ initialized" >&2
    fi
    echo "$path"
    ;;

  prune)
    dry=0
    [ "${1:-}" = "--dry-run" ] && dry=1
    main="$(main_checkout)"
    current="$(git -C "$main" branch --show-current)"
    branches="$(git config --get-regexp '^branch\..*\.shippr$' 2>/dev/null | awk '$2 == "true" { sub(/^branch\./, "", $1); sub(/\.shippr$/, "", $1); print $1 }' || true)"
    [ -n "$branches" ] || { echo "no ship-pr branches"; exit 0; }

    for branch in $branches; do
      if ! git show-ref --verify --quiet "refs/heads/$branch"; then
        git config --remove-section "branch.$branch" 2>/dev/null || true
        continue
      fi
      skip() { echo "- $branch: kept ($1)"; }

      pr="$(gh pr view "$branch" --json state,headRefOid,number 2>/dev/null || true)"
      if [ -z "$pr" ]; then skip "no PR"; continue; fi
      state="$(printf '%s' "$pr" | jq -r .state)"
      head="$(printf '%s' "$pr" | jq -r .headRefOid)"
      number="$(printf '%s' "$pr" | jq -r .number)"
      if [ "$state" != "MERGED" ] && [ "$state" != "CLOSED" ]; then skip "PR #$number is $state"; continue; fi
      if [ "$(git rev-parse "refs/heads/$branch")" != "$head" ]; then skip "local commits not in PR #$number"; continue; fi
      if [ "$branch" = "$current" ]; then skip "checked out in the main checkout"; continue; fi

      wt="$(git worktree list --porcelain | awk -v ref="branch refs/heads/$branch" '/^worktree / { p = substr($0, 10) } $0 == ref { print p }')"
      if [ -n "$wt" ] && [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
        skip "uncommitted changes in $wt"; continue
      fi

      if [ "$dry" = 1 ]; then
        echo "- $branch: would remove (PR #$number $state)${wt:+, worktree $wt}"
        continue
      fi
      if [ -n "$wt" ]; then
        git worktree remove --force "$wt" 2>/dev/null || { rm -rf "$wt"; git worktree prune; }
      fi
      git branch -D -q "$branch"
      echo "- $branch: removed (PR #$number $state)${wt:+, worktree $wt}"
    done
    ;;

  *) usage ;;
esac
