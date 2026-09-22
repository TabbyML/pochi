import { prompts } from "@getpochi/common";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageMarkdown, hideUserInvokedSkillInstructions } from "./markdown";

vi.mock("@/features/chat", () => ({
  useReplaceJobIdsInContent: () => (content: string) => content,
}));

vi.mock("@/features/tools", () => ({
  FileBadge: ({ label }: { label: string }) => <span>{label}</span>,
  IssueBadge: () => null,
  BackgroundJobOutputBadge: ({ path }: { path: string }) => (
    <span data-testid="background-job-output-badge">{path}</span>
  ),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
  vscodeHost: {},
}));

describe("MessageMarkdown", () => {
  it("renders text following a directly invoked skill", () => {
    const skillPrompt = prompts.skill({
      name: "find-skills",
      description: "Find skills",
      filePath: "/skills/find-skills.md",
      instructions: "# Find Skills\n\nRun `npx skills find <query>`.",
    });

    render(<MessageMarkdown>{`${skillPrompt}这个干啥的`}</MessageMarkdown>);

    const skillBadge = screen.getByText("/find-skills");
    expect(skillBadge).toBeTruthy();
    expect(skillBadge.parentElement?.textContent).toContain(
      "/find-skills这个干啥的",
    );
  });

  it.each([
    "/Users/me/.pochi/tasks/task-1/background-jobs/bgjob-cmd-abc.log",
    "C:\\Users\\me\\.pochi\\tasks\\task-1\\background-jobs\\bgjob-cmd-abc.log",
    "background-jobs/bgjob-cmd-abc.log",
    "pochi://~/background-jobs/bgjob-cmd-abc.log",
    "/Users/me/.pochi/terminals/term-abc.log",
    "pochi://terminals/term-abc.log",
  ])("renders the standalone transcript %s as a job output badge", (path) => {
    render(<MessageMarkdown>{`output at \`${path}\``}</MessageMarkdown>);

    expect(screen.getByTestId("background-job-output-badge").textContent).toBe(
      path,
    );
  });

  it.each([
    "tail -f /tmp/background-jobs/bgjob-cmd-abc.log",
    "cat pochi://~/background-jobs/bgjob-cmd-abc.log",
    "Get-Content C:\\tmp\\background-jobs\\bgjob-cmd-abc.log",
    "tail -f /Users/me/.pochi/terminals/term-abc.log",
    "https://example.com/background-jobs/bgjob-cmd-abc.log",
    "https://example.com/terminals/term-abc.log",
    "file:///tmp/background-jobs/bgjob-cmd-abc.log",
  ])("keeps the non-path snippet %s as inline code", (snippet) => {
    const { container } = render(
      <MessageMarkdown>{`\`${snippet}\``}</MessageMarkdown>,
    );

    expect(container.querySelector("code.inline-code")?.textContent).toBe(
      snippet,
    );
    expect(
      container.querySelector('[data-testid="background-job-output-badge"]'),
    ).toBeNull();
  });

  it("does not rewrite ordinary skill tag examples", () => {
    const example = `<skill id="example">Keep these instructions</skill>`;

    expect(hideUserInvokedSkillInstructions(example)).toBe(example);
  });
});
