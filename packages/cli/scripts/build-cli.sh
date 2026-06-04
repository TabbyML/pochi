#!/bin/bash
set -ex

copy_builtin_skills() {
        local dest="$1"
        rm -rf "$dest/skills"
        cp -R ../common/src/base/skills "$dest/skills"
}

copy_builtin_agents() {
        local dest="$1"
        rm -rf "$dest/agents"
        cp -R ../common/src/base/agents "$dest/agents"
}

build_js() {
        BUN_VERSION=$(bun --version)
        REQUIRED_VERSION="1.2.15"

        if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$BUN_VERSION" | sort -V | tail -n 1)" != "$REQUIRED_VERSION" ]; then
                echo "Error: The current bun version ($BUN_VERSION) has an issue building the node target for Pochi." >&2
                echo "Please use a version up to 1.2.15." >&2
                exit 1
        fi

        bun build src/cli.ts \
                --external lightningcss \
                --target node \
                --outdir ./dist \
                --asset-naming="[name].[ext]" \
                "$@"

        sed -i.bak '1s|^.*$|#!/usr/bin/env node|' ./dist/cli.js
        rm -f ./dist/cli.js.bak

        copy_builtin_skills ./dist
        copy_builtin_agents ./dist
}

build_exe() {
        local md_files
        md_files=$(find ../common/src/base/skills ../common/src/base/agents \
                -type f -name "*.md")

        bun build src/cli.ts $md_files \
                --banner='import * as undici from "undici";' \
                --asset-naming="[dir]/[name].[ext]" \
                --loader .md:file \
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
