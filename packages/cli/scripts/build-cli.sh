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

# we upload the released file to npm and run using node,
# we use bun to utilize local dev,
# so add this dispatcher if run bun locally
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

        # since we added bun shebang in cli.ts use bun to run pochi locally
        # bun build will always add bun shebang for cli.js,
        # so we have to replace it manually.
        sed -i.bak '1s|^.*$|#!/usr/bin/env node|' ./dist/cli.js
        rm -f ./dist/cli.js.bak

        copy_builtin_skills ./dist
        copy_builtin_agents ./dist
}

build_exe() {
        local staging
        staging="./dist/.builtin-staging"
        rm -rf "$staging"
        mkdir -p "$staging"

        # Copy each built-in markdown into the staging dir with a flat,
        # path-encoded filename (`<kind>__<rel>.md`, with `/` replaced by `__`).
        # The runtime decoder in `builtin-bundle.ts` splits on `__` to recover
        # the original layout. This lets us keep Bun's default asset naming
        # (`[name]-[hash].[ext]`) and avoids touching the `[dir]` of every
        # *other* embedded asset (e.g. `wa-sqlite.node.wasm` under
        # `node_modules/@livestore/...`), which broke `--compile` startup on
        # Linux x64.
        while IFS= read -r f; do
                local rel encoded
                rel=${f#../common/src/base/}
                encoded=${rel//\//__}
                cp "$f" "$staging/$encoded"
        done < <(find ../common/src/base/skills ../common/src/base/agents \
                -type f -name "*.md")

        bun build src/cli.ts "$staging"/*.md \
                --banner='import * as undici from "undici";' \
                --loader .md:file \
                --external lightningcss \
                --compile \
                --outfile ./dist/pochi \
                "$@"

        rm -rf "$staging"
}

if [[ ${TARGET:-""} == "node" ]]; then
        build_js "$@"
else
        build_exe "$@"
fi
