#!/usr/bin/env bash

clean() {
    rm -rf dist
}

build() {
    local target=$1
    local platform=$2
    bun run build -- --target="$target" --outfile="./dist/$platform/pochi"
    # generate .tar.gz for linux and mac, generate .zip for windows
    if [ "$platform" == "windows-x64" ]; then
        zip -r "./dist/pochi-$platform.zip" -j "./dist/$platform/"*
    else
        tar -czvf "./dist/pochi-$platform.tar.gz" -C "./dist/$platform" .
    fi
    rm -rf "./dist/$platform"
}

clean
build bun-mac-arm64 mac-arm64
build bun-linux-x64 linux-x64
build bun-windows-x64 windows-x64
