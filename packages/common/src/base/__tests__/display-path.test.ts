import { describe, expect, it } from "vitest";
import {
  formatPochiFileDisplayPath,
  getPochiBuiltinFileDisplayInfo,
} from "../display-path";

describe("formatPochiFileDisplayPath", () => {
  it("shortens built-in skill and agent paths from VS Code extension assets", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/references/chart.md",
      ),
    ).toBe("skills/widget-guidelines/references/chart.md");

    expect(
      formatPochiFileDisplayPath(
        "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/agents/guide/references/config-schema.md",
      ),
    ).toBe("agents/guide/references/config-schema.md");
  });

  it("shortens built-in paths materialized by the CLI bundle", () => {
    expect(
      formatPochiFileDisplayPath(
        "/var/folders/tmp/pochi-builtin-abc123def4567890/skills/widget-guidelines/references/chart.md",
      ),
    ).toBe("skills/widget-guidelines/references/chart.md");

    expect(
      formatPochiFileDisplayPath(
        "/var/folders/tmp/pochi-builtin-abc123def4567890/agents/guide/references/config-schema.md",
      ),
    ).toBe("agents/guide/references/config-schema.md");
  });

  it("shortens built-in paths from the VS Code development assets directory", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/coding/work/tabbyML/pochi.worktree/builtin-display-paths/packages/vscode/assets/skills/widget-guidelines/references",
      ),
    ).toBe("skills/widget-guidelines/references");

    expect(
      getPochiBuiltinFileDisplayInfo(
        "/Users/jueliang/coding/work/tabbyML/pochi.worktree/builtin-display-paths/packages/vscode/assets/skills/widget-guidelines/references/chart.md",
      ),
    ).toEqual({
      assetKind: "skills",
      relativePath: "widget-guidelines/references/chart.md",
      isReference: true,
    });
  });

  it("shortens project memory paths stored under the Pochi project directory", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory/project.md",
      ),
    ).toBe("projectMemory/project.md");

    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory/MEMORY.md",
      ),
    ).toBe("projectMemory/MEMORY.md");
  });

  it("shortens project transcript paths stored under the Pochi project directory", () => {
    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/projects/pochi-c212a47e71/transcripts",
      ),
    ).toBe("projectTranscripts");

    expect(
      formatPochiFileDisplayPath(
        "/Users/jueliang/.pochi/projects/pochi-c212a47e71/transcripts/0076cd6c-8fb7-4d8f-9890-4bef6171e7e1.md",
      ),
    ).toBe("projectTranscripts/0076cd6c-8fb7-4d8f-9890-4bef6171e7e1.md");
  });

  it("keeps task memory virtual file URIs unchanged", () => {
    expect(formatPochiFileDisplayPath("pochi://-/memory.md")).toBe(
      "pochi://-/memory.md",
    );
  });

  it("keeps ordinary paths unchanged", () => {
    expect(
      formatPochiFileDisplayPath("packages/vscode-webui/src/main.tsx"),
    ).toBe("packages/vscode-webui/src/main.tsx");
  });

  it("returns built-in reference metadata for display-specific labels", () => {
    expect(
      getPochiBuiltinFileDisplayInfo(
        "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/references/chart.md",
      ),
    ).toEqual({
      assetKind: "skills",
      relativePath: "widget-guidelines/references/chart.md",
      isReference: true,
    });
  });
});
