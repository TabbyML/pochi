import { expect, test } from "vitest";
import {
  TaskMemoryFileUri,
  buildMemoryExtractionDirective,
} from "../task-memory";

test("task memory directive targets the task memory file URI", () => {
  const directive = buildMemoryExtractionDirective();

  expect(directive).toContain(TaskMemoryFileUri);
});

test("task memory update directive targets the task memory file URI", () => {
  const directive = buildMemoryExtractionDirective("# Session Title\nExisting");

  expect(directive).toContain(TaskMemoryFileUri);
});

test("task memory directive requires writing before completion", () => {
  const directive = buildMemoryExtractionDirective();

  expect(directive).toContain("writeToFile");
  expect(directive).toContain("attemptCompletion");
  expect(directive).toContain("After the writeToFile result is available");
  expect(directive).toContain(
    "Do NOT call attemptCompletion in the same assistant message as writeToFile",
  );
  expect(directive).not.toContain("parallel tool calls");
  expect(directive).not.toContain("PARALLEL");
  expect(directive).not.toContain("Do NOT wait for the writeToFile result");
});
