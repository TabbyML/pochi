// Mirrors all built-in resources the VSCode extension ships with into
// `assets/`:
//
//   - vscode-webui bundle  → assets/webview-ui/dist/
//   - built-in skills      → assets/skills/
//   - built-in agents      → assets/agents/
const fs = require("node:fs");
const path = require("node:path");

function copyWebuiDist() {
  const sourceBaseDir = path.resolve(
    __dirname,
    "../../vscode-webui/dist/index",
  );
  const destBaseDir = path.resolve(__dirname, "../assets/webview-ui/dist");

  fs.rmSync(destBaseDir, { recursive: true, force: true });
  fs.mkdirSync(destBaseDir, { recursive: true });

  const filesToCopy = [
    "index.js",
    "index.css",
    "renderer-entry.js",
    "wa-sqlite.wasm",
    "make-shared-worker.js",
  ];

  for (const file of filesToCopy) {
    const sourcePath = path.join(sourceBaseDir, file);
    const destPath = path.join(destBaseDir, file);
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${sourcePath} to ${destPath}`);
  }

  const fontPattern = /^KaTeX_.*\.woff2$/i;
  for (const fontFile of fs.readdirSync(sourceBaseDir)) {
    if (!fontPattern.test(fontFile)) continue;
    const sourcePath = path.join(sourceBaseDir, fontFile);
    const destPath = path.join(destBaseDir, fontFile);
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${sourcePath} to ${destPath}`);
  }
}

function copyCommonBaseDir(name) {
  const sourceDir = path.resolve(__dirname, `../../common/src/base/${name}`);
  const destDir = path.resolve(__dirname, `../assets/${name}`);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, destDir, { recursive: true });
  console.log(`Copied ${name} from ${sourceDir} to ${destDir}`);
}

copyWebuiDist();
copyCommonBaseDir("skills");
copyCommonBaseDir("agents");
