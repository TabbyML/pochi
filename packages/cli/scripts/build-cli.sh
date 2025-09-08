#!/bin/bash
set -ex

# we upload the released file to npm and run using node,
# we use bun to utilize local dev,
# so add this dispatcher if run bun locally
build_js() {
        bun build src/cli.ts \
                --external lightningcss \
                --target node \
                --outdir ./dist \
                --asset-naming="[name].[ext]" \
                "$@"

        # since we added bun shebang in cli.ts use bun to run pochi locally
        # bun build will always add bun shebang for cli.js,
        # so we have to replace it manually.
        sed -i.bak '1s|^.*$|#!/usr/bin/env node|' ./dist/cli.js
        rm -f ./dist/cli.js.bak
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
