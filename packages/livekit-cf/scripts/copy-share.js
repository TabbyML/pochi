#!/usr/bin/env node

import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const websiteRoot = join(__dirname, "..");
const vsCodeWebuiRoot = join(
  websiteRoot,
  "..",
  "..",
  "packages",
  "vscode-webui",
);
const websiteDistDir = join(websiteRoot, "dist");
const websiteAssetsDir = join(websiteDistDir, "assets");
const shareDistDir = join(vsCodeWebuiRoot, "dist", "share");
const shareAssetsDir = join(shareDistDir, "assets");

/**
 * Copy all files from source directory to destination directory
 */
function copyDirectory(srcDir, destDir) {
  try {
    const files = readdirSync(srcDir);

    for (const file of files) {
      const srcPath = join(srcDir, file);
      const destPath = join(destDir, file);

      const stat = statSync(srcPath);
      if (stat.isFile()) {
        copyFileSync(srcPath, destPath);
        console.log(`Copied: ${file}`);
      }
    }
  } catch (error) {
    console.error(
      `Error copying directory ${srcDir} to ${destDir}:`,
      error.message,
    );
    process.exit(1);
  }
}

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    console.error(`Error creating directory ${dir}:`, error.message);
    process.exit(1);
  }
}

console.log("🏗️  Copying share.html for website...");

// Step 1: Ensure website dist directories exist
console.log("\n📁 Creating website dist directories...");
ensureDir(websiteDistDir);
ensureDir(websiteAssetsDir);

// Step 2: Copy share.html to website dist
console.log("\n📄 Copying share.html...");
const shareHtmlSrc = join(shareDistDir, "share.html");
const shareHtmlDest = join(websiteDistDir, "index.html");
copyFileSync(shareHtmlSrc, shareHtmlDest);
console.log("Copied: share.html");

// Step 3: Copy assets from share/assets to website/dist/assets
console.log("\n🎨 Copying assets...");
copyDirectory(shareAssetsDir, websiteAssetsDir);

console.log("\n✅ Share build completed successfully!");
