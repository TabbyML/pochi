import { describe, expect, it } from "vitest";
import { resolvePochiUri, resolveToolCallArgs } from "../resolve-tool-call-args";

describe("resolvePochiUri", () => {
  const taskId = "task-123";

  it("should replace /-/ with task ID in pochi: URIs", () => {
    expect(resolvePochiUri("pochi://-/file.txt", taskId)).toBe("pochi://task-123/file.txt");
    expect(resolvePochiUri("pochi:/-/another/path.ts", taskId)).toBe("pochi:/task-123/another/path.ts");
  });

  it("should not change URIs without /-/", () => {
    expect(resolvePochiUri("pochi://other-task/file.txt", taskId)).toBe("pochi://other-task/file.txt");
  });

  it("should not change non-pochi URIs", () => {
    expect(resolvePochiUri("/absolute/path/file.txt", taskId)).toBe("/absolute/path/file.txt");
    expect(resolvePochiUri("relative/path.txt", taskId)).toBe("relative/path.txt");
    expect(resolvePochiUri("https://example.com", taskId)).toBe("https://example.com");
  });
});

describe("resolveToolCallArgs", () => {
  const taskId = "task-123";

  it("should resolve strings in a flat object", () => {
    const input = {
      path: "pochi://-/file.txt",
      other: "value",
      count: 123,
    };
    const result = resolveToolCallArgs(input, taskId);
    expect(result).toEqual({
      path: "pochi://task-123/file.txt",
      other: "value",
      count: 123,
    });
  });

  it("should return non-object inputs as is", () => {
    expect(resolveToolCallArgs("pochi://-/file.txt", taskId)).toBe("pochi://-/file.txt");
    expect(resolveToolCallArgs(123, taskId)).toBe(123);
    expect(resolveToolCallArgs(null, taskId)).toBe(null);
  });

  it("should handle objects with no pochi URIs", () => {
    const input = { a: 1, b: "c" };
    expect(resolveToolCallArgs(input, taskId)).toEqual(input);
  });

  it("should handle arrays", () => {
    const input = ["pochi://-/file1.txt", "pochi://-/file2.txt"];
    const result = resolveToolCallArgs(input, taskId);
    // If it's an array, we expect it to still be an array (or at least handle it correctly)
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([
      "pochi://task-123/file1.txt",
      "pochi://task-123/file2.txt",
    ]);
  });
});
