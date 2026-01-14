import { createWorkflowPrompt } from "./workflow";

export function createPr(isDraft?: boolean) {
  return createWorkflowPrompt(
    "create-pr",
    "create-pr",
    `## Context

- Current git diff (staged and unstaged changes): !\`git diff HEAD\`

## Your task

Please use gh cli to create a ${isDraft ? "draft" : ""} pull request`.trim(),
  );
}
