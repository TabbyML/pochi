import * as assert from "assert";
import { deduplicateSnippets, type CodeSnippet } from "../code-snippets";

describe("deduplicateSnippets", () => {
  // Sample document to extract snippets from
  const document = `function calculateSum(a: number, b: number): number {
  return a + b;
}

function calculateProduct(a: number, b: number): number {
  return a * b;
}

const result = calculateSum(5, 10);`;

  it("should return an empty array if no snippets are provided", () => {
    assert.deepStrictEqual(deduplicateSnippets([]), []);
  });

  it("should return the same snippet if only one is provided", () => {
    const snippet: CodeSnippet = {
      language: "typescript",
      text: document.substring(0, 54),
      filepath: "test.ts",
      offset: 0,
      score: 1,
    };
    assert.deepStrictEqual(deduplicateSnippets([snippet]), [snippet]);
  });

  it("should not merge snippets from different files", () => {
    const snippet1: CodeSnippet = {
      language: "typescript",
      text: document.substring(0, 21),
      filepath: "test1.ts",
      offset: 0,
      score: 1,
    };
    const snippet2: CodeSnippet = {
      language: "typescript",
      text: document.substring(62, 87),
      filepath: "test2.ts",
      offset: 0,
      score: 1,
    };
    const result = deduplicateSnippets([snippet1, snippet2]).sort((a, b) =>
      a.filepath.localeCompare(b.filepath),
    );
    assert.deepStrictEqual(
      result,
      [snippet1, snippet2].sort((a, b) => a.filepath.localeCompare(b.filepath)),
    );
  });

  it("should handle non-overlapping snippets in the same file", () => {
    const snippet1: CodeSnippet = {
      language: "typescript",
      text: document.substring(0, 61),
      filepath: "test.ts",
      offset: 0,
      score: 0.8,
    };
    const snippet2: CodeSnippet = {
      language: "typescript",
      text: document.substring(63, 127),
      filepath: "test.ts",
      offset: 63,
      score: 0.9,
    };
    const result = deduplicateSnippets([snippet1, snippet2]);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], snippet2);
    assert.deepStrictEqual(result[1], snippet1);
  });
  
  it("should merge overlapping snippets in the same file", () => {
    const snippet1: CodeSnippet = {
      language: "typescript",
      text: document.substring(0, 61),
      filepath: "test.ts",
      offset: 0,
      score: 0.8,
    };
    const snippet2: CodeSnippet = {
      language: "typescript",
      text: document.substring(24, 61),
      filepath: "test.ts",
      offset: 24,
      score: 0.9,
    };
    const result = deduplicateSnippets([snippet1, snippet2]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].text, document.substring(0, 61));
    assert.strictEqual(result[0].offset, 0);
    assert.strictEqual(result[0].score, 0.9);
  });

  it("should handle multiple overlapping snippets", () => {
    const snippet1: CodeSnippet = {
      language: "typescript",
      text: document.substring(0, 61),
      filepath: "test.ts",
      offset: 0,
      score: 0.7,
    };
    const snippet2: CodeSnippet = {
      language: "typescript",
      text: document.substring(35, 88),
      filepath: "test.ts",
      offset: 35,
      score: 0.8,
    };
    const snippet3: CodeSnippet = {
      language: "typescript",
      text: document.substring(63, 118),
      filepath: "test.ts",
      offset: 63,
      score: 0.9,
    };

    const result = deduplicateSnippets([snippet1, snippet2, snippet3]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].text, document.substring(0, 118));
    assert.strictEqual(result[0].offset, 0);
    assert.strictEqual(result[0].score, 0.9);
  });

  it("should sort snippets by score in descending order", () => {
    const snippet1: CodeSnippet = {
      language: "typescript",
      text: document.substring(0, 21),
      filepath: "test.ts",
      offset: 0,
      score: 0.5,
    };
    const snippet2: CodeSnippet = {
      language: "typescript",
      text: document.substring(63, 88),
      filepath: "test.ts",
      offset: 63,
      score: 0.9,
    };
    const snippet3: CodeSnippet = {
      language: "typescript",
      text: document.substring(129, 164),
      filepath: "test.ts",
      offset: 129,
      score: 0.7,
    };
    const result = deduplicateSnippets([snippet1, snippet2, snippet3]);
    assert.deepStrictEqual(result[0], snippet2);
    assert.deepStrictEqual(result[1], snippet3);
    assert.deepStrictEqual(result[2], snippet1);
  });

});