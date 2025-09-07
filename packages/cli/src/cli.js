#!/usr/bin/env node

// Check if the 'bun' property exists on the process.versions object.
const isBun = !!process.versions.bun;

// we upload the released file to npm and run using node,
// we use bun to utilize local dev,
// so we use this dispatcher cli to choose the right entrypoint based on runtime.
if (isBun) {
  require("./cli.bun.ts");
} else {
  await import("../dist/cli.bun.js");
}
