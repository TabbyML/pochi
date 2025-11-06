const fs = require("node:fs");
const path = require("node:path");

const sourceBaseDir = path.resolve(__dirname, "../../vscode-webui/dist/index");
const destBaseDir = path.resolve(
  __dirname,
  "../../vscode/assets/webview-ui/dist",
);

// Ensure destination directory exists
fs.mkdirSync(destBaseDir, { recursive: true });

const filesToCopy = ["index.js", "index.css", "wa-sqlite.wasm"];

// Copy fixed-name files
for (const file of filesToCopy) {
  const sourcePath = path.join(sourceBaseDir, file);
  const destPath = path.join(destBaseDir, file);
  fs.copyFileSync(sourcePath, destPath);
  console.log(`Copied ${sourcePath} to ${destPath}`);
}

// Copy KaTeX fonts directory (only .woff2 format)
const fontPattern = /^KaTeX_.*\.woff2$/i;

for (const fontFile of fs.readdirSync(sourceBaseDir)) {
  if (!fontPattern.test(fontFile)) continue;

  const sourcePath = path.join(sourceBaseDir, fontFile);
  const destPath = path.join(destBaseDir, fontFile);
  fs.copyFileSync(sourcePath, destPath);
  console.log(`Copied ${sourcePath} to ${destPath}`);
}
