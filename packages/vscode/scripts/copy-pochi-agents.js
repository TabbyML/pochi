const fs = require("node:fs");
const path = require("node:path");

const repoAgentsDir = path.resolve(__dirname, "../../..", ".pochi/agents");
const extensionAgentsDir = path.resolve(__dirname, "../.pochi/agents");

if (!fs.existsSync(repoAgentsDir)) {
  console.log(
    `Source agents directory not found at ${repoAgentsDir}. Skipping copy.`,
  );
  process.exit(0);
}

fs.rmSync(extensionAgentsDir, { recursive: true, force: true });
fs.mkdirSync(extensionAgentsDir, { recursive: true });

const copyDirectory = (sourceDir, targetDir) => {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(targetPath, { recursive: true });
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
};

copyDirectory(repoAgentsDir, extensionAgentsDir);

console.log(
  `Copied Pochi agents from ${repoAgentsDir} to ${extensionAgentsDir}.`,
);
