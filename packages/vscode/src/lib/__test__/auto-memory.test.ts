import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as nodeOs from "node:os";
import * as path from "node:path";
import "reflect-metadata";
import { AutoMemoryProjectInfoName } from "@getpochi/common";
import { afterEach, beforeEach, describe, it } from "mocha";
import proxyquire from "proxyquire";
import { sanitizeMemoryRepoKey } from "../auto-memory";

type AutoMemoryModule = typeof import("../auto-memory");

describe("long-term memory helpers", () => {
  it("creates stable filesystem-safe repo keys from the project basename", () => {
    const key = sanitizeMemoryRepoKey("/Users/test/project repo");

    assert.match(key, /^[A-Za-z0-9._-]+-[a-f0-9]{10}$/);
    // Basename-only slug — parent directories are encoded in the hash.
    assert.ok(key.startsWith("project-repo-"));
    assert.ok(!key.includes("Users"));
  });

  it("disambiguates same-basename repos via the hash suffix", () => {
    const a = sanitizeMemoryRepoKey("/Users/me/work/pochi");
    const b = sanitizeMemoryRepoKey("/Users/me/oss/pochi");

    assert.ok(a.startsWith("pochi-"));
    assert.ok(b.startsWith("pochi-"));
    assert.notStrictEqual(a, b);
  });

  it("caps the slug length and falls back to 'repo' for empty basenames", () => {
    const long = sanitizeMemoryRepoKey(`/tmp/${"x".repeat(100)}`);
    assert.match(long, /^x{1,32}-[a-f0-9]{10}$/);

    const root = sanitizeMemoryRepoKey("/");
    assert.match(root, /^repo-[a-f0-9]{10}$/);
  });
});

describe("AutoMemoryManager project info file", () => {
  let tmpHome: string;
  let cwd: string;
  let proxiedModule: AutoMemoryModule;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(
      path.join(nodeOs.tmpdir(), "pochi-auto-memory-"),
    );
    cwd = await fs.mkdtemp(
      path.join(nodeOs.tmpdir(), "pochi-auto-memory-repo-"),
    );
    // VS Code's extension host marks `os.homedir` as non-configurable so we
    // can't `sinon.stub` it directly — use proxyquire to swap the bound
    // `node:os` import inside `../auto-memory`.
    proxiedModule = proxyquire.noCallThru()("../auto-memory", {
      "node:os": {
        ...nodeOs,
        homedir: () => tmpHome,
      },
    }) as AutoMemoryModule;
  });

  afterEach(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("writes project.json mapping the repoKey back to the source repo path", async () => {
    const manager = new proxiedModule.AutoMemoryManager();
    const context = await manager.readContext(cwd);
    assert.ok(context, "expected context to be created");

    const infoPath = path.join(
      tmpHome,
      ".pochi",
      "projects",
      context.repoKey,
      AutoMemoryProjectInfoName,
    );
    const info = JSON.parse(await fs.readFile(infoPath, "utf8"));
    assert.deepStrictEqual(info, {
      repoKey: context.repoKey,
      repoPath: path.resolve(cwd),
    });
  });

  it("skips rewriting project.json when the mapping is unchanged", async () => {
    const manager = new proxiedModule.AutoMemoryManager();
    const first = await manager.readContext(cwd);
    assert.ok(first);
    const infoPath = path.join(
      tmpHome,
      ".pochi",
      "projects",
      first.repoKey,
      AutoMemoryProjectInfoName,
    );
    const firstStat = await fs.stat(infoPath);

    // Second readContext should be a no-op on disk since nothing changed.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await manager.readContext(cwd);
    const secondStat = await fs.stat(infoPath);
    assert.strictEqual(secondStat.mtimeMs, firstStat.mtimeMs);
  });
});
