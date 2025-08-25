#!/bin/bash
set -ex

build_js() {
        bun build src/cli.ts --banner='import * as undici from "undici";' \
                --external vite \
                --target bun \
                --outdir ./dist
}

build_exe() {
        bun build src/cli.ts --banner='import * as undici from "undici";' \
                --asset-naming="[name].[ext]" \
                --external vite \
                --compile \
                --outfile ./dist/pochi \
                "$@"
}

build_exe "$@"
