import * as assert from "assert";
import { describe, it } from "mocha";
import { simpleDiff } from "../simple-diff";

describe("simpleDiff", () => {
  it("should return undefined if strings are identical", () => {
    const original = "line1\nline2\nline3";
    const modified = "line1\nline2\nline3";
    const result = simpleDiff(original, modified);
    assert.strictEqual(result, undefined);
  });

  it("should return the differing part when middle lines change", () => {
    const original = "line1\nline2\nline3";
    const modified = "line1\nchanged\nline3";
    const result = simpleDiff(original, modified, 0);
    assert.deepStrictEqual(result, {
      original: "line2",
      modified: "changed",
    });
  });

  it("should include context lines when specified", () => {
    const original = "line1\nline2\nline3\nline4\nline5";
    const modified = "line1\nline2\nchanged\nline4\nline5";
    const result = simpleDiff(original, modified, 1);
    assert.deepStrictEqual(result, {
      original: "line2\nline3\nline4",
      modified: "line2\nchanged\nline4",
    });
  });

  it("should handle changes at the beginning", () => {
    const original = "line1\nline2\nline3";
    const modified = "changed\nline2\nline3";
    const result = simpleDiff(original, modified, 0);
    assert.deepStrictEqual(result, {
      original: "line1",
      modified: "changed",
    });
  });

  it("should handle changes at the end", () => {
    const original = "line1\nline2\nline3";
    const modified = "line1\nline2\nchanged";
    const result = simpleDiff(original, modified, 0);
    assert.deepStrictEqual(result, {
      original: "line3",
      modified: "changed",
    });
  });

  it("should handle completely different strings", () => {
    const original = "a\nb\nc";
    const modified = "d\ne\nf";
    const result = simpleDiff(original, modified, 0);
    assert.deepStrictEqual(result, {
      original: "a\nb\nc",
      modified: "d\ne\nf",
    });
  });

  it("should handle additions", () => {
    const original = "line1\nline2";
    const modified = "line1\nadded\nline2";
    const result = simpleDiff(original, modified, 0);
    assert.deepStrictEqual(result, {
      original: "",
      modified: "added",
    });
  });

  it("should handle deletions", () => {
    const original = "line1\ndeleted\nline2";
    const modified = "line1\nline2";
    const result = simpleDiff(original, modified, 0);
    assert.deepStrictEqual(result, {
      original: "deleted",
      modified: "",
    });
  });

  it("should handle empty strings", () => {
    assert.strictEqual(simpleDiff("", "", 0), undefined);
    assert.deepStrictEqual(simpleDiff("", "new", 0), {
      original: "",
      modified: "new",
    });
    assert.deepStrictEqual(simpleDiff("old", "", 0), {
      original: "old",
      modified: "",
    });
  });

  it("should use default context of 2", () => {
    const original = "l1\nl2\nl3\nl4\nl5\nl6\nl7";
    const modified = "l1\nl2\nl3\nchanged\nl5\nl6\nl7";
    const result = simpleDiff(original, modified); // default context = 2
    assert.deepStrictEqual(result, {
      original: "l2\nl3\nl4\nl5\nl6",
      modified: "l2\nl3\nchanged\nl5\nl6",
    });
  });

  it("should handle context larger than available lines", () => {
    const original = "l1\nl2\nl3";
    const modified = "l1\nchanged\nl3";
    const result = simpleDiff(original, modified, 10);
    assert.deepStrictEqual(result, {
      original: "l1\nl2\nl3",
      modified: "l1\nchanged\nl3",
    });
  });

  it("should handle overlapping context from start and end", () => {
    const original = "l1\nl2\nl3\nl4\nl5";
    const modified = "l1\nl2\nchanged\nl4\nl5";
    // originalDiffStart=2, originalDiffEnd=3. context=5.
    // originalStart = max(0, 2-5) = 0.
    // originalEnd = min(5, 3+5) = 5.
    const result = simpleDiff(original, modified, 5);
    assert.deepStrictEqual(result, {
      original: "l1\nl2\nl3\nl4\nl5",
      modified: "l1\nl2\nchanged\nl4\nl5",
    });
  });
});
