#!/usr/bin/env bash

clean() {
    rm -rf dist
}

build() {
    local target=$1
    local platform=$2
    bun run build -- --target="$target" --outfile="./dist/$platform/pochi"
    # Ship the built-in skill markdown next to the binary inside the archive.
    # The runtime resolver in `src/lib/builtin-skills-dir.ts` looks for
    # `<dirname(process.execPath)>/skills/` after the user extracts the
    # tarball into `~/.pochi/bin/`.
    cp -R ../common/src/base/skills "./dist/$platform/skills"
    # generate .tar.gz for linux and mac, generate .zip for windows.
    # Both archives preserve the `skills/` subdirectory next to the binary.
    if [ "$platform" == "windows-x64" ]; then
        (cd "./dist/$platform" && zip -r "../pochi-$platform.zip" .)
    else
        tar -czvf "./dist/pochi-$platform.tar.gz" -C "./dist/$platform" .
    fi
    rm -rf "./dist/$platform"
}

clean
build bun-mac-arm64 mac-arm64
build bun-linux-x64 linux-x64
build bun-linux-arm64 linux-arm64
build bun-windows-x64 windows-x64
