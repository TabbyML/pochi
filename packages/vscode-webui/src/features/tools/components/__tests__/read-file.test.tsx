import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileTool as ReadFileTool } from "../read-file";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "toolInvocation.reading": "Reading ",
        "toolInvocation.readingBuiltInSkillReference":
          "Reading built-in skill reference ",
        "toolInvocation.readingBuiltInAgentReference":
          "Reading built-in agent reference ",
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
  it("shows built-in skill reference context and a short badge label", () => {
    const { container } = renderReadFileTool(
      "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/references/chart.md",
    );

    expect(container.textContent).toContain("Reading built-in skill reference");
    expect(container.textContent).toContain(
      "widget-guidelines/references/chart.md",
    );
    expect(container.textContent).not.toContain("$skills/");
  });

  it("shows built-in agent reference context and a short badge label", () => {
    const { container } = renderReadFileTool(
      "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/agents/guide/references/config-schema.md",
    );

    expect(container.textContent).toContain("Reading built-in agent reference");
    expect(container.textContent).toContain(
      "guide/references/config-schema.md",
    );
    expect(container.textContent).not.toContain("$agents/");
  });

  it("shows built-in reference context for VS Code development asset paths", () => {
    const { container } = renderReadFileTool(
      "/Users/jueliang/coding/work/tabbyML/pochi.worktree/builtin-display-paths/packages/vscode/assets/skills/widget-guidelines/references/chart.md",
    );

    expect(container.textContent).toContain("Reading built-in skill reference");
    expect(container.textContent).toContain(
      "widget-guidelines/references/chart.md",
    );
    expect(container.textContent).not.toContain("packages/vscode/assets");
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
