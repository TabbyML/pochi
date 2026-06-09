import { describe, expect, it } from "vitest";
import { formatPochiFileDisplayPath } from "../filepath-formatter";

describe("formatPochiFileDisplayPath", () => {
  const homeDir = "/Users/jueliang";

  it("shortens built-in skill and agent paths from VS Code extension assets", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/references/chart.md",
      ),
    ).toBe("pochi://skills/widget-guidelines/references/chart.md");

    expect(
      formatPochiFileDisplayPath(
        "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/agents/guide/references/config-schema.md",
      ),
    ).toBe("pochi://agents/guide/references/config-schema.md");
  });

  it("shortens built-in paths materialized by the CLI bundle", () => {
    expect(
      formatPochiFileDisplayPath(
        "/var/folders/tmp/pochi-builtin-abc123def4567890/skills/widget-guidelines/references/chart.md",
      ),
    ).toBe("pochi://skills/widget-guidelines/references/chart.md");

    expect(
      formatPochiFileDisplayPath(
        "/var/folders/tmp/pochi-builtin-abc123def4567890/agents/guide/references/config-schema.md",
      ),
    ).toBe("pochi://agents/guide/references/config-schema.md");
  });

  it("keeps built-in virtual file URIs unchanged", () => {
    expect(
      formatPochiFileDisplayPath(
        "pochi://skills/widget-guidelines/references/interactive.md",
      ),
    ).toBe("pochi://skills/widget-guidelines/references/interactive.md");
  });

  it("shortens built-in paths from the VS Code development assets directory", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/coding/work/tabbyML/pochi.worktree/builtin-paths/packages/vscode/assets/skills/widget-guidelines/references",
      ),
    ).toBe("pochi://skills/widget-guidelines/references");
  });

  it("shortens project memory paths stored under the Pochi project directory", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory/project.md",
        { homeDir },
      ),
    ).toBe("pochi://$/memory/project.md");

    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory/MEMORY.md",
        { homeDir },
      ),
    ).toBe("pochi://$/memory/MEMORY.md");
  });

  it("shortens project transcript paths stored under the Pochi project directory", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/projects/pochi-c212a47e71/transcripts",
        { homeDir },
      ),
    ).toBe("pochi://$/transcripts");

    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/projects/pochi-c212a47e71/transcripts/0076cd6c-8fb7-4d8f-9890-4bef6171e7e1.md",
        { homeDir },
      ),
    ).toBe("pochi://$/transcripts/0076cd6c-8fb7-4d8f-9890-4bef6171e7e1.md");
  });

  it("shortens task tool result paths stored under the Pochi task directory", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb/tool-results/executeCommand-HsqmmmQnwJuB1Jtz-output.log",
        { homeDir },
      ),
    ).toBe("pochi://~/tool-results/executeCommand-HsqmmmQnwJuB1Jtz-output.log");
  });

  it("shortens unmatched Pochi home paths with the global display prefix", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb",
        { homeDir },
      ),
    ).toBe("pochi://tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb");

    expect(
      formatPochiFileDisplayPath("/Users/jueliang/.pochi/settings.json", {
        homeDir,
      }),
    ).toBe("pochi://settings.json");

    expect(
      formatPochiFileDisplayPath(
        "C:\\Users\\jueliang\\.pochi\\tasks\\ac7cadc8-4685-4508-9c75-2cf273b54deb",
        { homeDir: "C:\\Users\\jueliang" },
      ),
    ).toBe("pochi://tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb");

    expect(
      formatPochiFileDisplayPath(
        "/mnt/dev-home/alice/.pochi/tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb",
        { homeDir: "/mnt/dev-home/alice" },
      ),
    ).toBe("pochi://tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb");
  });

  it("keeps workspace .pochi paths unchanged", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/coding/work/tabbyML/pochi/.pochi/agents/project-agent.md",
      ),
    ).toBe(
      "/Users/jueliang/coding/work/tabbyML/pochi/.pochi/agents/project-agent.md",
    );

    expect(formatPochiFileDisplayPath(".pochi/skills/project-skill/SKILL.md"))
      .toBe(".pochi/skills/project-skill/SKILL.md");
  });

  it("keeps real Pochi storage paths unchanged without a caller home directory", () => {
    expect(
      formatPochiFileDisplayPath("/Users/jueliang/.pochi/settings.json"),
    ).toBe("/Users/jueliang/.pochi/settings.json");
  });

  it("keeps task memory virtual file URIs unchanged", () => {
    expect(formatPochiFileDisplayPath("pochi://-/memory.md")).toBe(
      "pochi://-/memory.md",
    );
  });

  it("shortens project and task virtual file URIs", () => {
    expect(formatPochiFileDisplayPath("pochi://$/memory/llm-training.md")).toBe(
      "pochi://$/memory/llm-training.md",
    );

    expect(
      formatPochiFileDisplayPath(
        "pochi://~/tool-results/executeCommand-output.log",
      ),
    ).toBe("pochi://~/tool-results/executeCommand-output.log");
  });

  it("keeps ordinary paths unchanged", () => {
    expect(
      formatPochiFileDisplayPath("packages/vscode-webui/src/main.tsx"),
    ).toBe("packages/vscode-webui/src/main.tsx");
  });
});
