#!/usr/bin/env bash
set -euo pipefail

version="0.39.0"
install_dir="$HOME/.pochi/bin"
binary="$install_dir/agent-browser"

has_required_version() {
  local output
  output=$("$1" --version 2>/dev/null) && [[ "$output" == "agent-browser $version" ]]
}

if [[ -x "$binary" ]] && has_required_version "$binary"; then
  printf 'agent-browser %s is already installed at %s\n' "$version" "$binary"
  exit 0
fi

case "$(uname -s)" in
  Darwin) platform="darwin" ;;
  Linux)
    platform="linux"
    libc=$(ldd --version 2>&1 || true)
    if [[ "$libc" == *musl* ]]; then
      platform="linux-musl"
    fi
    ;;
  *) printf 'Unsupported operating system for agent-browser %s\n' "$version" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) architecture="arm64" ;;
  x86_64) architecture="x64" ;;
  *) printf 'Unsupported architecture for agent-browser %s\n' "$version" >&2; exit 1 ;;
esac

mkdir -p "$install_dir"
download=$(mktemp "$install_dir/agent-browser.download.XXXXXX")
trap 'rm -f "$download"' EXIT

asset="agent-browser-$platform-$architecture"
curl -fL "https://github.com/vercel-labs/agent-browser/releases/download/v$version/$asset" -o "$download"
chmod +x "$download"
if ! has_required_version "$download"; then
  printf 'Downloaded agent-browser failed version verification (expected %s). Existing installation was preserved.\n' "$version" >&2
  exit 1
fi
mv -f "$download" "$binary"
printf 'Installed agent-browser %s at %s\n' "$version" "$binary"
