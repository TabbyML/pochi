#!/usr/bin/env bun

const isBun = !!process.versions.bun;

if (isBun) {
  import("./cli.ts");
} else {
  import("../dist/cli.js");
}
