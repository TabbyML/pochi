// Mirrors `packages/common/src/base/skills/` into the extension's
// `assets/skills/` so the VSCode `SkillManager` can read built-in skills
// from a stable on-disk path (`<extensionUri>/assets/skills/`).
const fs = require("node:fs");
const path = require("node:path");

const sourceDir = path.resolve(__dirname, "../../common/src/base/skills");
const destDir = path.resolve(__dirname, "../assets/skills");

fs.rmSync(destDir, { recursive: true, force: true });
fs.cpSync(sourceDir, destDir, { recursive: true });
console.log(`Copied skills from ${sourceDir} to ${destDir}`);
