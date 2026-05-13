import { expect, test } from "vitest";
import { buildMemoryExtractionDirective } from "../task-memory";

test("task memory directive targets the task memory file URI", () => {
  const directive = buildMemoryExtractionDirective();

  expect(directive).toContain("pochi://-/memory.md");
});

test("task memory update directive targets the task memory file URI", () => {
  const directive = buildMemoryExtractionDirective("# Session Title\nExisting");

  expect(directive).toContain("pochi://-/memory.md");
});

test("task memory directive requires parallel tool calls in one response", () => {
  const directive = buildMemoryExtractionDirective();

  expect(directive).toContain("parallel tool calls");
  expect(directive).toContain("writeToFile");
  expect(directive).toContain("attemptCompletion");
  // The directive should explicitly forbid sequential turns.
  expect(directive).toContain("Do NOT wait for the writeToFile result");
});
