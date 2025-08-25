#!/bin/bash
set -ex

build_js() {
        bun build src/cli.ts --banner='import * as undici from "undici";' \
                --external lightningcss \
                --target bun \
                --outdir ./dist
}

build_exe() {
        bun build src/cli.ts --banner='import * as undici from "undici";' \
                --asset-naming="[name].[ext]" \
                --external lightningcss \
                --compile \
                --outfile ./dist/pochi \
                "$@"
}

build_exe "$@"
