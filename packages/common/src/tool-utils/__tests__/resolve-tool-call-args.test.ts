import { describe, expect, it } from "vitest";
import { resolveToolCallArgs } from "../resolve-tool-call-args";

describe("resolveToolCallArgs", () => {
  const taskId = "task-123";
  const parentId = "task-parent";

  it("should replace pochi://self/ with task ID", () => {
    const input = "pochi://self/file.txt";
    const result = resolveToolCallArgs(input, taskId, parentId);
    expect(result).toBe("pochi://task-123/file.txt");
  });

  it("should replace pochi://parent/ with parent ID", () => {
    const input = "pochi://parent/file.txt";
    const result = resolveToolCallArgs(input, taskId, parentId);
    expect(result).toBe("pochi://task-parent/file.txt");
  });

  it("should throw error if parent ID is missing for pochi://parent/", () => {
    const input = "pochi://parent/file.txt";
    expect(() => resolveToolCallArgs(input, taskId, null)).toThrow(
      "Parent task ID is missing for pochi://parent/ URI",
    );
  });

  it("should handle nested objects", () => {
    const input = {
      path: "pochi://self/file.txt",
      other: "value",
    };
    const result = resolveToolCallArgs(input, taskId, parentId);
    expect(result).toEqual({
      path: "pochi://task-123/file.txt",
      other: "value",
    });
  });

  it("should handle nested arrays", () => {
    const input = ["pochi://self/file1.txt", "pochi://parent/file2.txt"];
    const result = resolveToolCallArgs(input, taskId, parentId);
    expect(result).toEqual([
      "pochi://task-123/file1.txt",
      "pochi://task-parent/file2.txt",
    ]);
  });

  it("should handle complex structures", () => {
    const input = {
      files: [
        { src: "pochi://self/src.txt", dest: "local/dest.txt" },
        { src: "pochi://parent/src.txt", dest: "pochi://self/dest.txt" },
      ],
    };
    const result = resolveToolCallArgs(input, taskId, parentId);
    expect(result).toEqual({
      files: [
        { src: "pochi://task-123/src.txt", dest: "local/dest.txt" },
        { src: "pochi://task-parent/src.txt", dest: "pochi://task-123/dest.txt" },
      ],
    });
  });
});
