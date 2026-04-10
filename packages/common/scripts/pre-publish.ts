import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const scripts = [
  "fetch-guide-references.ts",
];

for (const script of scripts) {
  console.log(`Running ${script}...`);
  execSync(`bun ${join(__dirname, script)}`, { stdio: "inherit" });
}
