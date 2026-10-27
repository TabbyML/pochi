import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { getBuiltInSkillsDir } from "../builtin-skills-dir";
import { loadSkills } from "../load-skills";

async function listBuiltInSkillNames(): Promise<string[]> {
  const dir = await getBuiltInSkillsDir();
  const names: string[] = [];
  for (const entry of await fs.readdir(dir, {
    withFileTypes: true,
  })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      names.push(entry.name.replace(/\.md$/i, ""));
    } else if (entry.isDirectory()) {
      try {
        const stat = await fs.stat(path.join(dir, entry.name, "SKILL.md"));
        if (stat.isFile()) names.push(entry.name);
      } catch {
        // No SKILL.md in this folder.
      }
    }
  }
  return names.sort();
}

describe("loadSkills", () => {
  it("exposes built-in skill markdown directly from the on-disk folder", async () => {
    const dir = await getBuiltInSkillsDir();
    const names = await listBuiltInSkillNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const flatPath = path.join(dir, `${name}.md`);
      const dirPath = path.join(dir, name, "SKILL.md");
      const filePath = (await fs
        .stat(flatPath)
        .then(() => true)
        .catch(() => false))
        ? flatPath
        : dirPath;
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("---");
      expect(content).toContain(`name: ${name}`);
    }
  });

  it("also picks up flat `<name>.md` files placed in a project skills dir", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-load-skills-flat-"),
    );
    try {
      const projectSkillsDir = path.join(projectRoot, ".pochi", "skills");
      await fs.mkdir(projectSkillsDir, { recursive: true });
      await fs.writeFile(
        path.join(projectSkillsDir, "flat-skill.md"),
        `---\nname: flat-skill\ndescription: A flat single-file skill\n---\n\nFlat skill body.`,
      );

      const skills = await loadSkills(projectRoot, false);
      const flat = skills.find((s) => s.name === "flat-skill");
      expect(flat).toBeDefined();
      expect(flat?.filePath).toContain("flat-skill.md");
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("returns built-in skills marked with isBuiltIn=true and a resolvable filePath", async () => {
    const skills = await loadSkills(undefined, false);
    const builtIns = skills.filter((s) => s.isBuiltIn);

    expect(builtIns.map((s) => s.name).toSorted()).toEqual(
      await listBuiltInSkillNames(),
    );

    for (const skill of builtIns) {
      expect(path.isAbsolute(skill.filePath)).toBe(true);
      await expect(fs.access(skill.filePath)).resolves.toBeUndefined();
    }
  });

  it("lets project skills shadow built-ins with the same name (built-in wins)", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-load-skills-"),
    );

    try {
      const projectSkillsDir = path.join(projectRoot, ".pochi", "skills");
      await fs.mkdir(path.join(projectSkillsDir, "find-skills"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(projectSkillsDir, "find-skills", "SKILL.md"),
        `---\nname: find-skills\ndescription: Project override\n---\n\nProject override body.`,
      );

      const skills = await loadSkills(projectRoot, false);
      const findSkill = skills.find((s) => s.name === "find-skills");
      expect(findSkill).toBeDefined();
      expect(findSkill?.isBuiltIn).toBe(true);
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });
});
