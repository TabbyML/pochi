import { expect, test } from "vitest";
import { createPr } from "../create-pr";

test("createPr", () => {
  expect(createPr(false)).toBe(
    `<workflow id="create-pr" path="create-pr">## Context
- Current git diff (staged and unstaged changes): !\`git diff HEAD\`
## Your task
Please use gh cli to create a  pull request</workflow>`,
  );
});

test("createPr draft", () => {
  expect(createPr(true)).toBe(
    `<workflow id="create-pr" path="create-pr">## Context
- Current git diff (staged and unstaged changes): !\`git diff HEAD\`
## Your task
Please use gh cli to create a draft pull request</workflow>`,
  );
});