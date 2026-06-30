const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const runExclusive = require("run-exclusive");

const packageRoot = path.resolve(__dirname, "..");
const watchDirs = ["agents", "skills"].map((name) =>
  path.resolve(__dirname, `../../common/src/base/${name}`),
);

function copyAssets() {
  console.log("Running copy:assets...");

  return new Promise((resolve) => {
    const copyProcess = spawn("bun", ["run", "copy:assets"], {
      cwd: packageRoot,
      stdio: "inherit",
    });

    copyProcess.on("exit", (code, signal) => {
      if (code !== 0) {
        console.error(
          `copy:assets failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
        );
      }

      resolve();
    });

    copyProcess.on("error", (error) => {
      console.error("Failed to run copy:assets", error);
      resolve();
    });
  });
}

const runCopyAssets = runExclusive.build(copyAssets);

const watchers = watchDirs.map((dir) =>
  fs.watch(dir, { recursive: true }, runCopyAssets),
);

function dispose() {
  for (const watcher of watchers) {
    watcher.close();
  }
}

process.on("SIGINT", () => {
  dispose();
  process.exit(0);
});
process.on("SIGTERM", () => {
  dispose();
  process.exit(0);
});

console.log(
  `Watching built-in agent/skill assets:\n${watchDirs.map((dir) => `  ${dir}`).join("\n")}`,
);
runCopyAssets();
