import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileTool as ReadFileTool } from "../read-file";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "toolInvocation.reading": "Reading ",
        "toolInvocation.readingBuiltInSkill": "Reading built-in skill",
        "toolInvocation.readingBuiltInAgent": "Reading built-in agent",
      })[key] ?? key,
  }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <span data-testid="status-icon" />,
}));

vi.mock("../tool-container", () => ({
  ExpandableToolContainer: ({ title }: { title: React.ReactNode }) => (
    <div>{title}</div>
  ),
}));

vi.mock("../file-badge", () => ({
  FileBadge: ({ label, path }: { label?: string; path: string }) => (
    <span>{label || path}</span>
  ),
}));

const renderReadFileTool = (path: string) =>
  render(
    <ReadFileTool
      tool={{
        type: "tool-readFile",
        toolCallId: "call-1",
        state: "input-available",
        input: { path },
      }}
      isExecuting={false}
      isLoading={false}
      messages={[]}
    />,
  );

describe("readFileTool", () => {
  it("shows built-in skill context with the skill name and relative file path", () => {
    const { container } = renderReadFileTool(
      "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/references/chart.md",
    );

    expect(container.textContent).toContain(
      "Reading built-in skill widget-guidelines references/chart.md",
    );
    expect(container.textContent).not.toContain("(file ");
    expect(container.textContent).not.toContain("skill reference");
    expect(container.textContent).not.toContain(
      "widget-guidelines/references/chart.md",
    );
    expect(container.textContent).not.toContain("$skills/");

    const highlightedName = container.querySelector("span.font-medium");
    expect(highlightedName?.textContent).toBe("widget-guidelines");
  });

  it("shows built-in agent context with the agent name and relative file path", () => {
    const { container } = renderReadFileTool(
      "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/agents/guide/references/config-schema.md",
    );

    expect(container.textContent).toContain(
      "Reading built-in agent guide references/config-schema.md",
    );
    expect(container.textContent).not.toContain("(file ");
    expect(container.textContent).not.toContain("agent reference");
    expect(container.textContent).not.toContain(
      "guide/references/config-schema.md",
    );
    expect(container.textContent).not.toContain("$agents/");
  });

  it("shows built-in file context for VS Code development asset paths", () => {
    const { container } = renderReadFileTool(
      "/Users/jueliang/coding/work/tabbyML/pochi.worktree/builtin-display-paths/packages/vscode/assets/skills/widget-guidelines/references/chart.md",
    );

    expect(container.textContent).toContain(
      "Reading built-in skill widget-guidelines references/chart.md",
    );
    expect(container.textContent).not.toContain("packages/vscode/assets");
  });

  it("does not require built-in files to live under references", () => {
    const { container } = renderReadFileTool(
      "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/SKILL.md",
    );

    expect(container.textContent).toContain(
      "Reading built-in skill widget-guidelines SKILL.md",
    );
    expect(container.textContent).not.toContain("(file ");
    expect(container.textContent).not.toContain("skill reference");
  });

  it("keeps normal file reads unchanged", () => {
    const { container } = renderReadFileTool(
      "packages/vscode-webui/src/main.tsx",
    );

    expect(container.textContent).toContain("Reading ");
    expect(container.textContent).toContain(
      "packages/vscode-webui/src/main.tsx",
    );
  });
});
