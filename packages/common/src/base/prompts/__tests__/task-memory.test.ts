import { expect, test } from "vitest";
import { buildMemoryExtractionDirective } from "../task-memory";

test("task memory directive writes to the task file URI", () => {
  const directive = buildMemoryExtractionDirective();

  expect(directive).toContain(
    "Use writeToFile with path pochi://-/memory.md",
  );
});

test("task memory update directive writes to the task file URI", () => {
  const directive = buildMemoryExtractionDirective("# Session Title\nExisting");

  expect(directive).toContain(
    "Use writeToFile with path pochi://-/memory.md",
  );
});
