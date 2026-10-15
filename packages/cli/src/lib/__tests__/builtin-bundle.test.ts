import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const materializedRoots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.resetModules();
  await Promise.all(
    materializedRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

function createEmbeddedBlob(
  name: string,
  content: string,
): Blob & {
  name: string;
} {
  return Object.assign(new Blob([content]), { name });
}

describe("built-in bundle", () => {
  it("materializes agent scripts and invalidates the bundle when a script changes", async () => {
    const originalBun = (globalThis as { Bun?: Record<string, unknown> }).Bun;
    const definition = createEmbeddedBlob(
      "/app/assets/agents/browser/AGENT.md",
      "browser instructions",
    );
    const powershell = createEmbeddedBlob(
      "/app/assets/agents/browser/scripts/install.ps1",
      "Write-Output installed\n",
    );
    const bundleDirs: string[] = [];

    for (const script of ["#!/bin/sh\necho v1\n", "#!/bin/sh\necho v2\n"]) {
      vi.resetModules();
      vi.stubGlobal("Bun", {
        ...originalBun,
        embeddedFiles: [
          definition,
          powershell,
          createEmbeddedBlob(
            "/app/assets/agents/browser/scripts/install.sh",
            script,
          ),
          createEmbeddedBlob("/app/assets/unrelated.sh", "ignored"),
        ],
      });
      const { ensureBuiltInBundle } = await import("../builtin-bundle");
      const bundle = await ensureBuiltInBundle();
      expect(bundle).not.toBeNull();
      if (!bundle) throw new Error("Expected embedded agent bundle");
      materializedRoots.push(path.dirname(bundle.agentsDir));
      bundleDirs.push(bundle.agentsDir);
      await expect(
        readFile(path.join(bundle.agentsDir, "browser/AGENT.md"), "utf8"),
      ).resolves.toBe("browser instructions");
      await expect(
        readFile(
          path.join(bundle.agentsDir, "browser/scripts/install.sh"),
          "utf8",
        ),
      ).resolves.toBe(script);
      await expect(
        readFile(
          path.join(bundle.agentsDir, "browser/scripts/install.ps1"),
          "utf8",
        ),
      ).resolves.toBe("Write-Output installed\n");
      await expect(readdir(bundle.agentsDir)).resolves.toEqual(["browser"]);
    }

    expect(bundleDirs[0]).not.toBe(bundleDirs[1]);
  });

  it("materializes scripts bundled with skills", async () => {
    const originalBun = (globalThis as { Bun?: Record<string, unknown> }).Bun;
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
