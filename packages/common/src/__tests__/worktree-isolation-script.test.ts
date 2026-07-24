import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const createWorktreeScript = fileURLToPath(
  new URL(
    "../base/skills/worktree-isolation/scripts/create-worktree.sh",
    import.meta.url,
  ),
);

const temporaryDirectories: string[] = [];

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function createFixtureRepository(): Promise<string> {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "pochi-worktree-skill-"),
  );
  temporaryDirectories.push(temporaryDirectory);
  const repository = path.join(temporaryDirectory, "repository");

  await mkdir(path.join(repository, ".pochi"), { recursive: true });
  await writeFile(path.join(repository, "README.md"), "fixture\n");
  await writeFile(path.join(repository, ".gitignore"), ".env.local\n");
  await writeFile(path.join(repository, ".worktreeinclude"), ".env.local\n");
  await writeFile(path.join(repository, ".env.local"), "TOKEN=test\n");
  await writeFile(
    path.join(repository, ".pochi/init.sh"),
    "printf initialized > .initialized-by-skill\n",
  );

  runGit(repository, ["init"]);
  runGit(repository, [
    "add",
    "README.md",
    ".gitignore",
    ".worktreeinclude",
    ".pochi/init.sh",
  ]);
  runGit(repository, [
    "-c",
    "user.name=Pochi Test",
    "-c",
    "user.email=pochi@example.com",
    "commit",
    "-m",
    "initial commit",
  ]);

  return repository;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe.skipIf(process.platform === "win32")(
  "worktree isolation creation script",
  () => {
    it("creates a durable worktree without initializing by default", async () => {
      const repository = await createFixtureRepository();
      const output = execFileSync(
        "sh",
        [createWorktreeScript, "--topic", "Review Default", "--base", "HEAD"],
        { cwd: repository, encoding: "utf8" },
      );
      const result = JSON.parse(output.trim().split("\n").at(-1) ?? "");

      expect(result).toMatchObject({
        ok: true,
        branch: "worktree/review-default",
        base: "HEAD",
        initialized: false,
        error: "",
      });
      const canonicalRepository = await realpath(repository);
      expect(result.root).toBe(
        path.join(`${canonicalRepository}.worktree`, "worktree-review-default"),
      );
      await expect(
        readFile(path.join(result.root, ".env.local"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(
        readFile(path.join(result.root, ".initialized-by-skill"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(runGit(repository, ["worktree", "list", "--porcelain"])).toContain(
        `worktree ${result.root}`,
      );
    });

    it("copies included files and runs initialization when requested", async () => {
      const repository = await createFixtureRepository();
      const output = execFileSync(
        "sh",
        [
          createWorktreeScript,
          "--topic",
          "Review Init",
          "--base",
          "HEAD",
          "--init",
        ],
        { cwd: repository, encoding: "utf8" },
      );
      const result = JSON.parse(output.trim().split("\n").at(-1) ?? "");

      expect(result).toMatchObject({
        ok: true,
        branch: "worktree/review-init",
        base: "HEAD",
        initialized: true,
        error: "",
      });
      const canonicalRepository = await realpath(repository);
      expect(result.root).toBe(
        path.join(`${canonicalRepository}.worktree`, "worktree-review-init"),
      );
      await expect(
        readFile(path.join(result.root, ".env.local"), "utf8"),
      ).resolves.toBe("TOKEN=test\n");
      await expect(
        readFile(path.join(result.root, ".initialized-by-skill"), "utf8"),
      ).resolves.toBe("initialized");
      expect(runGit(repository, ["worktree", "list", "--porcelain"])).toContain(
        `worktree ${result.root}`,
      );
    });
  },
);
