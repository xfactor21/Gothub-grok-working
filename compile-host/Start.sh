#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "xIDE Compile Host needs Node.js 18 or newer."
  echo "Install the LTS build from https://nodejs.org then start again."
  exit 1
fi
if [[ ! -f toolchains/env.json ]]; then
  echo "First start — installing the compile toolchain. This can take several minutes."
  node setup.mjs
fi
exec node server.mjs
