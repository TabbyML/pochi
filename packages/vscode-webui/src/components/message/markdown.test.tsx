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

  it("renders a background job transcript path as a job output badge", () => {
    const path =
      "/Users/me/.pochi/tasks/task-1/background-jobs/bgjob-cmd-abc.log";

    render(<MessageMarkdown>{`output at \`${path}\``}</MessageMarkdown>);

    expect(screen.getByTestId("background-job-output-badge").textContent).toBe(
      path,
    );
  });

  it("does not rewrite ordinary skill tag examples", () => {
    const example = `<skill id="example">Keep these instructions</skill>`;

    expect(hideUserInvokedSkillInstructions(example)).toBe(example);
  });
});
