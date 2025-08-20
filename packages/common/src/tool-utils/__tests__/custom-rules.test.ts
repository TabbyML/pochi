import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { home, mockHomedir } = vi.hoisted(() => {
  const home = "/home/user";
  return { home, mockHomedir: vi.fn().mockReturnValue(home) };
});

vi.mock("node:fs/promises");
vi.mock("node:os", () => ({
  homedir: mockHomedir,
}));

import { collectCustomRules } from "../custom-rules";

describe("collectCustomRules", () => {
  const cwd = "/workspace";

  beforeEach(() => {
    vi.mocked(readFile).mockClear();
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

    const rules = await collectCustomRules(cwd, [`${cwd}/custom.md`]);

    expect(rules).toBe("# Rules from custom.md\ncustom rule\n");
  });

  it("should return an empty string if no rules are found", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("File not found"));

    const rules = await collectCustomRules(cwd, [], false, false);

    expect(rules).toBe("");
  });
});

