#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import depcheck, { type Options } from "depcheck";

interface DepcheckResult {
  dependencies: string[];
  devDependencies: string[];
  missing: Record<string, string[]>;
  using: Record<string, string[]>;
  invalidFiles: Record<string, string>;
  invalidDirs: Record<string, string>;
}

interface PackageInfo {
  name: string;
  path: string;
  hasPackageJson: boolean;
}

async function getPackages(): Promise<PackageInfo[]> {
  const packagesDirs = [
    join(process.cwd(), "packages"),
    join(process.cwd(), "private", "packages"),
  ];
  const packages: PackageInfo[] = [];

  try {
    for (const packagesDir of packagesDirs) {
      const dirs = await readdir(packagesDir, { withFileTypes: true });

      for (const dir of dirs) {
        if (dir.isDirectory()) {
          const packagePath = join(packagesDir, dir.name);
          const packageJsonPath = join(packagePath, "package.json");
          const hasPackageJson = existsSync(packageJsonPath);

          packages.push({
            name: dir.name,
            path: packagePath,
            hasPackageJson,
          });
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      // Skipping;
    } else {
      console.error("Error reading directory", error);
      process.exit(1);
    }
  }

  return packages;
}

function formatResults(packageName: string, result: DepcheckResult): void {
  console.log(`\n📦 Package: ${packageName}`);
  console.log("─".repeat(50));

  // Unused dependencies
  if (result.dependencies.length > 0) {
    console.log("🚨 Unused dependencies:");
    for (const dep of result.dependencies) {
      console.log(`  - ${dep}`);
    }
  }

  // Unused devDependencies
  if (result.devDependencies.length > 0) {
    console.log("⚠️  Unused devDependencies:");
    for (const dep of result.devDependencies) {
      console.log(`  - ${dep}`);
    }
  }

  // Missing dependencies
  const missingDeps = Object.keys(result.missing);
  if (missingDeps.length > 0) {
    console.log("❌ Missing dependencies:");
    for (const dep of missingDeps) {
      console.log(`  - ${dep} (used in: ${result.missing[dep].join(", ")})`);
    }
  }

  // Summary
  const totalUnused =
    result.dependencies.length + result.devDependencies.length;
  const totalMissing = missingDeps.length;

  if (totalUnused === 0 && totalMissing === 0) {
    console.log("✅ All dependencies are properly managed!");
  } else {
    console.log(`\n📊 Summary: ${totalUnused} unused, ${totalMissing} missing`);
  }
}

async function runDepcheck(
  packageName: string,
  packagePath: string,
): Promise<DepcheckResult> {
  const options: Options = {
    ignorePatterns: ["dist"],
    ignoreMatches: [
      ...(PackageIgnoreList[packageName] || []),

      // Workspace dependencies
      "vitest",
    ],
  };
  return new Promise((resolve) => {
    depcheck(packagePath, options, (result) => {
      if (result.invalidFiles && Object.keys(result.invalidFiles).length > 0) {
        console.warn(
          `Warning: Invalid files found in ${packagePath}:`,
          result.invalidFiles,
        );
      }
      resolve(result as DepcheckResult);
    });
  });
}

async function main(): Promise<void> {
  console.log("🔍 Running dependency check across all packages...\n");

  const packages = await getPackages();

  if (packages.length === 0) {
    console.log("No packages found in packages/ directory");
    return;
  }

  let hasIssues = false;

  for (const pkg of packages) {
    if (!pkg.hasPackageJson) {
      console.log(`⚠️  Skipping ${pkg.name} - no package.json found`);
      continue;
    }

    try {
      const result = await runDepcheck(pkg.name, pkg.path);
      if (pkg.name === "vscode") {
        // biome-ignore lint/performance/noDelete: delete for type safety
        delete result.missing.vscode;
      }
      formatResults(pkg.name, result);

      // Check if this package has issues
      const totalUnused =
        result.dependencies.length + result.devDependencies.length;
      const totalMissing = Object.keys(result.missing).length;

      if (totalUnused > 0 || totalMissing > 0) {
        hasIssues = true;
      }
    } catch (error) {
      console.error(`❌ Error checking ${pkg.name}:`, error);
      hasIssues = true;
    }
  }

  console.log(`\n${"=".repeat(50)}`);

  if (hasIssues) {
    console.log(
      "❌ Some packages have dependency issues. Review the output above.",
    );
    process.exit(1);
  } else {
    console.log("✅ All packages have clean dependencies!");
  }
}

const PackageIgnoreList: Record<string, string[]> = {
  "label-studio": [
    // tailwind
    "tailwindcss",
    "tailwindcss-animate",
  ],
  "vscode-webui": [
    // tailwind
    "tailwindcss",
    "tailwindcss-animate",
    "@tailwindcss/typography",

    // preact-signal
    "@preact/signals-react-transform",

    // testing
    "@testing-library/*",
    "jsdom",

    // storybook
    "@storybook/*",

    // https://github.com/livestorejs/livestore/tree/main/packages/%40livestore/adapter-web
    "@livestore/peer-deps",
    "@livestore/wa-sqlite",
  ],
  "livekit-web-example": [
    "@livestore/peer-deps",
    "@livestore/wa-sqlite",
    "wrangler",
  ],
  website: [
    // tailwind
    "tailwindcss",
    "tailwindcss-animate",

    // testing
    "@testing-library/*",
    "jsdom",
  ],
  server: [
    // Peer-dependency of resume-stream
    "redis",

    // Nested-dependency of hono-storage/s3
    "@aws-sdk/client-s3",
  ],
  vscode: [
    // Testing
    "mocha",
    "@vscode/test-electron",

    // Releasing
    "ovsx",
  ],
  cli: ["@types/bun"],
  livekit: ["@ai-sdk/provider-utils", "@ai-sdk/provider"],
  docs: ["@tailwindcss/postcss", "postcss", "tailwindcss", "typescript"],
};

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
