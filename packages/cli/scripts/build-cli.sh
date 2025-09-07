#!/bin/bash
set -ex

build_js() {
        bun build src/cli.bun.ts \
                --external lightningcss \
                --target node \
                --outdir ./dist \
                --asset-naming="[name].[ext]" \
                --sourcemap=inline \
                "$@"
}

build_exe() {
        bun build src/cli.bun.ts --banner='import * as undici from "undici";' \
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
