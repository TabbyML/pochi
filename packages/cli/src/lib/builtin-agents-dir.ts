import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBuiltInBundle } from "./builtin-bundle";

const thisDir = dirname(fileURLToPath(import.meta.url));

export async function getBuiltInAgentsDir(): Promise<string> {
  const bundle = await ensureBuiltInBundle();
  if (bundle) return bundle.agentsDir;

  const bundleSibling = join(thisDir, "agents");
  if (existsSync(bundleSibling)) return bundleSibling;

  const binarySibling = join(dirname(process.execPath), "agents");
  if (existsSync(binarySibling)) return binarySibling;

  try {
    const require = createRequire(import.meta.url);
    const commonMain = require.resolve("@getpochi/common");
    return join(dirname(commonMain), "agents");
  } catch {
    return bundleSibling;
  }
}
