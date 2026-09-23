import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isFileExists,
  isPlainTextFile,
  resolvePath,
  selectFileContent,
  validateRelativePath,
  validateTextFile,
} from "../fs";
import { MaxReadFileSize } from "../limits";

describe("validateTextFile", () => {
  it("should not throw an error for a plain text file", () => {
    const buffer = Buffer.from("hello world");
    expect(() => validateTextFile(buffer)).not.toThrow();
  });

  it("should throw an error for a binary file", () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02]);
    expect(() => validateTextFile(buffer)).toThrow(
      "Read binary file is not supported",
    );
  });
});

describe("isPlainTextFile", () => {
  const testFilePath = path.resolve("test-file.tmp");

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  it("should return true for a text file", async () => {
    await fs.writeFile(testFilePath, "some text");
    expect(await isPlainTextFile(testFilePath)).toBe(true);
  });

  it("should return false for a binary file", async () => {
    await fs.writeFile(
      testFilePath,
      Buffer.from([0x00, 0xde, 0xad, 0xbe, 0xef]),
    );
    expect(await isPlainTextFile(testFilePath)).toBe(false);
  });
});

describe("selectFileContent", () => {
  const content = "line 1\nline 2\nline 3\nline 4\nline 5";

  it("should select a range of lines", () => {
    const result = selectFileContent(content, { startLine: 2, endLine: 4 });
    expect(result).toEqual({
      content: "line 2\nline 3\nline 4",
      isTruncated: false,
      numLines: 3,
      startLine: 2,
      totalLines: 5,
    });
  });

  it("should add line numbers if requested", () => {
    const result = selectFileContent(content, {
      startLine: 2,
      endLine: 3,
      addLineNumbers: true,
    });
    expect(result.content).toBe("2 | line 2\n3 | line 3");
  });

  it("should truncate content that exceeds max size", () => {
    const largeContent = "a".repeat(MaxReadFileSize + 1);
    const result = selectFileContent(largeContent, {});
    expect(Buffer.byteLength(result.content, "utf-8")).toBe(MaxReadFileSize);
    expect(result.isTruncated).toBe(true);
    expect(result.numLines).toBe(1);
    expect(result.startLine).toBe(1);
    expect(result.totalLines).toBe(1);
  });

  it.each(["é", "中", "😀"])(
    "should truncate repeated %s characters by UTF-8 byte size",
    (character) => {
      const result = selectFileContent(character.repeat(MaxReadFileSize));
      const expectedLength = Math.floor(
        MaxReadFileSize / Buffer.byteLength(character, "utf-8"),
      );

      expect(result.content).toBe(character.repeat(expectedLength));
      expect(Buffer.byteLength(result.content, "utf-8")).toBeLessThanOrEqual(
        MaxReadFileSize,
      );
      expect(result.isTruncated).toBe(true);
    },
  );

  it.each([MaxReadFileSize - 1, MaxReadFileSize])(
    "should preserve multibyte content of %i bytes within the limit",
    (byteLength) => {
      const content = `中😀${"a".repeat(byteLength - 7)}`;
      const result = selectFileContent(content);

      expect(result.content).toBe(content);
      expect(result.isTruncated).toBe(false);
    },
  );

  it.each([
    { character: "é", remainingBytes: 1 },
    { character: "中", remainingBytes: 1 },
    { character: "中", remainingBytes: 2 },
    { character: "😀", remainingBytes: 1 },
    { character: "😀", remainingBytes: 2 },
    { character: "😀", remainingBytes: 3 },
  ])(
    "should omit $character when only $remainingBytes bytes remain",
    ({ character, remainingBytes }) => {
      const prefix = "a".repeat(MaxReadFileSize - remainingBytes);
      const result = selectFileContent(`${prefix}${character}tail`);

      expect(result.content).toBe(prefix);
      expect(Buffer.byteLength(result.content, "utf-8")).toBeLessThanOrEqual(
        MaxReadFileSize,
      );
      expect(result.isTruncated).toBe(true);
    },
  );

  it("should count line numbers toward the byte limit and report returned lines", () => {
    const longLine = "😀".repeat(MaxReadFileSize / 4);
    const content = `ignored\n中文\n${longLine}\nhidden\nlast`;
    const prefix = "2 | 中文\n3 | ";
    const expectedLength = Math.floor(
      (MaxReadFileSize - Buffer.byteLength(prefix, "utf-8")) / 4,
    );

    expect(
      selectFileContent(content, {
        startLine: 2,
        endLine: 4,
        addLineNumbers: true,
      }),
    ).toEqual({
      content: prefix + "😀".repeat(expectedLength),
      isTruncated: true,
      numLines: 2,
      startLine: 2,
      totalLines: 5,
    });
  });

  it("should report zero returned lines when starting past EOF", () => {
    expect(selectFileContent(content, { startLine: 10 })).toEqual({
      content: "",
      isTruncated: false,
      numLines: 0,
      startLine: 10,
      totalLines: 5,
    });
  });
});

describe("validateRelativePath", () => {
  it("should not throw for a relative path", () => {
    expect(() => validateRelativePath("some/path")).not.toThrow();
  });

  it("should throw for an absolute path", () => {
    expect(() => validateRelativePath("/abs/path")).toThrow(
      "Absolute paths are not supported: /abs/path. Please use a relative path.",
    );
  });
});

describe("resolvePath", () => {
  const cwd = "/usr/dev";

  it("should resolve a relative path", () => {
    expect(resolvePath("my/file", cwd)).toBe("/usr/dev/my/file");
  });

  it("should return an absolute path as is", () => {
    expect(resolvePath("/abs/path", cwd)).toBe("/abs/path");
  });
});

describe("isFileExists", () => {
  const existingFile = "existing-file.tmp";
  const nonExistingFile = "non-existing-file.tmp";

  beforeEach(async () => {
    await fs.writeFile(existingFile, "");
  });

  afterEach(async () => {
    await fs.unlink(existingFile);
  });

  it("should return true if the file exists", async () => {
    expect(await isFileExists(existingFile)).toBe(true);
  });

  it("should return false if the file does not exist", async () => {
    expect(await isFileExists(nonExistingFile)).toBe(false);
  });
});
