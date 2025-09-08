#!/bin/bash
set -ex

# we upload the released file to npm and run using node,
# we use bun to utilize local dev,
# so add this dispatcher if run bun locally
build_js() {
        bun build src/cli.ts \
                --banner '#!/usr/bin/env/node' \
                --external lightningcss \
                --target node \
                --outdir ./dist \
                --asset-naming="[name].[ext]" \
                "$@"
}

build_exe() {
        bun build src/cli.ts --banner='import * as undici from "undici";' \
                --asset-naming="[name].[ext]" \
                --external lightningcss \
                --compile \
                --outfile ./dist/pochi \
                "$@"
}

if [[ ${TARGET:-""} == "node" ]]; then
        build_js "$@"
else
        build_exe "$@"
fi
