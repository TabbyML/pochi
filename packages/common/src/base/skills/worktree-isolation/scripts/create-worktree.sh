#!/bin/sh

set -eu

topic=""
base="HEAD"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --topic)
      [ "$#" -ge 2 ] || { echo "Missing value for --topic" >&2; exit 2; }
      topic=$2
      shift 2
      ;;
    --base)
      [ "$#" -ge 2 ] || { echo "Missing value for --base" >&2; exit 2; }
      base=$2
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

emit_result() {
  result_ok=$1
  result_root=$2
  result_branch=$3
  result_base=$4
  result_initialized=$5
  result_error=$6

  printf '{"ok":%s,"root":"%s","branch":"%s","base":"%s","initialized":%s,"error":"%s"}\n' \
    "$result_ok" \
    "$(json_escape "$result_root")" \
    "$(json_escape "$result_branch")" \
    "$(json_escape "$result_base")" \
    "$result_initialized" \
    "$(json_escape "$result_error")"
}

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  emit_result false "" "" "$base" false "The current directory is not inside a Git worktree."
  exit 1
}
cd "$repo_root"

if ! git rev-parse --verify "${base}^{commit}" >/dev/null 2>&1; then
  emit_result false "" "" "$base" false "The requested base is not a committed Git revision."
  exit 1
fi

worktree_list=$(git -c core.quotePath=false worktree list --porcelain) || {
  emit_result false "" "" "$base" false "Failed to list existing Git worktrees."
  exit 1
}

main_worktree=$(printf '%s\n' "$worktree_list" | awk '/^worktree / { print substr($0, 10); exit }')
second_worktree=$(printf '%s\n' "$worktree_list" | awk '/^worktree / { count++; if (count == 2) { print substr($0, 10); exit } }')

if [ -z "$main_worktree" ]; then
  emit_result false "" "" "$base" false "Git did not report a main worktree."
  exit 1
fi

slug=$(printf '%s' "$topic" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-][^a-z0-9._-]*/-/g; s/^-*//; s/-*$//; s/^\.*//')
timestamp=$(date '+%Y%m%d-%H%M%S')

if [ -n "$slug" ]; then
  branch="worktree/$slug"
else
  branch="worktree/$timestamp"
fi

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  branch="worktree/$timestamp"
fi

if git show-ref --verify --quiet "refs/heads/$branch"; then
  branch="$branch-$timestamp"
fi

worktree_name=$(printf '%s' "$branch" | tr '/' '-')
if [ -n "$second_worktree" ]; then
  worktree_parent=$(dirname "$second_worktree")
else
  worktree_parent="${main_worktree%/}.worktree"
fi
worktree_path="${worktree_parent%/}/$worktree_name"

if ! mkdir -p "$worktree_parent"; then
  emit_result false "$worktree_path" "$branch" "$base" false "Failed to create the worktree parent directory."
  exit 1
fi

if ! git worktree add -b "$branch" "$worktree_path" "$base"; then
  emit_result false "$worktree_path" "$branch" "$base" false "git worktree add failed."
  exit 1
fi

include_file="$main_worktree/.worktreeinclude"
if [ -f "$include_file" ]; then
  if included_files=$(git -C "$main_worktree" ls-files --others --ignored --exclude-from="$include_file"); then
    printf '%s\n' "$included_files" | while IFS= read -r relative_path; do
      [ -n "$relative_path" ] || continue
      case "$relative_path" in
        /*|../*|..)
          echo "Skipping unsafe .worktreeinclude path: $relative_path" >&2
          continue
          ;;
      esac
      case "/$relative_path/" in
        */../*)
          echo "Skipping unsafe .worktreeinclude path: $relative_path" >&2
          continue
          ;;
      esac

      source_path="$main_worktree/$relative_path"
      destination_path="$worktree_path/$relative_path"
      if ! mkdir -p "$(dirname "$destination_path")" || ! cp "$source_path" "$destination_path"; then
        echo "Failed to copy .worktreeinclude file: $relative_path" >&2
      fi
    done
  else
    echo "Failed to list .worktreeinclude files; continuing without them." >&2
  fi
fi

initialized=false
if [ -f "$worktree_path/.pochi/init.sh" ]; then
  if ! (cd "$worktree_path" && sh ./.pochi/init.sh); then
    emit_result false "$worktree_path" "$branch" "$base" false "The worktree init script failed."
    exit 1
  fi
  initialized=true
fi

emit_result true "$worktree_path" "$branch" "$base" "$initialized" ""
