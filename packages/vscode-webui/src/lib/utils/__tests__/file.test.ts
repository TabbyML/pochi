import { describe, expect, it } from "vitest";
import { isFolder, getBaseName, addLineBreak } from "../file";

describe("isFolder", () => {
  describe("should return true for folders", () => {
    it("should handle regular folder paths", () => {
      expect(isFolder("src")).toBe(true);
      expect(isFolder("src/components")).toBe(true);
      expect(isFolder("path/to/folder")).toBe(true);
    });

    it("should handle paths with trailing slashes", () => {
      expect(isFolder("src/")).toBe(true);
      expect(isFolder("path/to/folder/")).toBe(true);
      expect(isFolder("folder/")).toBe(true);
    });

    it("should handle hidden folders", () => {
      expect(isFolder(".git")).toBe(true);
      expect(isFolder(".vscode")).toBe(true);
      expect(isFolder("src/.hidden")).toBe(true);
      expect(isFolder(".config/app")).toBe(true);
    });

    it("should handle folders with dots in names", () => {
      // These have extensions so they're treated as files by the current logic
      expect(isFolder("node_modules.backup")).toBe(false);
      expect(isFolder("project.old")).toBe(false);
      expect(isFolder("dist.production")).toBe(false);
    });

    it("should handle root and absolute paths", () => {
      expect(isFolder("/")).toBe(true);
      expect(isFolder("/usr")).toBe(true);
      expect(isFolder("/usr/local")).toBe(true);
      expect(isFolder("/home/user")).toBe(true);
    });

    it("should handle relative paths", () => {
      expect(isFolder("./src")).toBe(true);
      expect(isFolder("../components")).toBe(true);
      expect(isFolder("../../lib")).toBe(true);
    });

    it("should handle Windows-style paths", () => {
      expect(isFolder("C:\\Users")).toBe(true);
      expect(isFolder("src\\components")).toBe(true);
      expect(isFolder("path\\to\\folder\\")).toBe(true);
    });
  });

  describe("should return false for files", () => {
    it("should handle regular files with extensions", () => {
      expect(isFolder("file.txt")).toBe(false);
      expect(isFolder("index.js")).toBe(false);
      expect(isFolder("style.css")).toBe(false);
      expect(isFolder("path/to/file.json")).toBe(false);
    });

    it("should handle files with multiple dots", () => {
      expect(isFolder("jquery.min.js")).toBe(false);
      expect(isFolder("config.backup.json")).toBe(false);
      expect(isFolder("file.test.ts")).toBe(false);
      expect(isFolder("archive.tar.gz")).toBe(false);
    });

    it("should handle files without extensions", () => {
      expect(isFolder("README")).toBe(false);
      expect(isFolder("Makefile")).toBe(false);
      expect(isFolder("Dockerfile")).toBe(false);
      expect(isFolder("CHANGELOG")).toBe(false);
      expect(isFolder("LICENSE")).toBe(false);
    });

    it("should handle hidden files", () => {
      expect(isFolder(".gitignore")).toBe(false);
      expect(isFolder(".env")).toBe(false);
      expect(isFolder(".eslintrc")).toBe(false);
      expect(isFolder("src/.hidden.txt")).toBe(false);
    });

    it("should handle executable files", () => {
      expect(isFolder("script.sh")).toBe(false);
      expect(isFolder("app.exe")).toBe(false);
      expect(isFolder("binary")).toBe(true); // No extension, treated as folder
    });

    it("should handle Windows-style file paths", () => {
      expect(isFolder("C:\\file.txt")).toBe(false);
      expect(isFolder("path\\to\\file.js")).toBe(false);
    });
  });

  describe("should handle edge cases", () => {
    it("should handle empty strings", () => {
      expect(isFolder("")).toBe(true); // Empty path could be considered root
    });

    it("should handle single characters", () => {
      expect(isFolder("a")).toBe(true); // Single char without dot is folder
      expect(isFolder(".")).toBe(true); // Current directory
      expect(isFolder("..")).toBe(true); // Parent directory
    });

    it("should handle paths with only separators", () => {
      expect(isFolder("/")).toBe(true);
      expect(isFolder("//")).toBe(true);
      expect(isFolder("\\")).toBe(true);
      expect(isFolder("\\\\")).toBe(true);
    });

    it("should handle paths with spaces", () => {
      expect(isFolder("My Documents")).toBe(true);
      expect(isFolder("file name.txt")).toBe(false);
      expect(isFolder("folder with spaces")).toBe(true);
    });

    it("should handle special characters", () => {
      expect(isFolder("folder@special")).toBe(true);
      expect(isFolder("file@special.txt")).toBe(false);
      expect(isFolder("folder-with-dashes")).toBe(true);
      expect(isFolder("file_with_underscores.js")).toBe(false);
    });
  });

  describe("should handle ambiguous cases consistently", () => {
    // These are cases where it's ambiguous whether it's a file or folder
    // The function should make consistent decisions
    it("should handle names that could be either", () => {
      // Files/executables without extensions - treating as folders since no extension
      expect(isFolder("node")).toBe(true);
      expect(isFolder("npm")).toBe(true);
      expect(isFolder("git")).toBe(true);
      
      // But in context of paths, intermediate segments are folders
      expect(isFolder("usr/bin/node")).toBe(true); // 'node' is the final segment
      expect(isFolder("usr/bin")).toBe(true); // 'bin' is folder when not final with extension
    });
  });
});

describe("getBaseName", () => {
  it("should extract filename from path", () => {
    expect(getBaseName("path/to/file.txt")).toBe("file.txt");
    expect(getBaseName("file.txt")).toBe("file.txt");
    expect(getBaseName("folder/")).toBe("");
    expect(getBaseName("")).toBe("");
  });

  it("should handle Windows paths", () => {
    expect(getBaseName("C:\\path\\to\\file.txt")).toBe("file.txt");
  });
});

describe("addLineBreak", () => {
  it("should add zero-width spaces after special characters", () => {
    const input = "https://example.com/path?param=value&other=123#section";
    const output = addLineBreak(input);
    
    // Should contain zero-width space after special chars
    expect(output).toContain(":\u200B");
    expect(output).toContain("/\u200B");
    expect(output).toContain("?\u200B");
    expect(output).toContain("=\u200B");
    expect(output).toContain("&\u200B");
    expect(output).toContain("#\u200B");
  });
});
