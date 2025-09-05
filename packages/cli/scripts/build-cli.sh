#!/bin/bash
set -ex

build_js() {
        bun build src/cli.ts \
                --external lightningcss \
                --target node \
                --outdir ./dist \
                --asset-naming="[name].[ext]" \
                --sourcemap=inline \
                "$@"

        # we use bun shebang in cli.ts to utilize bun link
        # change to node for npm release
        sed -i "" 's|#!/usr/bin/env bun|#!/usr/bin/env node|g' ./dist/cli.js
        chmod +x ./dist/cli.js
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
