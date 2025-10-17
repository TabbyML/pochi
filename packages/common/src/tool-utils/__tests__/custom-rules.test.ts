import { readFile, stat } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { home, mockHomedir } = vi.hoisted(() => {
  const home = "/home/user";
  return { home, mockHomedir: vi.fn().mockReturnValue(home) };
});

vi.mock("node:fs/promises");
vi.mock("node:os", () => ({
  homedir: mockHomedir,
}));

import { collectAllRuleFiles, collectCustomRules } from "../custom-rules";

describe("collectCustomRules", () => {
  const cwd = "/workspace";

  beforeEach(() => {
    vi.mocked(readFile).mockClear();
    vi.mocked(stat).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should collect rules from all sources by default", async () => {
    vi.mocked(readFile).mockImplementation(async (filePath) => {
      if (filePath === `${home}/.pochi/README.pochi.md`) {
        return "system rule";
      }
      if (filePath === `${cwd}/README.pochi.md`) {
        return "workspace rule";
      }
      if (filePath === `${cwd}/AGENTS.md`) {
        return "agents rule";
      }
      if (filePath === `${cwd}/custom.md`) {
        return "custom rule";
      }
      throw new Error("File not found");
    });
    
    vi.mocked(stat).mockImplementation(async (filePath) => {
      return {
        isFile: () => true,
        isDirectory: () => false,
      } as any;
    });

    const rules = await collectCustomRules(cwd, [`${cwd}/custom.md`]);

    expect(rules).toContain("# Rules from ~/.pochi/README.pochi.md\nsystem rule");
    expect(rules).toContain("# Rules from README.pochi.md\nworkspace rule");
    expect(rules).toContain("# Rules from AGENTS.md\nagents rule");
    expect(rules).toContain("# Rules from custom.md\ncustom rule");
  });

  it("should not include default or system rules if disabled", async () => {
    vi.mocked(readFile).mockImplementation(async (filePath) => {
      if (filePath === `${cwd}/custom.md`) {
        return "custom rule";
      }
      throw new Error("File not found");
    });
    
    vi.mocked(stat).mockImplementation(async (filePath) => {
      return {
        isFile: () => true,
        isDirectory: () => false,
      } as any;
    });

    const rules = await collectCustomRules(
      cwd,
      [`${cwd}/custom.md`],
      false,
      false,
    );

    expect(rules).not.toContain("system rule");
    expect(rules).not.toContain("workspace rule");
    expect(rules).toContain("# Rules from custom.md\ncustom rule");
  });

  it("should ignore files that cannot be read", async () => {
    vi.mocked(readFile).mockImplementation(async (filePath) => {
      if (filePath === `${cwd}/custom.md`) {
        return "custom rule";
      }
      throw new Error("Read error");
    });
    
    vi.mocked(stat).mockImplementation(async (filePath) => {
      return {
        isFile: () => true,
        isDirectory: () => false,
      } as any;
    });

    const rules = await collectCustomRules(cwd, [`${cwd}/custom.md`]);

    expect(rules).toBe("# Rules from custom.md\ncustom rule\n");
  });

  it("should return an empty string if no rules are found", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("File not found"));
    
    vi.mocked(stat).mockImplementation(async (filePath) => {
      return {
        isFile: () => true,
        isDirectory: () => false,
      } as any;
    });

    const rules = await collectCustomRules(cwd, [], false, false);

    expect(rules).toBe("");
  });
});

describe("collectAllRuleFiles", () => {
  const cwd = "/workspace";

  beforeEach(() => {
    vi.mocked(readFile).mockClear();
    vi.mocked(stat).mockClear();

    vi.mocked(stat).mockImplementation(async (path) => {
      if (typeof path === "string" && path.endsWith(".md")) {
        return { isFile: () => true } as any;
      }
      throw new Error(`File not found: ${path}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should collect a single rule file", async () => {
    const customRulePath = `${cwd}/custom.md`;
    vi.mocked(readFile).mockResolvedValue("");

    const files = await collectAllRuleFiles(cwd, { customRuleFiles: [customRulePath], includeDefaultRules: false, includeGlobalRules: false });

    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe(customRulePath);
  });

  it("should collect rules from imported files", async () => {
    const mainRulePath = `${cwd}/main.md`;
    const importedRulePath = `${cwd}/imported.md`;

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (path === mainRulePath) {
        return "@imported.md";
      }
      if (path === importedRulePath) {
        return "imported rule content";
      }
      return "";
    });

    const files = await collectAllRuleFiles(cwd, { customRuleFiles: [mainRulePath], includeDefaultRules: false, includeGlobalRules: false });

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.filePath)).toContain(mainRulePath);
    expect(files.map((f) => f.filePath)).toContain(importedRulePath);
  });

  it("should handle nested imports", async () => {
    const mainRulePath = `${cwd}/main.md`;
    const importedRulePath = `${cwd}/imported.md`;
    const nestedRulePath = `${cwd}/nested.md`;

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (path === mainRulePath) return "@imported.md";
      if (path === importedRulePath) return "@nested.md";
      if (path === nestedRulePath) return "nested content";
      return "";
    });

    const files = await collectAllRuleFiles(cwd, { customRuleFiles: [mainRulePath], includeDefaultRules: false, includeGlobalRules: false });

    expect(files).toHaveLength(3);
    expect(files.map((f) => f.filePath)).toContain(mainRulePath);
    expect(files.map((f) => f.filePath)).toContain(importedRulePath);
    expect(files.map((f) => f.filePath)).toContain(nestedRulePath);
  });

  it("should handle circular imports gracefully", async () => {
    const mainRulePath = `${cwd}/main.md`;
    const importedRulePath = `${cwd}/imported.md`;

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (path === mainRulePath) return "@imported.md";
      if (path === importedRulePath) return "@main.md";
      return "";
    });

    const files = await collectAllRuleFiles(cwd, { customRuleFiles: [mainRulePath], includeDefaultRules: false, includeGlobalRules: false });

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.filePath)).toContain(mainRulePath);
    expect(files.map((f) => f.filePath)).toContain(importedRulePath);
  });

  it("should ignore non-existent imported files", async () => {
    const mainRulePath = `${cwd}/main.md`;

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (path === mainRulePath) return "@non-existent.md";
      throw new Error("File not found");
    });

    vi.mocked(stat).mockImplementation(async (path) => {
      if (path === mainRulePath) {
        return { isFile: () => true } as any;
      }
      throw new Error(`File not found: ${path}`);
    });

    const files = await collectAllRuleFiles(cwd, { customRuleFiles: [mainRulePath], includeDefaultRules: false, includeGlobalRules: false });

    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe(mainRulePath);
  });

  it("should not import non-markdown files", async () => {
    const mainRulePath = `${cwd}/main.md`;

    vi.mocked(readFile).mockImplementation(async (path) => {
      if (path === mainRulePath) return "@imported.txt";
      return "";
    });

    const files = await collectAllRuleFiles(cwd, { customRuleFiles: [mainRulePath], includeDefaultRules: false, includeGlobalRules: false });

    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe(mainRulePath);
  });
});
