#!/usr/bin/env bash
set -eu

chrome=${POCHI_LOCAL_CHROME_PATH:-}
if [[ -z "$chrome" ]]; then
  if [[ "$(uname -s)" == Darwin ]]; then
    chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  else
    chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser) || {
      echo "Chrome or Chromium was not found. Set browserAgentSettings.localChrome.chromePath." >&2
      exit 1
    }
  fi
fi
command -v "$chrome" >/dev/null || { echo "Chrome executable not found: $chrome" >&2; exit 1; }
nohup "$chrome" "$@" </dev/null >/dev/null 2>&1 &
