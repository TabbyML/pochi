#!/usr/bin/env bun

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import packageJson from "../package.json";

const NPM_NAME = process.env.POCHI_CLI_NPM_NAME || "@getpochi/pochi";

const DIST_DIR = "./dist";
const TEMP_PACKAGE_DIR = "./npm-release";

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const tag =
    args.find((arg) => arg.startsWith("--tag="))?.split("=")[1] || "latest";

  console.log("🚀 Starting npm release process...");

  // Clean up previous builds
  if (existsSync(DIST_DIR)) {
    console.log("🧹 Cleaning dist directory...");
    rmSync(DIST_DIR, { recursive: true, force: true });
  }

  if (existsSync(TEMP_PACKAGE_DIR)) {
    console.log("🧹 Cleaning temp package directory...");
    rmSync(TEMP_PACKAGE_DIR, { recursive: true, force: true });
  }

  // Build the CLI using the existing build_js function
  console.log("📦 Building CLI for npm...");
  await $`TARGET=node ./scripts/build-cli.sh`;

  // Verify the build output exists
  const builtCliPath = join(DIST_DIR, "cli.js");
  if (!existsSync(builtCliPath)) {
    console.error("❌ Build failed: cli.js not found in dist directory");
    process.exit(1);
  }

  // Create a temporary directory for the npm package
  console.log("📁 Creating npm package structure...");
  await $`mkdir -p ${TEMP_PACKAGE_DIR}`;

  // Copy the built CLI to the temp package with executable permissions
  await $`cp ${DIST_DIR}/* ${TEMP_PACKAGE_DIR}/`;
  await $`chmod +x ${TEMP_PACKAGE_DIR}/cli.js`;

  // Create a package.json for npm distribution
  const npmPackageJson = {
    ...packageJson,
    name: NPM_NAME,
    main: "cli.js",
    bin: {
      pochi: "cli.js",
    },
    dependencies: {},
    devDependencies: {},
    scripts: {},
  };

  // Write the npm package.json
  await Bun.write(
    join(TEMP_PACKAGE_DIR, "package.json"),
    JSON.stringify(npmPackageJson, null, 2),
  );

  // Copy README and LICENSE if they exist
  // .npmrc for auth, .npmrc will be ignore when push, so it safe to add it
  for (const file of [".npmrc", "README.md", "../../LICENSE"]) {
    if (existsSync(file)) {
      await $`cp ${file} ${TEMP_PACKAGE_DIR}/`;
    }
  }

  console.log("✅ Package prepared successfully");
  console.log(`📊 Package size: ${await getDirectorySize(TEMP_PACKAGE_DIR)}`);

  if (isDryRun) {
    console.log("🔍 Dry run mode - showing package contents:");
    await $`ls -la ${TEMP_PACKAGE_DIR}`;
    console.log("📝 package.json contents:");
    console.log(JSON.stringify(npmPackageJson, null, 2));
    console.log("⚠️  Dry run complete - not publishing to npm");
    return;
  }

  // Publish to npm
  console.log(`📤 Publishing to npm with tag: ${tag}...`);
  process.chdir(TEMP_PACKAGE_DIR);

  try {
    await $`npm publish --access public --tag ${tag}`;
    console.log("🎉 Successfully published to npm!");
  } catch (error) {
    console.error("❌ Failed to publish to npm:", error);
    process.exit(1);
  }
}

async function getDirectorySize(dirPath: string): Promise<string> {
  try {
    const result = await $`du -sh ${dirPath}`.text();
    return result.split("\t")[0];
  } catch {
    return "unknown";
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
