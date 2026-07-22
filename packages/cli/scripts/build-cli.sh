#!/bin/bash
set -ex

#
# build_js output:
#
# dist/
# ├ cli.js
# ├ wa-sqlite.node.wasm
# ├ skills/*
# └ agents/*

build_js_copy_assets() {
        local dest="$1"
        cp "../../node_modules/@livestore/wa-sqlite/dist/wa-sqlite.node.wasm" "$dest/wa-sqlite.node.wasm"
        rm -rf "$dest/skills"
        cp -R "../common/src/base/skills" "$dest/skills"
        rm -rf "$dest/agents"
        cp -R "../common/src/base/agents" "$dest/agents"
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
                --asset-naming="[name].[ext]" \
                --external lightningcss \
                --target node \
                --outdir ./dist \
                "$@"

        sed -i.bak '1s|^.*$|#!/usr/bin/env node|' ./dist/cli.js
        rm -f ./dist/cli.js.bak

        build_js_copy_assets ./dist
}

#
# build_exe output:
#
# dist/
# └ pochi (binary -> Bun.embeddedFiles)
#                    ├ assets/wa-sqlite.node.wasm
#                    ├ assets/skills/*
#                    └ assets/agents/*

WASM_LOADER_FILE="../../node_modules/@livestore/wa-sqlite/dist/wa-sqlite.node.mjs"
WASM_LOADER_BACKUP="${WASM_LOADER_FILE}.bak"

# patch wasm loader to load `assets/wa-sqlite.node.wasm`
patch_wasm_loader() {
        WASM_LOADER_FILE="$WASM_LOADER_FILE" WASM_LOADER_BACKUP="$WASM_LOADER_BACKUP" bun -e '
                const path = process.env.WASM_LOADER_FILE;
                const backupPath = process.env.WASM_LOADER_BACKUP;
                if (!path) throw new Error("WASM_LOADER_FILE is not set");
                if (!backupPath) throw new Error("WASM_LOADER_BACKUP is not set");

                const text = await Bun.file(path).text();

                const pattern = /new URL\("wa-sqlite\.node\.wasm",\s*import\.meta\.url\)\.href/g;
                const replacement = `new URL("assets/wa-sqlite.node.wasm",import.meta.url).href`;

                const patched = text.replace(pattern, replacement);
                if (patched === text) {
                        if (text.includes(replacement)) {
                                console.log(`Already patched ${path}`);
                                process.exit(0);
                        }

                        console.error(`Patch target not found in ${path}`);
                        process.exit(1);
                }

                await Bun.write(backupPath, text);
                await Bun.write(path, patched);

                console.log(`Patched ${path}`);
        '
}

# restore the patched wasm loader
restore_wasm_loader() {
        if [[ -f "$WASM_LOADER_BACKUP" ]]; then
                mv "$WASM_LOADER_BACKUP" "$WASM_LOADER_FILE"
                echo "Restored $WASM_LOADER_FILE"
        fi
}

build_exe_prepare() {
        rm -rf "./assets"
        mkdir -p "./assets"
        cp "../../node_modules/@livestore/wa-sqlite/dist/wa-sqlite.node.wasm" "./assets/wa-sqlite.node.wasm"
        cp -R "../common/src/base/skills" "./assets/skills"
        cp -R "../common/src/base/agents" "./assets/agents"

        patch_wasm_loader
}

build_exe_cleanup() {
        rm -rf "./assets"

        restore_wasm_loader
}

build_exe_collect_inputs() {
        printf '%s\0' "src/cli.ts"
        find "./assets" -type f -print0
}

build_exe() {
        build_exe_cleanup
        trap build_exe_cleanup EXIT
        build_exe_prepare

        local input_files=()
        local input_file
        while IFS= read -r -d '' input_file; do
                input_files+=("$input_file")
        done < <(build_exe_collect_inputs)

        bun build "${input_files[@]}" \
                --banner='import * as undici from "undici";' \
                --asset-naming="[dir]/[name].[ext]" \
                --loader .md:file \
                --loader .ps1:file \
                --loader .sh:file \
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
