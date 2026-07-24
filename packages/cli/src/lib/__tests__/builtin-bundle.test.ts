import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const materializedRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.resetModules();
  await Promise.all(
    materializedRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

function createEmbeddedBlob(name: string, content: string): Blob & {
  name: string;
} {
  return Object.assign(new Blob([content]), { name });
}

describe("built-in bundle", () => {
  it("materializes scripts bundled with skills", async () => {
    const originalBun = (
      globalThis as { Bun?: Record<string, unknown> }
    ).Bun;
    vi.stubGlobal("Bun", {
      ...originalBun,
      embeddedFiles: [
        createEmbeddedBlob(
          "/app/assets/skills/worktree-isolation/SKILL.md",
          "skill instructions",
        ),
        createEmbeddedBlob(
          "/app/assets/skills/worktree-isolation/scripts/create-worktree.sh",
          "#!/bin/sh\n",
        ),
      ],
    });

    const { ensureBuiltInBundle } = await import("../builtin-bundle");
    const bundle = await ensureBuiltInBundle();

    expect(bundle).not.toBeNull();
    if (!bundle) {
      return;
    }
    materializedRoots.push(path.dirname(bundle.skillsDir));
    await expect(
      readFile(
        path.join(
          bundle.skillsDir,
          "worktree-isolation/scripts/create-worktree.sh",
        ),
        "utf8",
      ),
    ).resolves.toBe("#!/bin/sh\n");
  });
});
