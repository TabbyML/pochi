import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBuiltInBundle } from "./builtin-bundle";

const thisDir = dirname(fileURLToPath(import.meta.url));

export async function getBuiltInSkillsDir(): Promise<string> {
  const bundle = await ensureBuiltInBundle();
  if (bundle) return bundle.skillsDir;

  const bundleSibling = join(thisDir, "skills");
  if (existsSync(bundleSibling)) return bundleSibling;

  const binarySibling = join(dirname(process.execPath), "skills");
  if (existsSync(binarySibling)) return binarySibling;

  try {
    const require = createRequire(import.meta.url);
    const commonMain = require.resolve("@getpochi/common");
    return join(dirname(commonMain), "skills");
  } catch {
    return bundleSibling;
  }
}
