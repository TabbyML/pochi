import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the directory shipping the built-in skill markdown files.
 *
 *   - `bun build --target node`: the build script copies the folder to
 *     `<dist>/skills/`, next to `cli.js`. `thisDir` equals the dist root.
 *   - `bun build --compile`: `thisDir` is a virtual path inside the binary,
 *     but `process.execPath` is the real on-disk location and the build
 *     script copies the folder next to it as well.
 *   - Dev / test runtime: the file is not bundled, so we resolve
 *     `@getpochi/common`'s main entry and walk into its source tree.
 */
function resolveBuiltInSkillsDir(): string {
  const bundleSibling = join(thisDir, "skills");
  if (existsSync(bundleSibling)) return bundleSibling;

  const binarySibling = join(dirname(process.execPath), "skills");
  if (existsSync(binarySibling)) return binarySibling;

  // `@getpochi/common`'s main entry is `src/base/index.ts`; the built-in
  // skill markdown lives in `src/base/skills/` next to it.
  try {
    const require = createRequire(import.meta.url);
    const commonMain = require.resolve("@getpochi/common");
    return join(dirname(commonMain), "skills");
  } catch {
    return bundleSibling;
  }
}

export const BuiltInSkillsDir = resolveBuiltInSkillsDir();
