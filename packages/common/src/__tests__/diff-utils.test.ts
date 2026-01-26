import { describe, it, expect } from "vitest";
import {
  parseDiffAndApply,
  processMultipleDiffs,
  DiffError,
} from "../diff-utils";

describe("diff-utils", () => {
  describe("parseDiffAndApply", () => {
    describe("searchContentExact function", () => {
      it("should find exact matches", async () => {
        const fileContent = `function hello() {
  console.log("Hello, World!");
}

function goodbye() {
  console.log("Goodbye!");
}`;

        const searchContent = `function hello() {
  console.log("Hello, World!");
}`;

        const replaceContent = `function hello() {
  console.log("Hello, Universe!");
}`;

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toContain("Hello, Universe!");
        expect(result).not.toContain("Hello, World!");
      });

      it("should find multiple exact matches when expectedReplacements is specified", async () => {
        const fileContent = `const x = 1;
const y = 1;
const z = 1;`;

        const searchContent = "const x = 1;";
        const replaceContent = "const x = 2;";

        // This should find only one exact match
        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
          1,
        );

        expect(result).toBe(`const x = 2;
const y = 1;
const z = 1;`);
      });

      it("should handle empty search content for new files", async () => {
        const fileContent = "";
        const searchContent = "";
        const replaceContent = "console.log('Hello World');";

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toBe("console.log('Hello World');");
      });

      it("should find exact matches with special characters", async () => {
        const fileContent = `const regex = /hello.*world/g;
const string = "test";`;

        const searchContent = "const regex = /hello.*world/g;";
        const replaceContent = "const regex = /hello.*universe/g;";

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toContain("/hello.*universe/g");
      });

      it("should handle CRLF line endings", async () => {
        const fileContent = "line1\r\nline2\r\nline3";
        const searchContent = "line2";
        const replaceContent = "modified_line2";

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toBe("line1\r\nmodified_line2\r\nline3");
      });
    });

    describe("searchContentWithLineTrimmed function", () => {
      it("should find matches ignoring leading and trailing whitespace", async () => {
        const fileContent = `  function hello() {
    console.log("Hello!");
  }`;

        const searchContent = `function hello() {
  console.log("Hello!");
}`;

        const replaceContent = `function hello() {
  console.log("Hi there!");
}`;

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toContain("Hi there!");
      });

      it("should handle mixed indentation levels", async () => {
        const fileContent = `if (condition) {
    console.log("inside if");
        console.log("nested");
}`;

        const searchContent = `console.log("inside if");
console.log("nested");`;

        const replaceContent = `console.log("modified if");
console.log("modified nested");`;

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toContain("modified if");
        expect(result).toContain("modified nested");
      });

      it("should match when original has extra whitespace", async () => {
        const fileContent = `function test() {
      let x = 1;   
    let y = 2;
}`;

        const searchContent = `let x = 1;
let y = 2;`;

        const replaceContent = `let x = 10;
let y = 20;`;

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toContain("let x = 10;");
        expect(result).toContain("let y = 20;");
      });

      it("should handle empty lines in search content", async () => {
        const fileContent = `function start() {

  console.log("test");

}`;

        const searchContent = `
console.log("test");
`;

        const replaceContent = `
console.log("modified");
`;

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toContain("modified");
      });

      it("should handle trailing newlines correctly", async () => {
        const fileContent = `line1
line2
line3`;

        const searchContent = `line2
line3`;

        const replaceContent = `modified_line2
modified_line3`;

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toBe(`line1
modified_line2
modified_line3`);
      });
    });

    describe("searchContentByBlockAnchor function", () => {
      it("should not use block anchor for content with insufficient similarity", async () => {
        // Block anchor requires 0.0 similarity threshold, meaning exact matches
        // This test demonstrates that block anchor won't match when content differs
        const fileContent = `function processData(data) {
  // Validate input
  if (!data) {
    throw new Error("Invalid data");
  }
  
  // Process the data
  const result = data.map(item => {
    return item.value * 2;
  });
  
  return result;
}`;

        // Use search content with different middle content that won't match block anchor
        const searchContent = `function processData(data) {
  // Different comment
  if (!data) {
    throw new Error("Different error");
  }
}`;

        const replaceContent = `function processData(data) {
  // Enhanced validation
  if (!data) {
    throw new Error("Data is required");
  }
}`;

        // This should fail because none of the search functions will find a match
        await expect(
          parseDiffAndApply(fileContent, searchContent, replaceContent),
        ).rejects.toThrow(DiffError);
      });

      it("should validate block anchor requires 3+ lines", async () => {
        // Block anchor only works with 3+ lines, so shorter blocks should be ignored
        const fileContent = `const x = 1;
const y = 2;`;

        // Only 2 lines - block anchor won't be used
        const searchContent = `const x = 1;
const y = 3;`; // Intentionally different

        const replaceContent = `const x = 10;
const y = 30;`;

        // Should fail since exact and line-trimmed won't match, and block anchor is skipped
        await expect(
          parseDiffAndApply(fileContent, searchContent, replaceContent),
        ).rejects.toThrow(DiffError);
      });

      it("should handle multiple candidates and choose best match", async () => {
        const fileContent = `function first() {
  console.log("start");
  let x = 1;
  console.log("end");
}

function second() {
  console.log("start");
  let y = 2;
  console.log("end");
}`;

        const searchContent = `function first() {
  console.log("start");
  let x = 1;
  console.log("end");
}`;

        const replaceContent = `function first() {
  console.log("begin");
  let x = 10;
  console.log("finish");
}`;

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toContain("let x = 10;");
        expect(result).toContain("let y = 2;"); // Second function should remain unchanged
      });

      it("should not match blocks with less than 3 lines", async () => {
        const fileContent = `let a = 1;
let b = 2;`;

        const searchContent = `let a = 1;
let b = 3;`; // Intentionally different

        const replaceContent = `let a = 10;
let b = 30;`;

        // Should throw error since block anchor won't match and exact/trimmed won't either
        await expect(
          parseDiffAndApply(fileContent, searchContent, replaceContent),
        ).rejects.toThrow(DiffError);
      });

      it("should handle blocks with similar but not identical content", async () => {
        const fileContent = `try {
  const data = fetchData();
  processData(data);
  saveData(data);
} catch (error) {
  console.log("Error occurred");
}`;

        const searchContent = `try {
  const info = fetchData();
  processData(info);
  saveData(info);
} catch (err) {
  console.log("Error happened");
}`;

        const replaceContent = `try {
  const info = getData();
  handleData(info);
  storeData(info);
} catch (err) {
  console.log("Error handled");
}`;

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toContain("getData()");
        expect(result).toContain("handleData");
        expect(result).toContain("storeData");
      });
    });

    describe("error handling and edge cases", () => {
      it("should throw error when search and replace content are identical", async () => {
        const fileContent = "test content";
        const searchContent = "test";
        const replaceContent = "test";

        await expect(
          parseDiffAndApply(fileContent, searchContent, replaceContent),
        ).rejects.toThrow(DiffError);
      });

      it("should throw error when using empty search on non-empty file", async () => {
        const fileContent = "existing content";
        const searchContent = "";
        const replaceContent = "new content";

        await expect(
          parseDiffAndApply(fileContent, searchContent, replaceContent),
        ).rejects.toThrow(DiffError);
      });

      it("should throw error when search content is not found", async () => {
        const fileContent = "const x = 1;";
        const searchContent = "const y = 2;";
        const replaceContent = "const y = 3;";

        await expect(
          parseDiffAndApply(fileContent, searchContent, replaceContent),
        ).rejects.toThrow(DiffError);
      });

      it("should throw error when expectedReplacements doesn't match actual matches", async () => {
        const fileContent = `const x = 1;
const x = 1;`;

        const searchContent = "const x = 1;";
        const replaceContent = "const x = 2;";

        // Expecting 1 replacement but there are 2 matches
        await expect(
          parseDiffAndApply(fileContent, searchContent, replaceContent, 1),
        ).rejects.toThrow(DiffError);
      });

      it("should handle content with only whitespace", async () => {
        const fileContent = "   \n  \n   ";
        const searchContent = "   ";
        const replaceContent = "content";

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
          2, // Expect 2 matches since there are 2 occurrences of "   "
        );

        expect(result).toContain("content");
      });

      it("should handle unicode characters", async () => {
        const fileContent = "const message = '你好世界';";
        const searchContent = "const message = '你好世界';";
        const replaceContent = "const message = 'Hello World';";

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toBe("const message = 'Hello World';");
      });

      it("should handle very long content", async () => {
        const longLine = "a".repeat(10000);
        const fileContent = `start
${longLine}
end`;

        const searchContent = longLine;
        const replaceContent = "short";

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
        );

        expect(result).toBe(`start
short
end`);
      });
    });

    describe("multiple replacements", () => {
      it("should handle multiple exact matches with correct expectedReplacements", async () => {
        const fileContent = `const debug = true;
console.log("debug mode");
const debug = true;`;

        const searchContent = "const debug = true;";
        const replaceContent = "const debug = false;";

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
          2, // Expect 2 replacements
        );

        expect(result).toBe(`const debug = false;
console.log("debug mode");
const debug = false;`);
      });

      it("should combine different search strategies for multiple matches", async () => {
        const fileContent = `  function test() {
    return 1;
  }
  
function test() {
  return 1;
}`;

        const searchContent = `function test() {
  return 1;
}`;

        const replaceContent = `function test() {
  return 2;
}`;

        const result = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
          3, // All matches: exact, trimmed, and potentially block anchor
        );

        expect(result).toContain("return 2;");
        expect(result).not.toContain("return 1;");
      });
    });
  });

  describe("processMultipleDiffs", () => {
    it("should apply multiple diffs sequentially", async () => {
      const fileContent = `function greet(name) {
  console.log("Hello " + name);
  return "greeting";
}`;

      const edits = [
        {
          searchContent: 'console.log("Hello " + name);',
          replaceContent: 'console.log(`Hello ${name}!`);',
        },
        {
          searchContent: 'return "greeting";',
          replaceContent: 'return `Hello ${name}!`;',
        },
      ];

      const result = await processMultipleDiffs(fileContent, edits);

      expect(result).toContain("console.log(`Hello ${name}!`);");
      expect(result).toContain("return `Hello ${name}!`;");
    });

    it("should handle edits with expectedReplacements", async () => {
      const fileContent = `const x = 1;
const y = 1;
const z = 2;`;

      const edits = [
        {
          searchContent: "const x = 1;",
          replaceContent: "const x = 10;",
          expectedReplacements: 1,
        },
        {
          searchContent: "const z = 2;",
          replaceContent: "const z = 20;",
        },
      ];

      const result = await processMultipleDiffs(fileContent, edits);

      expect(result).toBe(`const x = 10;
const y = 1;
const z = 20;`);
    });

    it("should fail if any edit in sequence fails", async () => {
      const fileContent = "const x = 1;";

      const edits = [
        {
          searchContent: "const x = 1;",
          replaceContent: "const x = 10;",
        },
        {
          searchContent: "const y = 2;", // This doesn't exist
          replaceContent: "const y = 20;",
        },
      ];

      await expect(processMultipleDiffs(fileContent, edits)).rejects.toThrow(
        DiffError,
      );
    });

    it("should handle empty edits array", async () => {
      const fileContent = "unchanged content";
      const edits: Array<{
        searchContent: string;
        replaceContent: string;
        expectedReplacements?: number;
      }> = [];

      const result = await processMultipleDiffs(fileContent, edits);

      expect(result).toBe("unchanged content");
    });
  });

  describe("DiffError", () => {
    it("should create DiffError with correct name and message", () => {
      const error = new DiffError("Test error message");

      expect(error.name).toBe("DiffError");
      expect(error.message).toBe("Test error message");
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("multiple line editing with processMultipleDiffs", () => {
    it("should not insert extra empty lines when applying multiple diffs", async () => {
      const fileContent = `function example() {
  const a = 1;
  const b = 2;
  const c = 3;
}`;

      const edits = [
        {
          searchContent: "const a = 1;",
          replaceContent: "const a = 10;",
        },
        {
          searchContent: "const b = 2;",
          replaceContent: "const b = 20;",
        },
      ];

      const result = await processMultipleDiffs(fileContent, edits);

      // Should not have extra empty lines
      expect(result).toBe(`function example() {
  const a = 10;
  const b = 20;
  const c = 3;
}`);
    });

    it("should not insert extra empty lines when using line-trimmed search", async () => {
      const fileContent = `function test() {
    const x = 1;
    const y = 2;
    return x + y;
}`;

      // Search content with different indentation (will use line-trimmed search)
      const edits = [
        {
          searchContent: "const x = 1;",
          replaceContent: "const x = 100;",
        },
        {
          searchContent: "const y = 2;",
          replaceContent: "const y = 200;",
        },
      ];

      const result = await processMultipleDiffs(fileContent, edits);

      // Count newlines - should be exactly 4 (same as original)
      const originalNewlines = (fileContent.match(/\n/g) || []).length;
      const resultNewlines = (result.match(/\n/g) || []).length;

      expect(resultNewlines).toBe(originalNewlines);
      expect(result).toContain("const x = 100;");
      expect(result).toContain("const y = 200;");
    });

    it("should preserve exact structure when applying multiline search with line-trimmed matching", async () => {
      const fileContent = `class MyClass {
  method1() {
    console.log("first");
  }

  method2() {
    console.log("second");
  }
}`;

      // Search with different indentation - should use line-trimmed search
      const searchContent = `method1() {
  console.log("first");
}`;

      const replaceContent = `method1() {
  console.log("updated first");
}`;

      const result = await parseDiffAndApply(
        fileContent,
        searchContent,
        replaceContent,
      );

      // Verify no extra empty lines are lost - the empty line between method1 and method2 should remain
      const originalLines = fileContent.split("\n").length;
      const resultLines = result.split("\n").length;

      expect(resultLines).toBe(originalLines);
      expect(result).toContain('console.log("updated first")');
      expect(result).toContain('console.log("second")');
      // Verify the empty line separator is preserved
      expect(result).toContain("}\n\n  method2");
    });

    it("should not duplicate content when applying sequential diffs with line-trimmed matching", async () => {
      const fileContent = `export function processData() {
  const input = getData();
  const output = transform(input);
  return output;
}`;

      const edits = [
        {
          searchContent: "const input = getData();",
          replaceContent: "const input = fetchData();",
        },
        {
          searchContent: "const output = transform(input);",
          replaceContent: "const output = process(input);",
        },
      ];

      const result = await processMultipleDiffs(fileContent, edits);

      expect(result).toBe(`export function processData() {
  const input = fetchData();
  const output = process(input);
  return output;
}`);
    });

    it("should preserve structure when using block anchor matching strategy", async () => {
      // This test uses a block that will trigger block anchor matching (3+ lines with similar structure)
      const fileContent = `class Handler {
  handleRequest(req) {
    const data = parseRequest(req);
    const result = processData(data);
    return formatResponse(result);
  }

  handleError(err) {
    console.log(err);
  }
}`;

      // Search with slightly different middle content - will use block anchor
      const searchContent = `handleRequest(req) {
    const info = parseRequest(req);
    const output = processData(info);
    return formatResponse(output);
  }`;

      const replaceContent = `handleRequest(req) {
    const input = validateRequest(req);
    const output = handleData(input);
    return sendResponse(output);
  }`;

      const result = await parseDiffAndApply(
        fileContent,
        searchContent,
        replaceContent,
      );

      // Verify the empty line separator between methods is preserved
      const originalLines = fileContent.split("\n").length;
      const resultLines = result.split("\n").length;

      expect(resultLines).toBe(originalLines);
      expect(result).toContain("validateRequest");
      expect(result).toContain("handleData");
      expect(result).toContain("sendResponse");
      // The empty line between handleRequest and handleError should be preserved
      expect(result).toContain("}\n\n  handleError");
    });

    it("should preserve trailing empty line when file ends with empty line", async () => {
      // File content with trailing newline (empty line at end)
      const fileContent = `function test() {
  return 1;
}
`;

      const searchContent = "return 1;";
      const replaceContent = "return 2;";

      const result = await parseDiffAndApply(
        fileContent,
        searchContent,
        replaceContent,
      );

      // The trailing newline should be preserved
      expect(result).toBe(`function test() {
  return 2;
}
`);
      expect(result.endsWith("\n")).toBe(true);
    });

    it("should preserve trailing empty line when using line-trimmed matching", async () => {
      // File content with trailing newline
      const fileContent = `class MyClass {
    doSomething() {
        console.log("hello");
    }
}
`;

      // Search with different indentation
      const searchContent = `doSomething() {
    console.log("hello");
}`;

      const replaceContent = `doSomething() {
    console.log("world");
}`;

      const result = await parseDiffAndApply(
        fileContent,
        searchContent,
        replaceContent,
      );

      // The trailing newline should be preserved
      expect(result.endsWith("\n")).toBe(true);
    });

    it("should not delete trailing empty line when match is at end of file", async () => {
      const fileContent = `const a = 1;
const b = 2;
`;

      const searchContent = "const b = 2;";
      const replaceContent = "const b = 3;";

      const result = await parseDiffAndApply(
        fileContent,
        searchContent,
        replaceContent,
      );

      expect(result).toBe(`const a = 1;
const b = 3;
`);
    });

    it("should preserve multiple trailing empty lines", async () => {
      // File with multiple trailing newlines
      const fileContent = "const x = 1;\nconst y = 2;\n\n\n";

      const searchContent = "const x = 1;";
      const replaceContent = "const x = 10;";

      const result = await parseDiffAndApply(
        fileContent,
        searchContent,
        replaceContent,
      );

      // Should preserve all 3 trailing newlines
      expect(result).toBe("const x = 10;\nconst y = 2;\n\n\n");
      expect(result.endsWith("\n\n\n")).toBe(true);
    });

    it("should preserve multiple trailing empty lines with CRLF", async () => {
      // File with multiple trailing CRLF newlines
      const fileContent = "const x = 1;\r\nconst y = 2;\r\n\r\n\r\n";

      const searchContent = "const x = 1;";
      const replaceContent = "const x = 10;";

      const result = await parseDiffAndApply(
        fileContent,
        searchContent,
        replaceContent,
      );

      // Should preserve all 3 trailing CRLF newlines
      expect(result).toBe("const x = 10;\r\nconst y = 2;\r\n\r\n\r\n");
      expect(result.endsWith("\r\n\r\n\r\n")).toBe(true);
    });
  });
});