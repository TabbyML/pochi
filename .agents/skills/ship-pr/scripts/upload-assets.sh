#!/usr/bin/env bash
# Get images (screenshots, compare/diff PNGs, GIFs) into a PR body: prints one
# markdown image line per file, to paste straight into the PR description.
#
# Usage: upload-assets.sh [--branch <name>] <file>...
#
# `gh` has no API for GitHub's drag-and-drop PR attachments, so the files are
# pushed to a gist and embedded by raw URL, pinned to the commit so the images
# never change.
#
# Each `gh` user has ONE assets gist, found by its description
# ("pochi PR assets") and created on first use; all PRs share it. Gists have
# no directories, so files are stored as `<branch>--<file name>` (branch from
# --branch, default the current git branch, with `/` turned into `-`).
# Re-uploading a file replaces it in the gist; links already in PR bodies keep
# pointing at the old commit and stay valid.
set -euo pipefail

desc="pochi PR assets"
branch=""
files=()
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) branch="$2"; shift 2 ;;
    *) files+=("$1"); shift ;;
  esac
done
[ ${#files[@]} -gt 0 ] || { sed -n '2,16p' "$0"; exit 2; }
for f in "${files[@]}"; do [ -f "$f" ] || { echo "no such file: $f" >&2; exit 1; }; done

user="$(gh api user -q .login)"
branch="${branch:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo misc)}"
prefix="$(printf '%s' "$branch" | tr '/ ' '--' | tr -cd 'A-Za-z0-9._-')"

gist="$(gh api --paginate /gists --jq ".[] | select(.description == \"$desc\") | .id" | head -1)"
if [ -z "$gist" ]; then
  readme="$(mktemp -d)/README.md"
  printf '# Pochi PR assets\n\nScreenshots and diffs embedded in TabbyML/pochi pull requests.\nFiles are named `<branch>--<file>`.\n' >"$readme"
  url="$(gh gist create --public --desc "$desc" "$readme")"
  gist="${url##*/}"
  echo "created assets gist $url" >&2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gh gist clone "$gist" "$work/g" >/dev/null 2>&1 || git clone -q "https://gist.github.com/$gist.git" "$work/g"
names=()
for f in "${files[@]}"; do
  name="$prefix--$(basename "$f")"
  cp "$f" "$work/g/$name"
  names+=("$name")
done
(
  cd "$work/g"
  git add -A
  # Unchanged re-upload: nothing to commit, the current HEAD already has the bytes.
  if ! git diff --cached --quiet; then
    git -c user.name="$user" -c user.email="$user@users.noreply.github.com" \
      -c commit.gpgsign=false commit -qm "$branch: add assets"
    git push -q
  fi
)
sha="$(git -C "$work/g" rev-parse HEAD)"

for name in "${names[@]}"; do
  alt="${name#"$prefix--"}"
  alt="${alt%.*}"
  echo "![${alt}](https://gist.githubusercontent.com/$user/$gist/raw/$sha/$name)"
done
