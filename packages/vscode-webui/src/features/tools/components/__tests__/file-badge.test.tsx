import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileBadge } from "../file-badge";

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    openFile: vi.fn(),
    showCheckpointDiff: vi.fn(),
  },
}));

const visibleText = (container: HTMLElement) =>
  container.textContent?.replace(/\u200B/g, "") ?? "";

describe("FileBadge", () => {
  const originalPochiHomeDir = globalThis.POCHI_HOME_DIR;

  beforeEach(() => {
    globalThis.POCHI_HOME_DIR = "/Users/jueliang";
  });

  afterEach(() => {
    globalThis.POCHI_HOME_DIR = originalPochiHomeDir;
  });

  it("shortens built-in skill reference paths from VS Code extension assets", () => {
    const { container } = render(
      <FileBadge path="/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/references/chart.md" />,
    );

    expect(visibleText(container)).toContain(
      "pochi://skills/widget-guidelines/references/chart.md",
    );
  });

  it("shortens built-in agent reference paths from VS Code extension assets", () => {
    const { container } = render(
      <FileBadge path="/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/agents/guide/references/config-schema.md" />,
    );

    expect(visibleText(container)).toContain(
      "pochi://agents/guide/references/config-schema.md",
    );
  });

  it("shortens built-in paths from VS Code development assets", () => {
    const { container } = render(
      <FileBadge
        isDirectory
        path="/Users/jueliang/coding/work/tabbyML/pochi.worktree/builtin-paths/packages/vscode/assets/skills/widget-guidelines/references"
      />,
    );

    expect(visibleText(container)).toContain(
      "pochi://skills/widget-guidelines/references",
    );
  });

  it("shortens project memory paths from Pochi project storage", () => {
    const { container } = render(
      <FileBadge path="/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory/project.md" />,
    );

    expect(visibleText(container)).toContain("pochi://$/memory/project.md");
    expect(visibleText(container)).not.toContain("/.pochi/projects/");
  });

  it("shortens project transcript paths from Pochi project storage", () => {
    const { container } = render(
      <FileBadge path="/Users/jueliang/.pochi/projects/pochi-c212a47e71/transcripts/0076cd6c-8fb7-4d8f-9890-4bef6171e7e1.md" />,
    );

    expect(visibleText(container)).toContain(
      "pochi://$/transcripts/0076cd6c-8fb7-4d8f-9890-4bef6171e7e1.md",
    );
    expect(visibleText(container)).not.toContain("/.pochi/projects/");
  });

  it("shortens virtual built-in and project memory URIs", () => {
    const skill = render(
      <FileBadge path="pochi://skills/widget-guidelines/references/interactive.md" />,
    );
    expect(visibleText(skill.container)).toContain(
      "pochi://skills/widget-guidelines/references/interactive.md",
    );

    const projectMemory = render(
      <FileBadge path="pochi://$/memory/llm-training.md" />,
    );
    expect(visibleText(projectMemory.container)).toContain(
      "pochi://$/memory/llm-training.md",
    );
  });

  it("shortens task tool result paths from Pochi task storage", () => {
    const { container } = render(
      <FileBadge path="/Users/jueliang/.pochi/tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb/tool-results/executeCommand-HsqmmmQnwJuB1Jtz-output.log" />,
    );

    expect(visibleText(container)).toContain(
      "pochi://~/tool-results/executeCommand-HsqmmmQnwJuB1Jtz-output.log",
    );
  });

  it("shortens unmatched Pochi home paths with the global display prefix", () => {
    const { container } = render(
      <FileBadge path="/Users/jueliang/.pochi/tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb" />,
    );

    expect(visibleText(container)).toContain(
      "pochi://tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb",
    );
  });

  it("keeps task memory virtual file URIs unchanged", () => {
    const { container } = render(<FileBadge path="pochi://-/memory.md" />);

    expect(visibleText(container)).toContain("pochi://-/memory.md");
  });

  it("renders the full line range when both startLine and endLine are provided", () => {
    const { container } = render(
      <FileBadge path="src/main.tsx" startLine={10} endLine={60} />,
    );

    expect(visibleText(container)).toContain("src/main.tsx:10-60");
  });

  it("renders a single line when startLine equals endLine", () => {
    const { container } = render(
      <FileBadge path="src/main.tsx" startLine={42} endLine={42} />,
    );

    expect(visibleText(container)).toContain("src/main.tsx:42");
  });

  it("renders an open-ended range when only startLine is provided", () => {
    const { container } = render(
      <FileBadge path="src/main.tsx" startLine={10} />,
    );

    expect(visibleText(container)).toContain("src/main.tsx:10-");
  });

  it("renders a range from the beginning when only endLine is provided", () => {
    const { container } = render(
      <FileBadge path="src/main.tsx" endLine={60} />,
    );

    expect(visibleText(container)).toContain("src/main.tsx:1-60");
  });

  it("renders no line range when neither startLine nor endLine is provided", () => {
    const { container } = render(<FileBadge path="src/main.tsx" />);

    expect(visibleText(container)).toContain("src/main.tsx");
    expect(visibleText(container)).not.toContain(":");
  });

  it("keeps normal paths and explicit labels unchanged", () => {
    const normal = render(
      <FileBadge path="packages/vscode-webui/src/main.tsx" />,
    );
    expect(visibleText(normal.container)).toContain(
      "packages/vscode-webui/src/main.tsx",
    );

    const labeled = render(
      <FileBadge
        label="custom label"
        path="/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/references/chart.md"
      />,
    );
    expect(visibleText(labeled.container)).toContain("custom label");
  });
});
